import type {
  KnownCapability,
  PageContext,
  WorkContextResult,
  WorkResolveResult,
} from "@auri/protocol";

export type PopupState =
  | { status: "loading" }
  | { status: "unsupported" }
  | { status: "desktop_unavailable"; context?: PageContext }
  | { status: "integration_unavailable"; context?: PageContext }
  | { status: "incompatible"; context?: PageContext }
  | { status: "error"; context?: PageContext }
  | {
      status: "ready";
      context: PageContext;
      result: WorkResolveResult;
      capabilities: KnownCapability[];
      workContext?: WorkContextResult;
      coverUrl?: string;
    };
