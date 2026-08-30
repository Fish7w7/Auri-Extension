import { PROTOCOL_VERSION, pageContextSchema } from "@auri/protocol";
import { describe, expect, it } from "vitest";

import { MockAuriTransport } from "../src/transport/mock-auri-transport";

describe("integração com @auri/protocol", () => {
  it("negocia a versão pública e produz PageContext aceito pelo pacote", async () => {
    const transport = new MockAuriTransport("matched");
    const hello = await transport.hello({
      client: { kind: "extension", name: "Auri Extension", version: "0.1.0" },
      supportedProtocolVersions: [PROTOCOL_VERSION],
    });

    expect(hello.protocolVersion).toBe(PROTOCOL_VERSION);
    expect(pageContextSchema.safeParse({ url: "https://example.com/chapter-1" }).success).toBe(true);
  });
});
