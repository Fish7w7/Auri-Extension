import type { WorkResolveResult } from "@auri/protocol";
import { useEffect, useRef, useState } from "react";
import { t } from "../i18n";
import { TransportFailure } from "../transport/auri-transport";
import { runWithTrustedWorkIdentity, UntrustedWorkIdentityError } from "./work-identity";

export type ActionId = "progress" | "source" | "open" | "continue" | "verify" | "add-work" | "retry" | `candidate:${string}`;
export interface PopupAction {
  id: ActionId;
  label: string;
  execute: () => Promise<unknown> | void;
  success?: string;
}
export type ActionFeedbackValue = { kind: "success" | "error"; message: string };
export type PopupActions = ReturnType<typeof usePopupActions>;

export function usePopupActions(resolution: WorkResolveResult | undefined, onStart?: () => void) {
  const [pending, setPending] = useState<ActionId>();
  const [feedback, setFeedback] = useState<ActionFeedbackValue>();
  const locked = useRef(false);
  const active = useRef(true);
  const current = useRef(resolution);
  current.current = resolution;
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);

  async function run(action: PopupAction) {
    if (locked.current || !active.current) return;
    locked.current = true;
    setPending(action.id);
    setFeedback(undefined);
    try {
      onStart?.();
      await action.execute();
      if (active.current && action.success) setFeedback({ kind: "success", message: action.success });
    } catch (error) {
      if (import.meta.env.DEV) console.error("Ação do Auri falhou", error);
      const message = error instanceof UntrustedWorkIdentityError ? t("possibleMatchDescription")
        : error instanceof TransportFailure && error.protocolError?.code === "CONFLICT" ? t("actionConflict")
        : t("actionFailed");
      if (active.current) setFeedback({ kind: "error", message });
    } finally {
      locked.current = false;
      if (active.current) setPending(undefined);
    }
  }

  function withWork(workId: string, action: () => Promise<unknown>) {
    return () => runWithTrustedWorkIdentity(() => current.current, workId, action);
  }

  return { pending, feedback, run, withWork };
}
