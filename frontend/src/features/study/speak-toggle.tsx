import { Volume2Icon, VolumeOffIcon } from "lucide-react";

import { Toggle } from "@/components/ui/toggle";
import { cn } from "@/lib/utils";

interface SpeakToggleProps {
  enabled: boolean;
  /** Pulses the icon while a clip or an utterance is actually playing. */
  isSpeaking: boolean;
  onChange: (enabled: boolean) => void;
}

/**
 * The session's one audio control: say the answer out loud whenever a card is
 * turned over.
 *
 * It replaced a speak button on each face. Two of them competed with the card
 * for the same tap - and now that the card is dragged, a button sitting on it
 * would compete with the gesture as well. One switch in the header, remembered
 * between sessions, says the same thing with nothing on the card at all.
 */
export function SpeakToggle({
  enabled,
  isSpeaking,
  onChange,
}: SpeakToggleProps) {
  return (
    <Toggle
      size="sm"
      pressed={enabled}
      onPressedChange={onChange}
      aria-label={
        enabled
          ? "Stop speaking the answer when a card is flipped"
          : "Speak the answer when a card is flipped"
      }
      className="text-muted-foreground"
    >
      {enabled ? (
        <Volume2Icon className={cn(isSpeaking && "animate-pulse")} />
      ) : (
        <VolumeOffIcon />
      )}
    </Toggle>
  );
}
