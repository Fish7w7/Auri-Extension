import {
  CAPABILITIES,
  PROTOCOL_VERSION,
  type KnownCapability,
  type DesktopOpenAddWorkParams,
  type ProgressUpdateParams,
  type SourceAddParams,
  type SystemHelloParams,
  type SystemHelloResult,
  type WorkOpenParams,
  type WorkContextParams,
  type WorkContextResult,
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
  "legacy",
  "context_series",
  "context_ahead",
  "context_same",
  "context_behind",
  "context_no_progress",
  "context_unlinked",
  "context_ambiguous",
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
  private progress: WorkContextResult["work"]["progress"] = {
    value: "14",
    numericValue: 14,
  };
  private sourceState: WorkContextResult["source"]["state"] = "linked";

  constructor(private readonly scenario: MockScenario) {
    if (scenario === "context_no_progress") this.progress = null;
    if (scenario === "context_unlinked" || scenario === "matched_no_source") {
      this.sourceState = "unlinked";
    }
    if (scenario === "context_ambiguous") this.sourceState = "ambiguous";
  }

  async hello(_params: SystemHelloParams): Promise<SystemHelloResult> {
    await pause();
    if (this.scenario === "disconnected") throw new TransportFailure("disconnected");
    if (this.scenario === "incompatible") throw new TransportFailure("incompatible");
    if (this.scenario === "error") throw new TransportFailure("error");

    const supportsContext = this.scenario.startsWith("context_");
    let capabilities: KnownCapability[] = CAPABILITIES.filter((capability) =>
      supportsContext || capability !== "work.context"
    );
    if (this.scenario === "missing_capability") {
      capabilities = capabilities.filter((capability) => capability !== "progress.update");
    }

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

  async getWorkContext(params: WorkContextParams): Promise<WorkContextResult> {
    await pause();
    const detected = params.page.detectedChapter ?? {
      value: "16",
      numericValue: 16,
      confidence: "high" as const,
      source: "url" as const,
    };

    let relation: WorkContextResult["page"]["relation"] = "ahead";
    if (this.scenario === "context_series") relation = "series_page";
    if (this.scenario === "context_same") relation = "same";
    if (this.scenario === "context_behind") relation = "behind";
    if (
      ["matched", "context_ahead", "context_no_progress"].includes(this.scenario) &&
      this.progress?.value === detected.value
    ) {
      relation = "same";
    }

    return {
      work: {
        id: matchedWork.id,
        title: matchedWork.title,
        userStatus: "reading",
        progress: this.progress,
      },
      page: {
        detectedChapter: this.scenario === "context_series" ? null : detected,
        relation,
      },
      source: {
        state: this.sourceState,
        name: "MangaDex",
        domain: "mangadex.org",
        seriesUrl: "https://mangadex.org/title/nano-machine",
        ...(this.sourceState === "linked" ? { matchedSourceId: source.id } : {}),
      },
      continueTarget: this.progress
        ? {
            url: `https://mangadex.org/title/nano-machine/chapter-${this.progress.value}`,
            chapter: this.progress,
          }
        : null,
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
    this.sourceState = "linked";
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

  async updateProgress(params: ProgressUpdateParams) {
    await pause();
    this.progress = params.chapter;
    return { updated: true as const };
  }

  close() {}
}

export function getMockScenario(value: string | undefined): MockScenario {
  return MOCK_SCENARIOS.includes(value as MockScenario)
    ? (value as MockScenario)
    : "disconnected";
}
