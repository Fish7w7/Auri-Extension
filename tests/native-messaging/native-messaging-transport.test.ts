import {
  CAPABILITIES,
  PROTOCOL_METHOD,
  PROTOCOL_VERSION,
  createErrorResponse,
  createSuccessResponse,
  type ProtocolRequest,
} from "@auri/protocol";
import { describe, expect, it, vi } from "vitest";

import { NATIVE_HOST } from "../../src/config/native-hosts";
import { TransportFailure } from "../../src/transport/auri-transport";
import { selectTransport } from "../../src/transport/create-transport";
import { NativeMessagingTransport } from "../../src/transport/native-messaging-transport";
import type {
  NativeDisconnectListener,
  NativeMessageListener,
  NativeMessagingPort,
  NativeMessagingRuntime,
} from "../../src/transport/native-messaging-runtime";

class FakePort implements NativeMessagingPort {
  readonly posted: unknown[] = [];
  readonly messageListeners = new Set<NativeMessageListener>();
  readonly disconnectListeners = new Set<NativeDisconnectListener>();
  readonly disconnect = vi.fn();
  readonly postMessage = vi.fn((message: unknown) => {
    this.posted.push(message);
  });
  readonly onMessage = {
    addListener: (listener: NativeMessageListener) => this.messageListeners.add(listener),
    removeListener: (listener: NativeMessageListener) => this.messageListeners.delete(listener),
  };
  readonly onDisconnect = {
    addListener: (listener: NativeDisconnectListener) => this.disconnectListeners.add(listener),
    removeListener: (listener: NativeDisconnectListener) => this.disconnectListeners.delete(listener),
  };

  emitMessage(message: unknown) {
    for (const listener of this.messageListeners) listener(message);
  }

  emitDisconnect() {
    for (const listener of this.disconnectListeners) listener();
  }
}

class FakeRuntime implements NativeMessagingRuntime {
  readonly hosts: string[] = [];
  readonly ports: FakePort[] = [];
  lastErrorMessage?: string;

  connectNative(hostName: string) {
    this.hosts.push(hostName);
    const port = new FakePort();
    this.ports.push(port);
    return port;
  }

  getLastErrorMessage() {
    return this.lastErrorMessage;
  }
}

const helloParams = {
  client: { kind: "extension" as const, name: "auri-extension", version: "0.1.0" },
  supportedProtocolVersions: [PROTOCOL_VERSION],
};

const helloResult = {
  protocolVersion: PROTOCOL_VERSION,
  server: { kind: "desktop" as const, name: "Auri Desktop", version: "0.1.0" },
  capabilities: [...CAPABILITIES],
};

describe("seleção do transporte", () => {
  it("build production usa somente o host PROD", () => {
    expect(selectTransport({ MODE: "production" })).toEqual({
      kind: "native",
      hostName: NATIVE_HOST.production,
    });
  });

  it("build dev-native usa somente o host DEV", () => {
    expect(selectTransport({
      MODE: "dev-native",
      VITE_AURI_TRANSPORT: "mock",
    })).toEqual({
      kind: "native",
      hostName: NATIVE_HOST.development,
    });
  });

  it("DEV mock e fallback de desenvolvimento usam MockAuriTransport", () => {
    expect(selectTransport({
      MODE: "development",
      VITE_AURI_TRANSPORT: "mock",
    })).toMatchObject({ kind: "mock" });
    expect(selectTransport({ MODE: "development" })).toMatchObject({ kind: "mock" });
  });

  it("produção ignora configuração mock", () => {
    expect(selectTransport({
      MODE: "production",
      VITE_AURI_TRANSPORT: "mock",
    })).toEqual({ kind: "native", hostName: NATIVE_HOST.production });
  });
});

