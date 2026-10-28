const MODEL = "gemini-2.5-flash-preview-tts";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

const MAX_ATTEMPTS = 5;
const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 30_000;

// Gemini returns headerless PCM and only advertises the sample rate in the
// mimeType ("audio/L16;codec=pcm;rate=24000"). Fall back to the documented
// default if a future response omits it.
const DEFAULT_SAMPLE_RATE = 24_000;

class TtsError extends Error {
  constructor(message, { retryable = false } = {}) {
    super(message);
    this.name = "TtsError";
    this.retryable = retryable;
  }
}

/**
 * The prompt is a bare word, which the model is otherwise liable to comment on
 * or translate. A short instruction plus the deck's own language label keeps it
 * to a single spoken utterance in the right language.
 */
export function buildPrompt(text, languageLabel) {
  return `Say clearly and naturally, in ${languageLabel}, just this word or phrase: "${text}"`;
}

export function parseSampleRate(mimeType) {
  const match = /(?:^|;)\s*rate=(\d+)/i.exec(mimeType ?? "");
  const rate = match ? Number(match[1]) : NaN;
  return Number.isInteger(rate) && rate > 0 ? rate : DEFAULT_SAMPLE_RATE;
}

/**
 * Speak `text` and return raw signed 16-bit little-endian mono PCM.
 * Retries 429 and 5xx responses with exponential backoff; throws on anything
 * that a retry cannot fix.
 */
export async function synthesize({
  text,
  languageLabel,
  voiceName,
  apiKey,
  onRetry = () => {},
}) {
  let lastError;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      return await requestOnce({ text, languageLabel, voiceName, apiKey });
    } catch (error) {
      lastError = error;
      if (!error.retryable || attempt === MAX_ATTEMPTS) break;

      const delayMs = Math.min(
        MAX_DELAY_MS,
        BASE_DELAY_MS * 2 ** (attempt - 1),
      );
      const waitMs = error.retryAfterMs ?? delayMs;
      onRetry({ attempt, maxAttempts: MAX_ATTEMPTS, waitMs, error });
      await sleep(waitMs);
    }
  }

  throw lastError;
}

async function requestOnce({ text, languageLabel, voiceName, apiKey }) {
  const body = {
    contents: [{ parts: [{ text: buildPrompt(text, languageLabel) }] }],
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName } },
      },
    },
    model: MODEL,
  };

  let response;
  try {
    response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        // Header auth, so the key never lands in a URL that could be logged.
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify(body),
    });
  } catch (cause) {
    throw new TtsError(`network error: ${cause.message}`, { retryable: true });
  }

  if (!response.ok) {
    const detail = truncate(await safeText(response));
    const retryable = response.status === 429 || response.status >= 500;
    const error = new TtsError(`HTTP ${response.status}: ${detail}`, {
      retryable,
    });
    const retryAfterMs = parseRetryAfter(response.headers.get("retry-after"));
    if (retryAfterMs !== null) error.retryAfterMs = retryAfterMs;
    throw error;
  }

  let payload;
  try {
    payload = await response.json();
  } catch (cause) {
    throw new TtsError(`unparseable JSON response: ${cause.message}`, {
      retryable: true,
    });
  }

  const part = payload?.candidates?.[0]?.content?.parts?.find(
    (candidatePart) => candidatePart?.inlineData?.data,
  );
  if (!part) {
    // Usually a safety block or a text-only reply; both clear up on a retry
    // often enough to be worth one, and fail loudly if they do not.
    const reason =
      payload?.promptFeedback?.blockReason ??
      payload?.candidates?.[0]?.finishReason ??
      "no inlineData in response";
    throw new TtsError(`no audio returned (${reason})`, { retryable: true });
  }

  const pcm = Buffer.from(part.inlineData.data, "base64");
  if (pcm.length === 0) {
    throw new TtsError("empty audio payload", { retryable: true });
  }

  return { pcm, sampleRate: parseSampleRate(part.inlineData.mimeType) };
}

function parseRetryAfter(header) {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(MAX_DELAY_MS, seconds * 1000);
  }
  const date = Date.parse(header);
  if (Number.isNaN(date)) return null;
  return Math.min(MAX_DELAY_MS, Math.max(0, date - Date.now()));
}

async function safeText(response) {
  try {
    return (await response.text()).trim();
  } catch {
    return "<no body>";
  }
}

function truncate(text, max = 300) {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export { MODEL, TtsError };
