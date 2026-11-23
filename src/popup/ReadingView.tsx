import type { ReactNode } from "react";
import { t } from "../i18n";
import { formatChapter, type ReadingModel } from "./reading-model";
import { ActionButton, Icon } from "./PopupShell";
import type { PopupAction, PopupActions } from "./use-popup-actions";

const relationIcons = { ahead: "forward", behind: "back", same: "check", series_page: "bookmark", unknown: "info" } as const;

function ProgressCard({ reading, children }: { reading: ReadingModel; children: ReactNode }) {
  return <section className="progress-card" aria-label={t("progressLabel")}>
    <h2 className="eyebrow">{t("progressLabel")}</h2>
    <dl className="chapter-pair">
      <div><dt><Icon name="bookmark" />{reading.savedLabel}</dt><dd>{formatChapter(reading.saved)}</dd></div>
      <div><dt><Icon name="page" />{t("progressPage")}</dt><dd>{formatChapter(reading.detected)}</dd></div>
    </dl>
    <div className={`relation relation--${reading.relation}`}>
      <Icon name={relationIcons[reading.relation]} />
      <div><p>{reading.summary}</p>{reading.stoppedAt && <p>{reading.stoppedAt}</p>}</div>
    </div>
    {children}
  </section>;
}

export function ReadingView({ reading, commands, actions, confirmation }: {
  reading: ReadingModel; commands: PopupAction[]; actions: PopupActions; confirmation: ReactNode;
}) {
  return <>
    <section className="work-header" aria-label={t("workContextLabel")}>
      <div className="work-details">
        <p className="eyebrow">{t("inLibrary")}</p>
        <h1>{reading.title}</h1>
        {reading.status && <p className="reading-status">{reading.status}</p>}
      </div>
      <span className="book-tab" aria-hidden="true"><Icon name="book" /></span>
    </section>
    <ProgressCard reading={reading}>{confirmation}</ProgressCard>
    {reading.note && <p className="notice"><Icon name="info" />{reading.note}</p>}
    {commands.length > 0 && <div className="actions">{commands.map((action, index) =>
      <ActionButton key={action.id} actions={actions} action={action} secondary={index > 0} />
    )}</div>}
    <footer className="source-footer"><Icon name="link" /><strong>{reading.sourceName}</strong><span>{reading.sourceStatus}</span></footer>
  </>;
}
