export type NativeMessageListener = (message: unknown) => void;
export type NativeDisconnectListener = () => void;

interface ListenerChannel<Listener> {
  addListener(listener: Listener): void;
  removeListener(listener: Listener): void;
}

export interface NativeMessagingPort {
  postMessage(message: unknown): void;
  disconnect(): void;
  readonly onMessage: ListenerChannel<NativeMessageListener>;
  readonly onDisconnect: ListenerChannel<NativeDisconnectListener>;
}

export interface NativeMessagingRuntime {
  connectNative(hostName: string): NativeMessagingPort;
  getLastErrorMessage(): string | undefined;
}

export const chromeNativeMessagingRuntime: NativeMessagingRuntime = {
  connectNative(hostName) {
    const port = chrome.runtime.connectNative(hostName);
    return {
      postMessage: (message) => port.postMessage(message),
      disconnect: () => port.disconnect(),
      onMessage: {
        addListener: (listener) => port.onMessage.addListener(listener),
        removeListener: (listener) => port.onMessage.removeListener(listener),
      },
      onDisconnect: {
        addListener: (listener) => port.onDisconnect.addListener(listener),
        removeListener: (listener) => port.onDisconnect.removeListener(listener),
      },
    };
  },
  getLastErrorMessage: () => chrome.runtime.lastError?.message,
};

export function classifyNativeDisconnect(message: string | undefined) {
  const normalized = message?.toLocaleLowerCase("en-US") ?? "";
  if (
    normalized.includes("native messaging host not found") ||
    normalized.includes("specified native messaging host not found")
  ) {
    return "host_not_found" as const;
  }
  if (
    normalized.includes("failed to start native messaging host") ||
    normalized.includes("native host has exited")
  ) {
    return "host_start_failed" as const;
  }
  return "disconnected" as const;
}
