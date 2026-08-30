import {
  CAPABILITIES,
  PROTOCOL_VERSION,
  type Capability,
  type DesktopOpenAddWorkParams,
  type ProgressUpdateParams,
  type SourceAddParams,
  type SystemHelloParams,
  type WorkOpenParams,
  type WorkResolveParams,
  type WorkResolveResult,
} from "@auri/protocol";

import { TransportFailure, type AuriTransport } from "./auri-transport";

export const MOCK_SCENARIOS = [
  "disconnected",
  "matched",
  "matched_no_source",
  "not_found",
  "ambiguous",
  "incompatible",
  "error",
  "missing_capability",
] as const;

export type MockScenario = (typeof MOCK_SCENARIOS)[number];

const pause = () => new Promise<void>((resolve) => setTimeout(resolve, 140));

const source = {
  id: "source-mangadex",
  name: "MangaDex",
  domain: "mangadex.org",
  status: "active" as const,
  isPreferred: false,
};

const matchedWork = {
  id: "work-nano-machine",
  title: "Nano Machine",
  currentChapter: { value: "326", numericValue: 326 },
};

export class MockAuriTransport implements AuriTransport {
  constructor(private readonly scenario: MockScenario) {}

  async hello(_params: SystemHelloParams) {
    await pause();
    if (this.scenario === "disconnected") throw new TransportFailure("disconnected");
    if (this.scenario === "incompatible") throw new TransportFailure("incompatible");
    if (this.scenario === "error") throw new TransportFailure("error");

    const capabilities: Capability[] =
      this.scenario === "missing_capability"
        ? CAPABILITIES.filter((capability) => capability !== "progress.update")
        : [...CAPABILITIES];

    return {
      protocolVersion: PROTOCOL_VERSION,
      server: { kind: "desktop" as const, name: "Auri Desktop", version: "0.1.0" },
      capabilities,
    };
  }

  async resolveWork(_params: WorkResolveParams): Promise<WorkResolveResult> {
    await pause();
    if (this.scenario === "not_found") return { status: "not_found" };
    if (this.scenario === "ambiguous") {
      return {
        status: "ambiguous",
        candidates: [
          {
            work: matchedWork,
            source,
            match: { matchedBy: "title", confidence: "possible" },
          },
          {
            work: {
              id: "work-nano-machine-novel",
              title: "Nano Machine (Novel)",
              currentChapter: { value: "318", numericValue: 318 },
            },
            match: { matchedBy: "alias", confidence: "possible" },
          },
        ],
      };
    }

    return {
      status: "matched",
      work: matchedWork,
      ...(this.scenario === "matched_no_source" ? {} : { source }),
      match: { matchedBy: "title", confidence: "high" },
    };
  }

  async openWork(_params: WorkOpenParams) {
    await pause();
    return { opened: true as const };
  }

  async openAddWork(_params: DesktopOpenAddWorkParams) {
    await pause();
    return { opened: true as const };
  }

  async addSource(params: SourceAddParams) {
    await pause();
    return {
      source: {
        id: "source-new",
        domain: new URL(params.url).hostname,
        name: params.name,
        status: "active" as const,
        isPreferred: false,
      },
    };
  }

  async updateProgress(_params: ProgressUpdateParams) {
    await pause();
    return { updated: true as const };
  }
}

export function getMockScenario(value: string | undefined): MockScenario {
  return MOCK_SCENARIOS.includes(value as MockScenario)
    ? (value as MockScenario)
    : "disconnected";
}
