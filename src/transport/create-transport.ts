import type { AuriTransport } from "./auri-transport";
import { NATIVE_HOST } from "../config/native-hosts";
import { getMockScenario, MockAuriTransport } from "./mock-auri-transport";
import { NativeMessagingTransport } from "./native-messaging-transport";

export interface TransportEnvironment {
  readonly MODE: string;
  readonly VITE_AURI_TRANSPORT?: string;
  readonly VITE_AURI_MOCK_SCENARIO?: string;
}

export type TransportSelection =
  | { readonly kind: "native"; readonly hostName: string }
  | { readonly kind: "mock"; readonly scenario: ReturnType<typeof getMockScenario> };

export function selectTransport(environment: TransportEnvironment): TransportSelection {
  if (environment.MODE === "production" || environment.MODE === "embedded") {
    return { kind: "native", hostName: NATIVE_HOST.production };
  }
  if (
    environment.MODE === "dev-native" ||
    (
      environment.MODE === "development" &&
      environment.VITE_AURI_TRANSPORT === "native"
    )
  ) {
    return { kind: "native", hostName: NATIVE_HOST.development };
  }
  return {
    kind: "mock",
    scenario: getMockScenario(environment.VITE_AURI_MOCK_SCENARIO),
  };
}

export function createTransport(): AuriTransport {
  if (__AURI_BUILD_TRANSPORT__ === "native") {
    return new NativeMessagingTransport({ hostName: __AURI_NATIVE_HOST__ });
  }
  return new MockAuriTransport(getMockScenario(import.meta.env.VITE_AURI_MOCK_SCENARIO));
}
