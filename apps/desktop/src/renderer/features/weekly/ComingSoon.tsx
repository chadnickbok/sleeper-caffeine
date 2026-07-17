import type { Dashboard } from "@sleeper-caffeine/ipc-contract";
import { Page, Eyebrow } from "../../components/layout/PageLayout.js";
import { Icon } from "../../components/ui/index.js";
import styles from "./ComingSoon.module.css";

export function ComingSoon({
  type,
  dashboard,
}: {
  type: "waivers" | "lineup";
  dashboard: Dashboard;
}) {
  const waiver = type === "waivers";
  return (
    <Page className={styles.page}>
      <Eyebrow>Arriving after Week 1</Eyebrow>
      <h1>
        {waiver
          ? "Waiver signal, without the noise."
          : "Start the right players for this league."}
      </h1>
      <p>
        {waiver
          ? "Sleeper availability, role changes, roster fit, and evidence-backed FAAB thinking need real weekly data. We’ll switch this on when the signal is honest."
          : "Scoring, flex rules, current injuries, weather, usage and matchup context—joined only when games give us something real to reason about."}
      </p>
      <div className={styles.visual}>
        <div className={styles.scanLine} />
        <Icon name={waiver ? "spark" : "bolt"} />
        <strong>{dashboard.league.teamName}</strong>
        <span>Week {dashboard.week} · standing by</span>
      </div>
    </Page>
  );
}
