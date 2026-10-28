import { TrashIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

interface ResetProgressButtonProps {
  isResetting: boolean;
  onReset: () => void;
}

/** How long an armed button stays armed before it forgets it was tapped. */
const ARMED_MS = 5000;

/**
 * Wiping every verdict in a deck is one tap away from a fat finger, so the
 * button arms first and resets second. Two taps rather than a modal: there is no
 * dialog primitive in this app yet, and a confirmation step that lives in the
 * button itself needs no focus trap, no scroll lock and no second component.
 */
export function ResetProgressButton({
  isResetting,
  onReset,
}: ResetProgressButtonProps) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;

    const timer = window.setTimeout(() => setArmed(false), ARMED_MS);
    return () => window.clearTimeout(timer);
  }, [armed]);

  const handleClick = () => {
    if (!armed) {
      setArmed(true);
      return;
    }

    setArmed(false);
    onReset();
  };

  return (
    <Button
      variant={armed ? "destructive" : "ghost"}
      size="lg"
      className="h-11 self-center text-muted-foreground data-[variant=destructive]:text-destructive"
      disabled={isResetting}
      onClick={handleClick}
    >
      <TrashIcon />
      {armed ? "Tap again to erase progress" : "Reset progress"}
    </Button>
  );
}
