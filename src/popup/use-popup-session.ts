import { PROTOCOL_VERSION, isKnownCapability, type PageContext } from "@auri/protocol";
import { useCallback, useEffect, useRef, useState } from "react";
import { EXTENSION_VERSION } from "../config/extension";
import type { ActivePageResult } from "../extraction/read-active-tab";
import {
  isDesktopUnavailableFailure,
  isIncompatibleFailure,
  isNativeHostUnavailableFailure,
  TransportFailure,
  type AuriTransport,
} from "../transport/auri-transport";
import { createWorkContextParams } from "./page-context";
import type { PopupState } from "./popup-state";
import { hasTrustedWorkIdentity } from "./work-identity";

export function usePopupSession(transport: AuriTransport, readPage: () => Promise<ActivePageResult>) {
  const [state, setState] = useState<PopupState>({ status: "loading" });

  const loadSequence = useRef(0);
  const invalidateLoads = useCallback(() => { loadSequence.current += 1; }, []);

  const load = useCallback(async (preserveCurrent = false) => {
    const id = ++loadSequence.current;
    const commit = (next: PopupState) => { if (id === loadSequence.current) setState(next); };
    if (!preserveCurrent) commit({ status: "loading" });
    let context: PageContext | undefined;

    try {
      const hello = await transport.hello({
        client: { kind: "extension", name: "auri-extension", version: EXTENSION_VERSION },
        supportedProtocolVersions: [PROTOCOL_VERSION],
      });
      if (hello.protocolVersion !== PROTOCOL_VERSION) {
        commit({ status: "incompatible" });
        return;
      }
      if (id !== loadSequence.current) return;
      const capabilities = hello.capabilities.filter(isKnownCapability);
      if (!capabilities.includes("work.resolve")) {
        commit({ status: "error" });
        return;
      }

      const page = await readPage();
      if (page.status === "unsupported") {
        commit({ status: "unsupported" });
        return;
      }
      if (id !== loadSequence.current) return;
      context = page.context;
      const result = await transport.resolveWork(context);
      if (id !== loadSequence.current) return;
      const workContext = hasTrustedWorkIdentity(result) && capabilities.includes("work.context")
        ? await transport.getWorkContext(createWorkContextParams(result.work.id, context))
        : undefined;

      if (workContext && result.status === "matched" && workContext.work.id !== result.work.id) throw new TransportFailure("invalid_message");
      commit({
        status: "ready",
        context,
        result,
        capabilities,
        ...(workContext ? { workContext } : {}),
        ...(page.coverUrl ? { coverUrl: page.coverUrl } : {}),
      });
    } catch (error) {
      const withContext = context ? { context } : {};
      if (isNativeHostUnavailableFailure(error)) {
        commit({ status: "integration_unavailable", ...withContext });
      } else if (isDesktopUnavailableFailure(error)) {
        commit({ status: "desktop_unavailable", ...withContext });
      } else if (isIncompatibleFailure(error)) {
        commit({ status: "incompatible", ...withContext });
      } else {
        if (import.meta.env.DEV) console.error("Falha de comunicação com o Auri", error);
        commit({ status: "error", ...withContext });
      }
    }
  }, [readPage, transport]);

  useEffect(() => {
    void load();
    const onActivated = () => { void load(); };
    const onUpdated = (_id: number, change: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab) => {
      if (tab.active && change.url) void load();
    };
    chrome.tabs?.onActivated?.addListener(onActivated);
    chrome.tabs?.onUpdated?.addListener(onUpdated);
    return () => {
      loadSequence.current += 1;
      chrome.tabs?.onActivated?.removeListener(onActivated);
      chrome.tabs?.onUpdated?.removeListener(onUpdated);
      transport.close();
    };
  }, [load, transport]);

  return { state, load, invalidateLoads };
}
