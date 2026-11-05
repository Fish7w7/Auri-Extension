import { workResolveResultSchema, type WorkResolveResult } from "@auri/protocol";

type MatchedWork = Extract<WorkResolveResult, { status: "matched" }>;
export type TrustedWorkMatch = MatchedWork & { match: MatchedWork["match"] & { confidence: "exact" | "high" } };

// Identity confidence belongs to the Work match, never to chapter extraction.
// Parse the real wire schema too: missing/unknown confidence must fail closed.
export function hasTrustedWorkIdentity(result: unknown, workId?: string): result is TrustedWorkMatch {
  const parsed = workResolveResultSchema.safeParse(result);
  return parsed.success && parsed.data.status === "matched" &&
    (parsed.data.match.confidence === "exact" || parsed.data.match.confidence === "high") &&
    (workId === undefined || parsed.data.work.id === workId);
}

export class UntrustedWorkIdentityError extends Error {
  constructor() { super("Work identity needs explicit review in Desktop."); }
}

export function assertTrustedWorkIdentity(result: unknown, workId: string): asserts result is TrustedWorkMatch {
  if (!hasTrustedWorkIdentity(result, workId)) throw new UntrustedWorkIdentityError();
}

// Read authority at invocation time, including callbacks captured by an older view.
export async function runWithTrustedWorkIdentity<T>(current: () => unknown, workId: string, action: () => Promise<T>): Promise<T> {
  assertTrustedWorkIdentity(current(), workId);
  return action();
}