describe("conexão e lifecycle", () => {
  it("reutiliza um único Port para requisições concorrentes", async () => {
    const runtime = new FakeRuntime();
    const transport = new NativeMessagingTransport({
      hostName: NATIVE_HOST.development,
      runtime,
      createRequestId: vi.fn().mockReturnValueOnce("hello-1").mockReturnValueOnce("open-1"),
    });

    const hello = transport.hello(helloParams);
    const open = transport.openWork({ workId: "work-1" });
    expect(runtime.hosts).toHaveLength(1);
    const port = runtime.ports[0];
    port.emitMessage(createSuccessResponse("hello-1", PROTOCOL_METHOD.systemHello, helloResult));
    port.emitMessage(createSuccessResponse("open-1", PROTOCOL_METHOD.workOpen, { opened: true }));

    await expect(hello).resolves.toEqual(helloResult);
    await expect(open).resolves.toEqual({ opened: true });
  });

  it("rejeita pendências e remove listeners ao desconectar", async () => {
    const runtime = new FakeRuntime();
    const transport = new NativeMessagingTransport({ hostName: "test.host", runtime });
    const pending = transport.hello(helloParams);
    const port = runtime.ports[0];

    port.emitDisconnect();

    await expect(pending).rejects.toMatchObject({ kind: "disconnected" });
    expect(port.messageListeners.size).toBe(0);
    expect(port.disconnectListeners.size).toBe(0);
  });

  it("close rejeita pendências, desconecta e limpa listeners", async () => {
    const runtime = new FakeRuntime();
    const transport = new NativeMessagingTransport({ hostName: "test.host", runtime });
    const pending = transport.hello(helloParams);
    const port = runtime.ports[0];

    transport.close();

    await expect(pending).rejects.toMatchObject({ kind: "disconnected" });
    expect(port.disconnect).toHaveBeenCalledOnce();
    expect(port.messageListeners.size).toBe(0);
    expect(port.disconnectListeners.size).toBe(0);
  });

  it("classifica host ausente sem expor a mensagem do Chrome", async () => {
    const runtime = new FakeRuntime();
    runtime.lastErrorMessage = "Specified native messaging host not found.";
    const transport = new NativeMessagingTransport({ hostName: "missing.host", runtime });
    const pending = transport.hello(helloParams);

    runtime.ports[0].emitDisconnect();

    const failure = await pending.catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(TransportFailure);
    expect(failure).toMatchObject({ kind: "host_not_found", message: "host_not_found" });
    expect(String(failure)).not.toContain(runtime.lastErrorMessage);
  });
});

describe("request/response", () => {
  it("envia envelope válido e resolve a resposta correlacionada", async () => {
    const runtime = new FakeRuntime();
    const transport = new NativeMessagingTransport({
      hostName: "test.host",
      runtime,
      createRequestId: () => "request-1",
    });
    const pending = transport.hello(helloParams);
    const port = runtime.ports[0];
    const request = port.posted[0] as ProtocolRequest<typeof PROTOCOL_METHOD.systemHello>;

    expect(request).toMatchObject({
      kind: "request",
      protocolVersion: PROTOCOL_VERSION,
      id: "request-1",
      method: PROTOCOL_METHOD.systemHello,
      params: helloParams,
    });
    port.emitMessage(createSuccessResponse(request.id, request.method, helloResult));
    await expect(pending).resolves.toEqual(helloResult);
  });

  it("preserva erros de protocolo", async () => {
    const runtime = new FakeRuntime();
    const transport = new NativeMessagingTransport({
      hostName: "test.host",
      runtime,
      createRequestId: () => "request-1",
    });
    const pending = transport.hello(helloParams);
    runtime.ports[0].emitMessage(createErrorResponse(
      "request-1",
      PROTOCOL_METHOD.systemHello,
      { code: "AURI_NOT_READY", message: "Desktop ainda iniciando" },
    ));

    await expect(pending).rejects.toMatchObject({
      kind: "protocol",
      protocolError: { code: "AURI_NOT_READY" },
    });
  });

  it("ignora ID desconhecido e aceita depois a resposta correta", async () => {
    const runtime = new FakeRuntime();
    const transport = new NativeMessagingTransport({
      hostName: "test.host", runtime, createRequestId: () => "known-id",
    });
    const pending = transport.openWork({ workId: "work-1" });
    const port = runtime.ports[0];
    port.emitMessage(createSuccessResponse("stale-id", PROTOCOL_METHOD.workOpen, { opened: true }));
    port.emitMessage(createSuccessResponse("known-id", PROTOCOL_METHOD.workOpen, { opened: true }));
    await expect(pending).resolves.toEqual({ opened: true });
  });

  it("rejeita method divergente e mensagem inválida", async () => {
    const mismatchRuntime = new FakeRuntime();
    const mismatch = new NativeMessagingTransport({
      hostName: "test.host", runtime: mismatchRuntime, createRequestId: () => "request-1",
    });
    const mismatched = mismatch.hello(helloParams);
    mismatchRuntime.ports[0].emitMessage(createSuccessResponse(
      "request-1", PROTOCOL_METHOD.workOpen, { opened: true },
    ));
    await expect(mismatched).rejects.toMatchObject({ kind: "invalid_message" });

    const invalidRuntime = new FakeRuntime();
    const invalid = new NativeMessagingTransport({ hostName: "test.host", runtime: invalidRuntime });
    const malformed = invalid.hello(helloParams);
    invalidRuntime.ports[0].emitMessage({ kind: "response", id: "sem-contrato" });
    await expect(malformed).rejects.toMatchObject({ kind: "invalid_message" });
  });

  it("expira requisição e ignora resposta tardia", async () => {
    vi.useFakeTimers();
    const runtime = new FakeRuntime();
    const transport = new NativeMessagingTransport({
      hostName: "test.host", runtime, requestTimeoutMs: 20_000, createRequestId: () => "late-id",
    });
    const pending = transport.openWork({ workId: "work-1" });
    const assertion = expect(pending).rejects.toMatchObject({ kind: "timeout" });
    await vi.advanceTimersByTimeAsync(20_000);
    await assertion;
    runtime.ports[0].emitMessage(createSuccessResponse(
      "late-id", PROTOCOL_METHOD.workOpen, { opened: true },
    ));
    vi.useRealTimers();
  });

  it("correlaciona concorrência mesmo com respostas fora de ordem", async () => {
    const runtime = new FakeRuntime();
    const transport = new NativeMessagingTransport({
      hostName: "test.host",
      runtime,
      createRequestId: vi.fn().mockReturnValueOnce("open-id").mockReturnValueOnce("progress-id"),
    });
    const open = transport.openWork({ workId: "work-1" });
    const progress = transport.updateProgress({
      workId: "work-1", chapter: { value: "12", numericValue: 12 },
    });
    const port = runtime.ports[0];
    port.emitMessage(createSuccessResponse(
      "progress-id", PROTOCOL_METHOD.progressUpdate, { updated: true },
    ));
    port.emitMessage(createSuccessResponse("open-id", PROTOCOL_METHOD.workOpen, { opened: true }));

    await expect(progress).resolves.toEqual({ updated: true });
    await expect(open).resolves.toEqual({ opened: true });
  });
});

