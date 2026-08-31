import type {
  DesktopOpenAddWorkParams,
  DesktopOpenAddWorkResult,
  ProgressUpdateParams,
  ProgressUpdateResult,
  SourceAddParams,
  SourceAddResult,
  SystemHelloParams,
  SystemHelloResult,
  ProtocolError,
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
  close(): void;
}

export type TransportFailureKind =
  | "host_not_found"
  | "host_start_failed"
  | "disconnected"
  | "timeout"
  | "invalid_message"
  | "incompatible"
  | "protocol"
  | "error";

export class TransportFailure extends Error {
  constructor(
    readonly kind: TransportFailureKind,
    readonly protocolError?: ProtocolError,
  ) {
    super(protocolError?.code ?? kind);
    this.name = "TransportFailure";
  }
}

export function isDesktopUnavailableFailure(error: unknown): boolean {
  return error instanceof TransportFailure && (
    error.kind === "host_not_found" ||
    error.kind === "host_start_failed" ||
    error.kind === "disconnected" ||
    error.protocolError?.code === "AURI_NOT_READY"
  );
}

export function isIncompatibleFailure(error: unknown): boolean {
  return error instanceof TransportFailure && (
    error.kind === "incompatible" ||
    error.protocolError?.code === "UNSUPPORTED_PROTOCOL_VERSION"
  );
}
