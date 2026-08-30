import type { AuriTransport } from "./auri-transport";
import { getMockScenario, MockAuriTransport } from "./mock-auri-transport";

export function createTransport(): AuriTransport {
  return new MockAuriTransport(getMockScenario(import.meta.env.VITE_AURI_MOCK_SCENARIO));
}
