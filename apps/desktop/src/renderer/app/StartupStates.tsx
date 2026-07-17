import sleeperCaffeineBadge from "../assets/sleeper-caffeine-badge.svg";
import { Button } from "../components/ui/index.js";
import styles from "./StartupStates.module.css";

export function EmptyLeague({ onAdd }: { onAdd(): void }) {
  return (
    <div className={styles.empty}>
      <CoffeeBall />
      <h1>Wake up your front office.</h1>
      <p>
        Connect a public Sleeper league, choose your team, and let Caffeine
        build the room around it.
      </p>
      <Button variant="primary" onClick={onAdd}>
        Add a Sleeper league
      </Button>
    </div>
  );
}

export function LaunchScreen({ error }: { error: string | null }) {
  return (
    <div className={styles.launch}>
      <img src={sleeperCaffeineBadge} alt="Sleeper Caffeine" />
      <strong>Sleeper Caffeine</strong>
      <span>{error ?? "Warming up the front office…"}</span>
    </div>
  );
}

function CoffeeBall() {
  return (
    <div className="coffee-ball">
      <div className="football">
        <i />
        <i />
        <i />
        <i />
        <i />
      </div>
      <span className="steam one" />
      <span className="steam two" />
      <div className="orbit">
        <b>WR</b>
        <b>RB</b>
        <b>QB</b>
      </div>
    </div>
  );
}