describe("limites e hello", () => {
  it("envia mensagem normal e bloqueia mensagem acima do limite antes do Port", async () => {
    const normalRuntime = new FakeRuntime();
    const normal = new NativeMessagingTransport({
      hostName: "test.host", runtime: normalRuntime, createRequestId: () => "normal-id",
    });
    const pending = normal.openWork({ workId: "work-1" });
    expect(normalRuntime.ports[0].posted).toHaveLength(1);
    normal.close();
    await expect(pending).rejects.toBeInstanceOf(TransportFailure);

    const limitedRuntime = new FakeRuntime();
    const limited = new NativeMessagingTransport({
      hostName: "test.host", runtime: limitedRuntime, maxMessageBytes: 16,
    });
    await expect(limited.openWork({ workId: "work-1" })).rejects.toMatchObject({
      kind: "invalid_message",
    });
    expect(limitedRuntime.ports[0].posted).toHaveLength(0);
  });

  it("aceita hello com capability futura desconhecida", async () => {
    const runtime = new FakeRuntime();
    const transport = new NativeMessagingTransport({
      hostName: "test.host", runtime, createRequestId: () => "hello-id",
    });
    const pending = transport.hello(helloParams);
    const negotiated = {
      ...helloResult,
      capabilities: ["work.resolve", "future.someCapability"],
    };
    runtime.ports[0].emitMessage(createSuccessResponse(
      "hello-id", PROTOCOL_METHOD.systemHello, negotiated,
    ));
    await expect(pending).resolves.toEqual(negotiated);
  });

  it("traduz incompatibilidade retornada pelo protocolo", async () => {
    const runtime = new FakeRuntime();
    const transport = new NativeMessagingTransport({
      hostName: "test.host", runtime, createRequestId: () => "hello-id",
    });
    const pending = transport.hello(helloParams);
    runtime.ports[0].emitMessage(createErrorResponse(
      "hello-id",
      PROTOCOL_METHOD.systemHello,
      { code: "UNSUPPORTED_PROTOCOL_VERSION", message: "Versão incompatível" },
    ));
    await expect(pending).rejects.toMatchObject({ kind: "incompatible" });
  });
});
