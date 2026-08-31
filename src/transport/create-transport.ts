import type { AuriTransport } from "./auri-transport";
import { NATIVE_HOST } from "../config/extension";
import { getMockScenario, MockAuriTransport } from "./mock-auri-transport";
import { NativeMessagingTransport } from "./native-messaging-transport";
import type { NativeMessagingRuntime } from "./native-messaging-runtime";

export interface TransportEnvironment {
  readonly MODE: string;
  readonly VITE_AURI_TRANSPORT?: string;
  readonly VITE_AURI_MOCK_SCENARIO?: string;
}

export interface CreateTransportOptions {
  readonly environment?: TransportEnvironment;
  readonly nativeRuntime?: NativeMessagingRuntime;
}

const BUILD_ENVIRONMENT: TransportEnvironment = {
  MODE: import.meta.env.MODE,
  VITE_AURI_TRANSPORT: import.meta.env.VITE_AURI_TRANSPORT,
  VITE_AURI_MOCK_SCENARIO: import.meta.env.VITE_AURI_MOCK_SCENARIO,
};

export function createTransport(options: CreateTransportOptions = {}): AuriTransport {
  const environment = options.environment ?? BUILD_ENVIRONMENT;
  if (environment.MODE === "production") {
    return new NativeMessagingTransport({
      hostName: NATIVE_HOST.production,
      runtime: options.nativeRuntime,
    });
  }
  if (
    environment.MODE === "dev-native" ||
    (
      environment.MODE === "development" &&
      environment.VITE_AURI_TRANSPORT === "native"
    )
  ) {
    return new NativeMessagingTransport({
      hostName: NATIVE_HOST.development,
      runtime: options.nativeRuntime,
    });
  }
  return new MockAuriTransport(getMockScenario(environment.VITE_AURI_MOCK_SCENARIO));
}
