import { useState } from "react";
import type { Dashboard, PlayerView } from "@sleeper-caffeine/ipc-contract";
import {
  CountBadge,
  Page,
  PageHeading,
  SectionTitle,
} from "../../components/layout/PageLayout.js";
import styles from "./RosterPage.module.css";

export function RosterPage({ dashboard }: { dashboard: Dashboard }) {
  const sections = [
    ["Starting lineup", dashboard.starters],
    ["Bench", dashboard.bench],
    ["Injured reserve", dashboard.reserve],
    ["Taxi squad", dashboard.taxi],
  ] as const;
  return (
    <Page>
      <PageHeading
        eyebrow="Personnel"
        title="Roster room"
        description={`${dashboard.rosterPositions.join(" · ")} · ${dashboard.scoringLabel}`}
      />
      {sections.map(
        ([title, players]) =>
          players.length > 0 && (
            <section className={styles.section} key={title}>
              <SectionTitle
                title={title}
                trailing={<CountBadge>{players.length}</CountBadge>}
              />
              <div className={styles.grid}>
                {players.map((player, index) => (
                  <PlayerCard
                    player={player}
                    key={`${player.playerId}-${String(index)}`}
                  />
                ))}
              </div>
            </section>
          ),
      )}
    </Page>
  );
}

function PlayerCard({ player }: { player: PlayerView }) {
  return (
    <article className={styles.card}>
      <PlayerPhoto player={player} />
      <div className={styles.copy}>
        <span>{player.rosterSlot ?? player.position ?? "NFL"}</span>
        <h3>{player.name}</h3>
        <p>
          {player.nflTeam ?? "FA"} · {player.position ?? "—"}
        </p>
      </div>
      {player.injuryStatus && <em>{player.injuryStatus}</em>}
    </article>
  );
}

function PlayerPhoto({ player }: { player: PlayerView }) {
  const [failed, setFailed] = useState(false);
  if (failed || player.playerId === "0")
    return <span className={styles.fallback}>{initials(player.name)}</span>;
  return (
    <span className={styles.photo}>
      <img
        src={`https://sleepercdn.com/content/nfl/players/${player.playerId}.jpg`}
        alt=""
        onError={() => setFailed(true)}
      />
    </span>
  );
}

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}
