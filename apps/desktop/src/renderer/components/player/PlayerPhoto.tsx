import { useState } from "react";
import type { PlayerView } from "@sleeper-caffeine/ipc-contract";
import styles from "./PlayerPhoto.module.css";

export function PlayerPhoto({
  player,
  small = false,
}: {
  player: PlayerView;
  small?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const className = small ? styles.small : styles.root;
  if (failed || player.playerId === "0")
    return (
      <span className={`${className} ${styles.fallback}`}>
        {initials(player.name)}
      </span>
    );
  return (
    <span className={className}>
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
