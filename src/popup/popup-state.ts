import type {
  KnownCapability,
  PageContext,
  WorkContextResult,
  WorkContextParams,
  WorkResolveResult,
} from "@auri/protocol";

import type { AuriTransport } from "../transport/auri-transport";

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

export type ReadyState = Extract<PopupState, { status: "ready" }>;
export type NavigateToUrl = (url: string) => Promise<unknown>;

export interface PopupViewProps {
  state: PopupState;
  transport: AuriTransport;
  onRetry: () => void | Promise<void>;
  onActionStart?: () => void;
  onRefreshContext?: (params: WorkContextParams) => Promise<WorkContextResult>;
  navigateToUrl?: NavigateToUrl;
}
