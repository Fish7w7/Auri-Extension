import { useEffect, useRef, useState } from "react";
import type { ChapterValue, KnownCapability, PageContext, ProgressUpdateParams, WorkContextParams, WorkContextResult, WorkResolveResult } from "@auri/protocol";
import type { AuriTransport } from "../transport/auri-transport";
import { TransportFailure } from "../transport/auri-transport";
import { assertTrustedWorkIdentity, hasTrustedWorkIdentity } from "./work-identity";
import { canUseDetectedChapter, compareProgressChapters, isDefinitiveProgressRejection, normalizeProgressChapter } from "./progress-confirmation";

type Reading = { kind: "context"; result: WorkContextResult } | { kind: "resolve"; result: WorkResolveResult };
export type ProgressConfirmation = {
  phase: "updating" | "confirming" | "confirmed" | "divergent" | "unavailable" | "failed";
  workId: string;
  requested: ChapterValue;
  previous: ChapterValue | null;
  delivery: "accepted" | "uncertain";
  saved?: ChapterValue | null;
  reason?: "communication" | "different_work" | "missing_progress" | "invalid_progress" | "unresolved" | "read_failed" | "invalid_request" | "untrusted_identity" | "conflict";
};
interface Options {
  identity: string;
  workId: string;
  resolution: WorkResolveResult | undefined;
  context: PageContext;
  capabilities: KnownCapability[];
  transport: AuriTransport;
  readContext?: (params: WorkContextParams) => Promise<WorkContextResult>;
}

export function useProgressConfirmation(options: Options) {
  const authority = JSON.stringify([options.identity, options.workId, options.context, options.resolution]);
  const live = useRef({ identity: authority, transport: options.transport, active: true, sequence: 0, busy: false });
  if (live.current.identity !== authority || live.current.transport !== options.transport) {
    live.current.active = false;
    live.current = { identity: authority, transport: options.transport, active: true, sequence: 0, busy: false };
  }
  const scope = live.current;
  const [state, setState] = useState<{ scope: typeof scope; confirmation?: ProgressConfirmation; observed?: Reading }>();
  const latest = state?.scope === scope ? state : undefined;
  const attempt = useRef<{ scope: typeof scope; value: ProgressConfirmation } | undefined>(undefined);
  useEffect(() => {
    scope.active = true;
    return () => { scope.active = false; scope.sequence += 1; };
  }, [scope]);
  const isCurrent = (sequence: number) => live.current === scope && scope.active && sequence === scope.sequence;
  const publish = (sequence: number, confirmation: ProgressConfirmation, observed?: Reading) => {
    if (!isCurrent(sequence)) return;
    attempt.current = { scope, value: confirmation };
    setState(current => ({ scope, confirmation, observed: observed ?? (current?.scope === scope ? current.observed : undefined) }));
  };
  const read = async (): Promise<Reading> => {
    if (!options.capabilities.includes("work.context") && !options.capabilities.includes("work.resolve")) throw new Error("Reading unavailable");
    return options.capabilities.includes("work.context")
    ? { kind: "context", result: await (options.readContext ?? (params => options.transport.getWorkContext(params)))({
        workId: options.workId,
        page: { url: options.context.url,
          ...(options.context.canonicalUrl ? { canonicalUrl: options.context.canonicalUrl } : {}),
          ...(options.context.detectedChapter ? { detectedChapter: options.context.detectedChapter } : {}) },
      }) }
    : { kind: "resolve", result: await options.transport.resolveWork(options.context) };
  };

  const confirm = async (value: ProgressConfirmation, sequence: number) => {
    publish(sequence, { ...value, phase: "confirming" });
    try {
      const observed = await read();
      if (!isCurrent(sequence)) return;
      if (observed.kind === "resolve" && observed.result.status !== "matched") {
        publish(sequence, { ...value, phase: "unavailable", reason: "unresolved" }); return;
      }
      const work = observed.result as WorkContextResult | Extract<WorkResolveResult, { status: "matched" }>;
      if (work.work.id !== value.workId) {
        publish(sequence, { ...value, phase: "unavailable", reason: "different_work" }); return;
      }
      if (observed.kind === "resolve" && !hasTrustedWorkIdentity(observed.result, value.workId)) {
        publish(sequence, { ...value, phase: "unavailable", reason: "untrusted_identity" }); return;
      }
      const saved = observed.kind === "context" ? observed.result.work.progress
        : (observed.result as Extract<WorkResolveResult, { status: "matched" }>).work.currentChapter;
      const comparison = compareProgressChapters(value.requested, saved);
      const phase = comparison === "same" ? "confirmed" : comparison === "different" ? "divergent"
        : observed.kind === "context" && saved === null ? "divergent" : "unavailable";
      publish(sequence, { ...value, phase, saved: saved ?? null,
        reason: saved == null ? "missing_progress" : comparison === "unverifiable" ? "invalid_progress" : undefined }, observed);
    } catch {
      publish(sequence, { ...value, phase: "unavailable", reason: "read_failed" });
    }
  };

  const update = async (params: ProgressUpdateParams, previous: ChapterValue | null) => {
    if (scope.busy || !scope.active || params.workId !== options.workId || !options.capabilities.includes("progress.update")) return;
    assertTrustedWorkIdentity(options.resolution, params.workId);
    scope.busy = true;
    const sequence = ++scope.sequence;
    const value: ProgressConfirmation = { phase: "updating", workId: params.workId, requested: { ...params.chapter }, previous: previous && { ...previous }, delivery: "uncertain" };
    publish(sequence, value);
    try {
      if (!normalizeProgressChapter(value.requested) || !canUseDetectedChapter(options.context.detectedChapter)) {
        publish(sequence, { ...value, phase: "failed", reason: "invalid_request" }); return;
      }
      try { await options.transport.updateProgress({ ...params, chapter: { ...value.requested } }); }
      catch (error) {
        publish(sequence, { ...value, phase: isDefinitiveProgressRejection(error) ? "failed" : "unavailable",
          ...(error instanceof TransportFailure && (["timeout", "disconnected", "host_start_failed", "host_not_found"].includes(error.kind) || error.protocolError?.code === "AURI_NOT_READY") ? { reason: "communication" as const } : {}),
          ...(error instanceof TransportFailure && error.protocolError?.code === "CONFLICT" ? { reason: "conflict" as const } : {}) });
        return;
      }
      if (isCurrent(sequence)) await confirm({ ...value, delivery: "accepted" }, sequence);
    } finally { scope.busy = false; }
  };
  const verify = async () => {
    if (scope.busy || !scope.active || attempt.current?.scope !== scope) return;
    scope.busy = true;
    const sequence = ++scope.sequence;
    try { await confirm(attempt.current.value, sequence); }
    finally { scope.busy = false; }
  };
  // Used by source.add too: retain the card and reject a context for another Work.
  const refreshContext = async (params: WorkContextParams) => {
    assertTrustedWorkIdentity(options.resolution, params.workId);
    if (params.workId !== options.workId || !options.capabilities.includes("work.context")) throw new Error("Reading unavailable");
    const sequence = ++scope.sequence;
    const result = await (options.readContext ?? (input => options.transport.getWorkContext(input)))(params);
    if (!isCurrent(sequence) || result.work.id !== options.workId) throw new Error("Stale work context");
    setState(current => ({ scope, confirmation: current?.scope === scope ? current.confirmation : undefined, observed: { kind: "context", result } }));
    return result;
  };
  return { confirmation: latest?.confirmation, observed: latest?.observed, update, verify, refreshContext };
}
