import { useState, type ReactNode } from "react";
import type {
  AiSettings,
  Bootstrap,
  CodexModel,
} from "@sleeper-caffeine/ipc-contract";
import type { CaffeinePendingState } from "../../api/use-caffeine-runtime.js";
import {
  Page,
  PageHeading,
  SectionTitle,
} from "../../components/layout/PageLayout.js";
import { Button, Panel, Select, StatusDot } from "../../components/ui/index.js";
import styles from "./SettingsPage.module.css";

const FALLBACK_CODEX_MODELS: CodexModel[] = [
  model(
    "gpt-5.6-terra",
    "GPT-5.6 Terra",
    "Balanced everyday analysis with strong tool use.",
  ),
  model(
    "gpt-5.6-sol",
    "GPT-5.6 Sol",
    "Deeper analysis and polish for difficult questions.",
    true,
  ),
  model(
    "gpt-5.6-luna",
    "GPT-5.6 Luna",
    "Fast, efficient responses for clear and repeatable tasks.",
  ),
];

export function SettingsPage({
  data,
  onClear,
  onLogin,
  onLogout,
  onAiSettings,
  pending,
}: {
  data: Bootstrap;
  onClear(): void;
  onLogin(): void;
  onLogout(): void;
  onAiSettings(settings: AiSettings): void;
  pending: CaffeinePendingState;
}) {
  const [danger, setDanger] = useState(false);
  const availableModels = data.codex.availableModels.length
    ? data.codex.availableModels
    : FALLBACK_CODEX_MODELS;
  const selectedModel =
    availableModels.find(
      (candidate) => candidate.model === data.aiSettings.model,
    ) ?? availableModels[0];
  const reasoningOptions = (
    selectedModel?.supportedReasoningEfforts ??
    FALLBACK_CODEX_MODELS[0]!.supportedReasoningEfforts
  ).filter((option) => ["low", "medium", "high"].includes(option.effort));
  const selectedEffort =
    reasoningOptions.find(
      (option) => option.effort === data.aiSettings.effort,
    ) ?? reasoningOptions[0];

  return (
    <Page className={styles.page}>
      <PageHeading
        eyebrow="Control room"
        title="Settings"
        description="Local data, model access, and the services running behind Sleeper Caffeine."
      />
      <SettingsGroup title="Codex runtime">
        <SettingRow
          title="Installed Codex"
          detail={data.codex.version ?? "Not detected"}
          status={data.codex.state}
        />
        <SettingRow
          title="Analyst model"
          detail={
            selectedModel?.description ??
            "Choose which Codex model handles fantasy analysis."
          }
          status="active"
          action={
            <Select
              value={data.aiSettings.model}
              disabled={pending.settings}
              onChange={(event) => {
                const next = availableModels.find(
                  (candidate) => candidate.model === event.target.value,
                );
                if (!next) return;
                const effort = next.supportedReasoningEfforts.some(
                  (option) => option.effort === data.aiSettings.effort,
                )
                  ? data.aiSettings.effort
                  : next.defaultReasoningEffort;
                onAiSettings({ model: next.model, effort });
              }}
            >
              {availableModels.map((candidate) => (
                <option key={candidate.model} value={candidate.model}>
                  {candidate.displayName}
                </option>
              ))}
            </Select>
          }
        />
        <SettingRow
          title="Reasoning effort"
          detail={
            selectedEffort?.description ??
            "Higher effort improves depth but takes longer."
          }
          status="active"
          action={
            <Select
              value={data.aiSettings.effort}
              disabled={pending.settings}
              onChange={(event) =>
                onAiSettings({
                  model: data.aiSettings.model,
                  effort: event.target.value,
                })
              }
            >
              {reasoningOptions.map((option) => (
                <option key={option.effort} value={option.effort}>
                  {reasoningLabel(option.effort)}
                </option>
              ))}
            </Select>
          }
        />
        <SettingRow
          title="ChatGPT account"
          detail={data.codex.email ?? "Not signed in"}
          status={data.codex.email ? "connected" : "disconnected"}
          action={
            <Button
              variant="ghost"
              size="small"
              loading={data.codex.email ? pending.logout : pending.login}
              onClick={data.codex.email ? onLogout : onLogin}
            >
              {data.codex.email ? "Sign out" : "Sign in"}
            </Button>
          }
        />
        <SettingRow
          title="Safety profile"
          detail="Read-only sandbox · shell disabled · live web enabled"
          status="locked"
        />
      </SettingsGroup>

      <SettingsGroup title="Local Sleeper MCP">
        <SettingRow
          title="Service"
          detail={data.mcp.endpoint}
          status={data.mcp.state}
        />
        <SettingRow
          title="Connected sessions"
          detail={String(data.mcp.connectedSessions)}
          status={data.mcp.connectedSessions ? "active" : "idle"}
        />
      </SettingsGroup>

      <SettingsGroup title="Storage">
        <SettingRow
          title="Retention"
          detail="League snapshots, reports, and recommendation history are kept indefinitely."
          status="local"
        />
        {!danger ? (
          <Button
            className={styles.dangerLink}
            variant="ghost"
            size="small"
            onClick={() => setDanger(true)}
          >
            Clear local league data…
          </Button>
        ) : (
          <div className={styles.dangerZone}>
            <div>
              <strong>Clear every local league and report?</strong>
              <p>Your isolated ChatGPT login is not removed.</p>
            </div>
            <Button variant="danger" loading={pending.clear} onClick={onClear}>
              Clear everything
            </Button>
            <Button variant="ghost" onClick={() => setDanger(false)}>
              Cancel
            </Button>
          </div>
        )}
      </SettingsGroup>
    </Page>
  );
}

function SettingsGroup({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <Panel className={styles.group}>
      <SectionTitle title={title} />
      {children}
    </Panel>
  );
}

function SettingRow({
  title,
  detail,
  status,
  action,
}: {
  title: string;
  detail: string;
  status: string;
  action?: ReactNode;
}) {
  const healthy = ["ready", "connected", "running", "active"].includes(status);
  const danger = ["error", "unavailable"].includes(status);
  return (
    <div className={styles.row}>
      <div>
        <strong>{title}</strong>
        <span>{detail}</span>
      </div>
      <div className={styles.state}>
        <StatusDot tone={danger ? "danger" : healthy ? "live" : "neutral"} />
        {action ?? status}
      </div>
    </div>
  );
}

function model(
  id: string,
  displayName: string,
  description: string,
  isDefault = false,
): CodexModel {
  return {
    model: id,
    displayName,
    description,
    isDefault,
    defaultReasoningEffort: isDefault ? "low" : "medium",
    supportedReasoningEfforts: [
      { effort: "low", description: "Fast responses with lighter reasoning" },
      {
        effort: "medium",
        description: "Balances speed and reasoning depth for everyday tasks",
      },
      {
        effort: "high",
        description: "Greater reasoning depth for complex decisions",
      },
    ],
  };
}

function reasoningLabel(value: string): string {
  return value === "low"
    ? "Low · Faster"
    : value === "medium"
      ? "Medium · Balanced"
      : value === "high"
        ? "High · Deeper"
        : value;
}
