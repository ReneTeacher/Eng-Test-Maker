import { useState, useEffect, useRef, useCallback } from "react";

interface Violation {
  type: "visibility" | "blur";
  timestamp: string;
}

interface AntiCheatingOptions {
  enabled: boolean;
  maxWarnings?: number;
  onAutoSubmit: () => void;
}

interface AntiCheatingReturn {
  warningCount: number;
  violations: Violation[];
  showWarningDialog: boolean;
  setShowWarningDialog: (v: boolean) => void;
  pauseDetection: (ms: number) => void;
  handlePaste: (e: React.ClipboardEvent) => void;
}

export function useAntiCheating({ enabled, maxWarnings = 3, onAutoSubmit }: AntiCheatingOptions): AntiCheatingReturn {
  const [warningCount, setWarningCount] = useState(0);
  const [violations, setViolations] = useState<Violation[]>([]);
  const [showWarningDialog, setShowWarningDialog] = useState(false);
  const pausedUntil = useRef(0);
  const autoSubmitTriggered = useRef(false);
  const onAutoSubmitRef = useRef(onAutoSubmit);
  onAutoSubmitRef.current = onAutoSubmit;

  const addViolation = useCallback((type: Violation["type"]) => {
    if (Date.now() < pausedUntil.current) return;

    const violation: Violation = { type, timestamp: new Date().toISOString() };
    setViolations(prev => [...prev, violation]);
    setWarningCount(prev => {
      const newCount = prev + 1;
      if (newCount >= maxWarnings && !autoSubmitTriggered.current) {
        autoSubmitTriggered.current = true;
        setTimeout(() => onAutoSubmitRef.current(), 0);
      } else if (newCount < maxWarnings) {
        setShowWarningDialog(true);
      }
      return newCount;
    });
  }, [maxWarnings]);

  const pauseDetection = useCallback((ms: number) => {
    pausedUntil.current = Date.now() + ms;
  }, []);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const handleVisibilityChange = () => {
      if (document.hidden) addViolation("visibility");
    };

    const blockBack = (e: PopStateEvent) => {
      e.preventDefault();
      window.history.pushState(null, "", window.location.href);
    };
    window.history.pushState(null, "", window.location.href);

    const blockKeys = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
      if ((e.key === "Backspace" || e.key === "Delete") && !isInput) {
        e.preventDefault();
      }
    };

    const warnBeforeLeave = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };

    const blockContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    const blockCopyCut = (e: ClipboardEvent) => {
      e.preventDefault();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("popstate", blockBack);
    document.addEventListener("keydown", blockKeys);
    window.addEventListener("beforeunload", warnBeforeLeave);
    document.addEventListener("contextmenu", blockContextMenu);
    document.addEventListener("copy", blockCopyCut);
    document.addEventListener("cut", blockCopyCut);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("popstate", blockBack);
      document.removeEventListener("keydown", blockKeys);
      window.removeEventListener("beforeunload", warnBeforeLeave);
      document.removeEventListener("contextmenu", blockContextMenu);
      document.removeEventListener("copy", blockCopyCut);
      document.removeEventListener("cut", blockCopyCut);
    };
  }, [enabled, addViolation]);

  return {
    warningCount,
    violations,
    showWarningDialog,
    setShowWarningDialog,
    pauseDetection,
    handlePaste,
  };
}
