import type {
  KnownCapability,
  PageContext,
  WorkResolveResult,
} from "@auri/protocol";

export type PopupState =
  | { status: "loading" }
  | { status: "unsupported" }
  | { status: "disconnected"; context: PageContext }
  | { status: "incompatible"; context: PageContext }
  | { status: "error"; context?: PageContext }
  | {
      status: "ready";
      context: PageContext;
      result: WorkResolveResult;
      capabilities: KnownCapability[];
      coverUrl?: string;
    };
