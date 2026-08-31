import {
  MAX_PROTOCOL_MESSAGE_BYTES,
  PROTOCOL_METHOD,
  createRequest,
  safeParseResponse,
  type DesktopOpenAddWorkParams,
  type DesktopOpenAddWorkResult,
  type ProgressUpdateParams,
  type ProgressUpdateResult,
  type ProtocolMethod,
  type ProtocolParams,
  type ProtocolResult,
  type SourceAddParams,
  type SourceAddResult,
  type SystemHelloParams,
  type SystemHelloResult,
  type WorkOpenParams,
  type WorkOpenResult,
  type WorkResolveParams,
  type WorkResolveResult,
} from "@auri/protocol";

import { NATIVE_REQUEST_TIMEOUT_MS } from "../config/extension";
import { TransportFailure, type AuriTransport } from "./auri-transport";
import {
  chromeNativeMessagingRuntime,
  classifyNativeDisconnect,
  type NativeMessagingPort,
  type NativeMessagingRuntime,
} from "./native-messaging-runtime";

interface PendingRequest {
  readonly method: ProtocolMethod;
  readonly resolve: (result: unknown) => void;
  readonly reject: (error: TransportFailure) => void;
  readonly timeout: ReturnType<typeof setTimeout>;
}

export interface NativeMessagingTransportOptions {
  readonly hostName: string;
  readonly runtime?: NativeMessagingRuntime;
  readonly requestTimeoutMs?: number;
  readonly maxMessageBytes?: number;
  readonly createRequestId?: () => string;
}

let fallbackRequestSequence = 0;

export function createNativeRequestId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  fallbackRequestSequence += 1;
  return `auri-${Date.now().toString(36)}-${fallbackRequestSequence.toString(36)}`;
}

export class NativeMessagingTransport implements AuriTransport {
  private readonly runtime: NativeMessagingRuntime;
  private readonly requestTimeoutMs: number;
  private readonly maxMessageBytes: number;
  private readonly requestIdFactory: () => string;
  private readonly pending = new Map<string, PendingRequest>();
  private readonly issuedIds = new Set<string>();
  private port?: NativeMessagingPort;

  constructor(private readonly options: NativeMessagingTransportOptions) {
    this.runtime = options.runtime ?? chromeNativeMessagingRuntime;
    this.requestTimeoutMs = options.requestTimeoutMs ?? NATIVE_REQUEST_TIMEOUT_MS;
    this.maxMessageBytes = options.maxMessageBytes ?? MAX_PROTOCOL_MESSAGE_BYTES;
    this.requestIdFactory = options.createRequestId ?? createNativeRequestId;
  }

  hello(params: SystemHelloParams): Promise<SystemHelloResult> {
    return this.send(PROTOCOL_METHOD.systemHello, params);
  }

  resolveWork(params: WorkResolveParams): Promise<WorkResolveResult> {
    return this.send(PROTOCOL_METHOD.workResolve, params);
  }

  openWork(params: WorkOpenParams): Promise<WorkOpenResult> {
    return this.send(PROTOCOL_METHOD.workOpen, params);
  }

  openAddWork(params: DesktopOpenAddWorkParams): Promise<DesktopOpenAddWorkResult> {
    return this.send(PROTOCOL_METHOD.desktopOpenAddWork, params);
  }

  addSource(params: SourceAddParams): Promise<SourceAddResult> {
    return this.send(PROTOCOL_METHOD.sourceAdd, params);
  }

  updateProgress(params: ProgressUpdateParams): Promise<ProgressUpdateResult> {
    return this.send(PROTOCOL_METHOD.progressUpdate, params);
  }

  close(): void {
    this.failPending(new TransportFailure("disconnected"));
    this.releasePort(true);
  }

  private send<Method extends ProtocolMethod>(
    method: Method,
    params: ProtocolParams<Method>,
  ): Promise<ProtocolResult<Method>> {
    let port: NativeMessagingPort;
    try {
      port = this.getPort();
    } catch {
      return Promise.reject(new TransportFailure("host_start_failed"));
    }

    const id = this.nextRequestId();
    let request: ReturnType<typeof createRequest<Method>>;
    try {
      request = createRequest(id, method, params);
    } catch {
      return Promise.reject(new TransportFailure("invalid_message"));
    }

    const serialized = JSON.stringify(request);
    if (new TextEncoder().encode(serialized).byteLength > this.maxMessageBytes) {
      return Promise.reject(new TransportFailure("invalid_message"));
    }

    return new Promise<ProtocolResult<Method>>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new TransportFailure("timeout"));
      }, this.requestTimeoutMs);

      this.pending.set(id, {
        method,
        resolve: (result) => resolve(result as ProtocolResult<Method>),
        reject,
        timeout,
      });

      try {
        port.postMessage(request);
      } catch {
        clearTimeout(timeout);
        this.pending.delete(id);
        const failure = new TransportFailure("host_start_failed");
        reject(failure);
        this.releasePort(true);
        this.failPending(failure);
      }
    });
  }

  private getPort(): NativeMessagingPort {
    if (this.port) return this.port;
    const port = this.runtime.connectNative(this.options.hostName);
    port.onMessage.addListener(this.handleMessage);
    port.onDisconnect.addListener(this.handleDisconnect);
    this.port = port;
    return port;
  }

  private nextRequestId(): string {
    let id = this.requestIdFactory();
    while (this.issuedIds.has(id)) id = createNativeRequestId();
    this.issuedIds.add(id);
    return id;
  }

  private readonly handleMessage = (message: unknown) => {
    const parsed = safeParseResponse(message);
    if (!parsed.success) {
      this.failPending(new TransportFailure("invalid_message"));
      return;
    }

    const response = parsed.data;
    const pending = this.pending.get(response.id);
    if (!pending) return;
    this.pending.delete(response.id);
    clearTimeout(pending.timeout);

    if (pending.method !== response.method) {
      pending.reject(new TransportFailure("invalid_message"));
      return;
    }
    if (!response.ok) {
      const kind = response.error.code === "UNSUPPORTED_PROTOCOL_VERSION"
        ? "incompatible"
        : "protocol";
      pending.reject(new TransportFailure(kind, response.error));
      return;
    }
    pending.resolve(response.result);
  };

  private readonly handleDisconnect = () => {
    const kind = classifyNativeDisconnect(this.runtime.getLastErrorMessage());
    this.releasePort(false);
    this.failPending(new TransportFailure(kind));
  };

  private failPending(error: TransportFailure): void {
    for (const [id, request] of this.pending) {
      clearTimeout(request.timeout);
      request.reject(error);
      this.pending.delete(id);
    }
  }

  private releasePort(disconnect: boolean): void {
    const port = this.port;
    if (!port) return;
    this.port = undefined;
    port.onMessage.removeListener(this.handleMessage);
    port.onDisconnect.removeListener(this.handleDisconnect);
    if (disconnect) {
      try {
        port.disconnect();
      } catch {
        // O Port já pode ter sido encerrado pelo navegador.
      }
    }
  }
}
