import {
  ActionBarPrimitive,
  AssistantRuntimeProvider,
  AuiIf,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useExternalStoreRuntime,
  type AppendMessage,
  type ThreadMessageLike,
} from "@assistant-ui/react";
import type {
  ChatHistoryPage,
  ChatMessage,
  CodexStatus,
} from "@sleeper-caffeine/ipc-contract";
import { useCallback, useMemo, useState } from "react";
import { caffeineClient } from "../api/caffeine-client.js";
import { Button } from "../components/ui/index.js";
import { MarkdownText } from "./MarkdownText.js";
import styles from "./CaffeineAssistant.module.css";

type RunStatus = "running" | "complete" | "failed";

export type CaffeineChatRun = {
  leagueId: string;
  runId: string;
  userMessage: ChatMessage;
  delta: string;
  status: RunStatus;
  assistantMessage: ChatMessage | null;
  error: string | null;
};

type RuntimeChatMessage = ChatMessage & {
  runtimeStatus?: RunStatus;
  runtimeError?: string | null;
};

export function CaffeineAssistant({
  leagueId,
  persistedMessages,
  initialHasMore,
  activeRun,
  codexStatus,
  sendPending,
  onSend,
  onLogin,
}: {
  leagueId: string;
  persistedMessages: ChatMessage[];
  initialHasMore: boolean;
  activeRun: CaffeineChatRun | null;
  codexStatus: CodexStatus;
  sendPending: boolean;
  onSend(message: string): Promise<void>;
  onLogin(): void;
}) {
  const [olderMessages, setOlderMessages] = useState<ChatMessage[]>([]);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const relevantRun = activeRun?.leagueId === leagueId ? activeRun : null;
  const messages = useMemo(
    () =>
      withRunMessages(
        mergeMessages(olderMessages, persistedMessages),
        relevantRun,
      ),
    [olderMessages, persistedMessages, relevantRun],
  );

  const loadEarlier = useCallback(async () => {
    const first = mergeMessages(olderMessages, persistedMessages)[0];
    if (!first || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const page: ChatHistoryPage = await caffeineClient.loadChatHistory({
        leagueId,
        before: { createdAt: first.createdAt, id: first.id },
        limit: 50,
      });
      setOlderMessages((current) => mergeMessages(page.messages, current));
      setHasMore(page.hasMore);
    } finally {
      setLoadingOlder(false);
    }
  }, [leagueId, loadingOlder, olderMessages, persistedMessages]);

  const handleNew = useCallback(
    async (message: AppendMessage) => {
      const text = message.content
        .filter((part) => part.type === "text")
        .map((part) => part.text)
        .join("\n\n")
        .trim();
      if (!text)
        throw new Error(
          "Sleeper Caffeine currently supports text prompts only",
        );
      await onSend(text);
    },
    [onSend],
  );

  const convertMessage = useCallback(
    (message: RuntimeChatMessage): ThreadMessageLike => ({
      id: message.id,
      role: message.role,
      content: message.content,
      createdAt: new Date(message.createdAt),
      ...(message.role === "assistant"
        ? {
            status:
              message.runtimeStatus === "running"
                ? ({ type: "running" } as const)
                : message.runtimeStatus === "failed"
                  ? ({
                      type: "incomplete",
                      reason: "error",
                      error: message.runtimeError ?? "Codex turn failed",
                    } as const)
                  : ({ type: "complete", reason: "stop" } as const),
          }
        : {}),
    }),
    [],
  );

  const isReady = codexStatus.state === "ready";
  const isRunning = sendPending || relevantRun?.status === "running";
  const runtime = useExternalStoreRuntime<RuntimeChatMessage>({
    messages,
    isRunning,
    isSendDisabled: !isReady || isRunning,
    onNew: handleNew,
    convertMessage,
    unstable_capabilities: { copy: true },
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <CaffeineThread
        empty={messages.length === 0}
        hasMore={hasMore}
        loadingOlder={loadingOlder}
        signedOut={codexStatus.state === "signed_out"}
        onLoadEarlier={() => void loadEarlier()}
        onLogin={onLogin}
      />
    </AssistantRuntimeProvider>
  );
}

function CaffeineThread({
  empty,
  hasMore,
  loadingOlder,
  signedOut,
  onLoadEarlier,
  onLogin,
}: {
  empty: boolean;
  hasMore: boolean;
  loadingOlder: boolean;
  signedOut: boolean;
  onLoadEarlier(): void;
  onLogin(): void;
}) {
  return (
    <ThreadPrimitive.Root className={styles.root}>
      <ThreadPrimitive.Viewport className="caffeine-thread-viewport" autoScroll>
        {hasMore && (
          <button
            className="caffeine-load-history"
            disabled={loadingOlder}
            onClick={onLoadEarlier}
          >
            {loadingOlder
              ? "Loading earlier conversation…"
              : "Load earlier conversation"}
          </button>
        )}
        {empty && <ConversationWelcome />}
        <ThreadPrimitive.Messages>
          {({ message }) =>
            message.role === "user" ? <UserMessage /> : <AssistantMessage />
          }
        </ThreadPrimitive.Messages>
        <ThreadPrimitive.ScrollToBottom className="caffeine-scroll-bottom">
          ↓
        </ThreadPrimitive.ScrollToBottom>
        <ThreadPrimitive.ViewportFooter className="caffeine-thread-footer">
          {signedOut ? (
            <div className="drawer-login">
              <p>Connect ChatGPT to use the conversational analyst.</p>
              <Button variant="primary" onClick={onLogin}>
                Connect ChatGPT
              </Button>
            </div>
          ) : (
            <Composer />
          )}
        </ThreadPrimitive.ViewportFooter>
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root>
  );
}

function ConversationWelcome() {
  return (
    <div className="conversation-empty">
      <div className="conversation-coffee">☕</div>
      <h3>Ask the hard question.</h3>
      <p>
        I can inspect every roster, your picks and settings, then research the
        current football context.
      </p>
      <div className="conversation-suggestions">
        <ThreadPrimitive.Suggestion
          prompt="Where is my roster most fragile right now?"
          autoSend
        >
          Where am I most fragile?
        </ThreadPrimitive.Suggestion>
        <ThreadPrimitive.Suggestion
          prompt="Which players on my roster are most expendable?"
          autoSend
        >
          Who is expendable?
        </ThreadPrimitive.Suggestion>
      </div>
    </div>
  );
}

function UserMessage() {
  return (
    <MessagePrimitive.Root className="caffeine-message user">
      <MessagePrimitive.Parts />
    </MessagePrimitive.Root>
  );
}

function AssistantMessage() {
  return (
    <MessagePrimitive.Root className="caffeine-message assistant">
      <div className="assistant-message-mark">
        <span /> Caffeine
      </div>
      <MessagePrimitive.Parts components={{ Text: MarkdownText }} />
      <AuiIf condition={(state) => state.message.status?.type === "running"}>
        <div className="assistant-thinking">
          <i /> Researching
        </div>
      </AuiIf>
      <AuiIf condition={(state) => state.message.status?.type === "incomplete"}>
        <div className="assistant-error">This response did not complete.</div>
      </AuiIf>
      <ActionBarPrimitive.Root className="assistant-actions" hideWhenRunning>
        <ActionBarPrimitive.Copy copiedDuration={1600}>
          <CopyIcon /> Copy
        </ActionBarPrimitive.Copy>
      </ActionBarPrimitive.Root>
    </MessagePrimitive.Root>
  );
}

function Composer() {
  return (
    <ComposerPrimitive.Root className="caffeine-composer">
      <ComposerPrimitive.Input
        className="caffeine-composer-input"
        placeholder="Ask about your roster, a player, or a trade…"
        rows={2}
      />
      <ComposerPrimitive.Send className="caffeine-composer-send">
        <SendIcon />
      </ComposerPrimitive.Send>
    </ComposerPrimitive.Root>
  );
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="8" y="8" width="11" height="11" rx="2" />
      <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m5 12 14-7-4 14-3-6-7-1Z" />
      <path d="m12 13 7-8" />
    </svg>
  );
}

export function mergeMessages(...groups: ChatMessage[][]): ChatMessage[] {
  const merged = new Map<string, ChatMessage>();
  for (const group of groups)
    for (const message of group) merged.set(message.id, message);
  return [...merged.values()];
}

export function withRunMessages(
  messages: ChatMessage[],
  run: CaffeineChatRun | null,
): RuntimeChatMessage[] {
  if (!run) return messages;
  const next: RuntimeChatMessage[] = [...messages];
  if (!next.some((message) => message.id === run.userMessage.id))
    next.push(run.userMessage);
  if (run.status === "complete" && run.assistantMessage) {
    if (!next.some((message) => message.id === run.assistantMessage?.id))
      next.push(run.assistantMessage);
    return next;
  }
  next.push({
    id: `run:${run.runId}`,
    leagueId: run.leagueId,
    role: "assistant",
    content:
      run.status === "failed"
        ? `I couldn't finish that response. ${run.error ?? "Please try again."}`
        : run.delta || "Reading Sleeper data and researching…",
    createdAt: run.userMessage.createdAt,
    runtimeStatus: run.status,
    runtimeError: run.error,
  });
  return next;
}
