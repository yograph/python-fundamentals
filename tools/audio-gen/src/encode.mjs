import { spawn } from "node:child_process";

const FFMPEG_MISSING = [
  "ffmpeg was not found on PATH.",
  "  macOS:  brew install ffmpeg",
  "  Ubuntu: sudo apt-get install -y ffmpeg",
].join("\n");

/** Output format, fixed by the data contract: Opus in Ogg, mono, 24 kHz. */
const OUTPUT_SAMPLE_RATE = 24_000;
const BITRATE = "16k";

/** Fail fast with an actionable message rather than once per clip. */
export async function assertFfmpegAvailable() {
  try {
    await run(["-hide_banner", "-version"], Buffer.alloc(0));
  } catch (error) {
    throw new Error(error.ffmpegMissing ? FFMPEG_MISSING : error.message);
  }
}

/**
 * Encode raw signed 16-bit little-endian mono PCM to Opus-in-Ogg.
 * The Gemini payload has no WAV header, so the input format is declared
 * explicitly (-f s16le) instead of being sniffed. Piped through stdin/stdout,
 * so no temp files to leak.
 */
export async function encodeToOpusOgg(pcm, inputSampleRate) {
  return run(
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "s16le",
      "-ar",
      String(inputSampleRate),
      "-ac",
      "1",
      "-i",
      "pipe:0",
      "-c:a",
      "libopus",
      "-b:a",
      BITRATE,
      "-vbr",
      "on",
      // Speech-tuned mode: narrower band, noticeably smaller files, and the
      // clips are single spoken words.
      "-application",
      "voip",
      "-ar",
      String(OUTPUT_SAMPLE_RATE),
      "-ac",
      "1",
      "-f",
      "ogg",
      "pipe:1",
    ],
    pcm,
  );
}

function run(args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", args, {
      stdio: ["pipe", "pipe", "pipe"],
    });
    const stdout = [];
    const stderr = [];

    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));

    // ffmpeg can exit before the whole buffer is written (bad input, early
    // error); the resulting EPIPE would otherwise crash the process.
    child.stdin.on("error", () => {
      /* swallowed: the close handler reports the real failure */
    });

    child.on("error", (error) => {
      if (error.code === "ENOENT") {
        const missing = new Error(FFMPEG_MISSING);
        missing.ffmpegMissing = true;
        reject(missing);
        return;
      }
      reject(error);
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve(Buffer.concat(stdout));
        return;
      }
      const detail = Buffer.concat(stderr).toString().trim() || "no stderr";
      reject(new Error(`ffmpeg exited with code ${code}: ${detail}`));
    });

    child.stdin.end(input);
  });
}
