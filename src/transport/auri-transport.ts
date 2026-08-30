import type {
  DesktopOpenAddWorkParams,
  DesktopOpenAddWorkResult,
  ProgressUpdateParams,
  ProgressUpdateResult,
  SourceAddParams,
  SourceAddResult,
  SystemHelloParams,
  SystemHelloResult,
  WorkOpenParams,
  WorkOpenResult,
  WorkResolveParams,
  WorkResolveResult,
} from "@auri/protocol";

export interface AuriTransport {
  hello(params: SystemHelloParams): Promise<SystemHelloResult>;
  resolveWork(params: WorkResolveParams): Promise<WorkResolveResult>;
  openWork(params: WorkOpenParams): Promise<WorkOpenResult>;
  openAddWork(params: DesktopOpenAddWorkParams): Promise<DesktopOpenAddWorkResult>;
  addSource(params: SourceAddParams): Promise<SourceAddResult>;
  updateProgress(params: ProgressUpdateParams): Promise<ProgressUpdateResult>;
}

export type TransportFailureKind = "disconnected" | "incompatible" | "error";

export class TransportFailure extends Error {
  constructor(readonly kind: TransportFailureKind) {
    super(kind);
    this.name = "TransportFailure";
  }
}
