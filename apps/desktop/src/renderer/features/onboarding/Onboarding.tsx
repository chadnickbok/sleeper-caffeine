import { useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import type { Bootstrap, LeaguePreview } from "@sleeper-caffeine/ipc-contract";
import { caffeineClient } from "../../api/caffeine-client.js";
import sleeperCaffeineBadge from "../../assets/sleeper-caffeine-badge.svg";
import {
  Avatar,
  Button,
  Dialog,
  Field,
  Icon,
  IconButton,
} from "../../components/ui/index.js";
import styles from "./Onboarding.module.css";

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function Onboarding({
  onClose,
  onSaved,
}: {
  onClose?: () => void;
  onSaved(data: Bootstrap): void;
}) {
  const [step, setStep] = useState<"url" | "team">("url");
  const [input, setInput] = useState("");
  const [preview, setPreview] = useState<LeaguePreview | null>(null);
  const [selected, setSelected] = useState<number | null>(null);

  const lookup = useMutation({
    mutationFn: (leagueUrl: string) => caffeineClient.previewLeague(leagueUrl),
    onSuccess: (found) => {
      setPreview(found);
      setSelected(null);
      setStep("team");
    },
  });
  const save = useMutation({
    mutationFn: caffeineClient.saveLeague,
    onSuccess: onSaved,
  });

  const error = lookup.error ?? save.error;
  const selectedTeam = preview?.teams.find(
    (team) => team.rosterId === selected,
  );

  function submitLookup(event: FormEvent) {
    event.preventDefault();
    const leagueUrl = input.trim();
    if (leagueUrl) lookup.mutate(leagueUrl);
  }

  function submitTeam() {
    if (!preview || !selectedTeam) return;
    save.mutate({
      leagueId: preview.leagueId,
      rosterId: selectedTeam.rosterId,
      userId: selectedTeam.userId,
    });
  }

  return (
    <Dialog
      open
      onClose={onClose ?? (() => undefined)}
      label="Connect a Sleeper league"
      className={styles.dialog}
    >
      {onClose && (
        <IconButton
          className={styles.close}
          label="Close league onboarding"
          onClick={onClose}
        >
          <Icon name="close" />
        </IconButton>
      )}

      <section className={styles.art} aria-label="Sleeper Caffeine">
        <img className={styles.badge} src={sleeperCaffeineBadge} alt="" />
        <div className={styles.copy}>
          <span className={styles.eyebrow}>League onboarding</span>
          <h2>
            Wake up your team.
            <br />
            With Caffeine.
          </h2>
          <p>
            Use your Codex subscription and Sleeper’s public API to unlock
            league-specific insights and make sharper roster decisions.
          </p>
        </div>
      </section>

      <section className={styles.formPanel}>
        <div
          className={styles.steps}
          aria-label={`Step ${step === "url" ? 1 : 2} of 2`}
        >
          <span className={styles.complete}>1</span>
          <i />
          <span className={step === "team" ? styles.complete : undefined}>
            2
          </span>
        </div>

        {step === "url" ? (
          <form className={styles.connectForm} onSubmit={submitLookup}>
            <span className={styles.eyebrow}>Step one</span>
            <h3>Connect a league</h3>
            <p>Paste the league URL from Sleeper. Numeric IDs work too.</p>
            <Field
              label="League URL"
              {...(lookup.error ? { error: messageOf(lookup.error) } : {})}
            >
              {(fieldProps) => (
                <input
                  {...fieldProps}
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder="https://sleeper.com/leagues/…"
                />
              )}
            </Field>
            <Button
              className={styles.primaryAction}
              type="submit"
              variant="primary"
              loading={lookup.isPending}
              leading={<Icon name="arrow" />}
              disabled={!input.trim()}
            >
              {lookup.isPending ? "Finding league…" : "Find league"}
            </Button>
          </form>
        ) : (
          preview && (
            <div className={styles.teamStep}>
              <span className={styles.eyebrow}>Step two</span>
              <h3>Which team is yours?</h3>
              <p>
                <strong>{preview.name}</strong> · {preview.season} ·{" "}
                {preview.teams.length} teams
              </p>

              <div className={styles.teamGrid}>
                {preview.teams.map((team) => {
                  const isSelected = selected === team.rosterId;
                  return (
                    <button
                      key={team.rosterId}
                      type="button"
                      className={isSelected ? styles.teamSelected : styles.team}
                      aria-pressed={isSelected}
                      onClick={() => setSelected(team.rosterId)}
                    >
                      <Avatar name={team.teamName} src={team.avatar} />
                      <span className={styles.teamCopy}>
                        <strong>{team.teamName}</strong>
                        <small>
                          {team.displayName} · {team.record}
                        </small>
                      </span>
                      <i className={styles.radio} />
                    </button>
                  );
                })}
              </div>

              {error && (
                <span className={styles.error}>{messageOf(error)}</span>
              )}
              <div className={styles.actions}>
                <Button
                  variant="ghost"
                  onClick={() => {
                    save.reset();
                    setStep("url");
                  }}
                >
                  Back
                </Button>
                <Button
                  variant="primary"
                  loading={save.isPending}
                  leading={<Icon name="arrow" />}
                  disabled={!selectedTeam}
                  onClick={submitTeam}
                >
                  {save.isPending ? "Syncing roster…" : "Open front office"}
                </Button>
              </div>
            </div>
          )
        )}
      </section>
    </Dialog>
  );
}
