import { useMemo, useRef } from "react";
import { readActivePage, type ActivePageResult } from "../extraction/read-active-tab";
import type { AuriTransport } from "../transport/auri-transport";
import { createTransport } from "../transport/create-transport";
import { PopupShell, ActionFeedback } from "./PopupShell";
import { ConnectionView } from "./ConnectionView";
import { ResolutionView } from "./ResolutionView";
import { navigateCurrentTab } from "./page-context";
import type { NavigateToUrl, PopupViewProps } from "./popup-state";
import { usePopupActions } from "./use-popup-actions";
import { usePopupSession } from "./use-popup-session";

export { createWorkContextParams, navigateCurrentTab } from "./page-context";

interface PopupAppProps {
  transport?: AuriTransport;
  readPage?: () => Promise<ActivePageResult>;
  navigateToUrl?: NavigateToUrl;
}

export function PopupApp({ transport: provided, readPage = readActivePage, navigateToUrl }: PopupAppProps) {
  const transport = useMemo(() => provided ?? createTransport(), [provided]);
  const { state, load, invalidateLoads } = usePopupSession(transport, readPage);
  return <PopupView state={state} transport={transport} navigateToUrl={navigateToUrl}
    onRetry={() => load(true)} onActionStart={invalidateLoads} />;
}

export function PopupView(props: PopupViewProps) {
  const { state, transport } = props;
  const previous = useRef({ transport, revision: 0 });
  if (previous.current.transport !== transport) {
    previous.current = { transport, revision: previous.current.revision + 1 };
  }
  const result = state.status === "ready" ? state.result : undefined;
  const match = result?.status === "matched" ? [result.work.id, result.match] : result?.status;
  const identity = JSON.stringify([previous.current.revision, state.status, match, "context" in state && state.context]);
  return <PopupSession key={identity} {...props} identity={identity} />;
}

function PopupSession({ state, transport, onRetry, onRefreshContext, onActionStart,
  navigateToUrl = navigateCurrentTab, identity }: PopupViewProps & { identity: string }) {
  const actions = usePopupActions(state.status === "ready" ? state.result : undefined, onActionStart);
  return (
    <PopupShell status={state.status}>
      {state.status === "ready"
        ? <ResolutionView state={state} actions={actions} transport={transport}
            identity={identity} navigate={navigateToUrl} readContext={onRefreshContext} />
        : <ConnectionView state={state} actions={actions} onRetry={onRetry} />}
      <ActionFeedback feedback={actions.feedback} />
    </PopupShell>
  );
}
