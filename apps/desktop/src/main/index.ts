import { app, BrowserWindow, ipcMain, shell } from "electron";
import { join } from "node:path";
import { z } from "zod/v4";
import {
  IPC_CHANNELS,
  AiSettingsSchema,
  ChatHistoryCursorSchema,
  ReportKindSchema,
  type RuntimeEvent,
} from "@sleeper-caffeine/ipc-contract";
import { AppRuntime } from "./runtime.js";

let mainWindow: BrowserWindow | null = null;
let runtime: AppRuntime | null = null;

function requireRuntime(): AppRuntime {
  if (!runtime) throw new Error("Sleeper Caffeine is still starting");
  return runtime;
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1440,
    height: 930,
    minWidth: 1050,
    minHeight: 720,
    titleBarStyle: "hiddenInset",
    backgroundColor: "#0c100e",
    show: false,
    webPreferences: {
      preload: join(import.meta.dirname, "../preload/index.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  window.once("ready-to-show", () => window.show());
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) void shell.openExternal(url);
    return { action: "deny" };
  });
  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void window.loadFile(join(import.meta.dirname, "../renderer/index.html"));
  }
  return window;
}

function registerIpc(): void {
  ipcMain.handle(IPC_CHANNELS.bootstrap, () => requireRuntime().bootstrap());
  ipcMain.handle(IPC_CHANNELS.previewLeague, (_event, input: unknown) =>
    requireRuntime().previewLeague(z.string().min(1).max(500).parse(input)),
  );
  ipcMain.handle(IPC_CHANNELS.saveLeague, (_event, input: unknown) =>
    requireRuntime().saveLeague(
      z
        .object({
          leagueId: z.string(),
          rosterId: z.number().int(),
          userId: z.string(),
        })
        .parse(input),
    ),
  );
  ipcMain.handle(IPC_CHANNELS.setActiveLeague, (_event, leagueId: unknown) =>
    requireRuntime().setActiveLeague(z.string().parse(leagueId)),
  );
  ipcMain.handle(IPC_CHANNELS.refreshActiveLeague, () =>
    requireRuntime().refreshActiveLeague(),
  );
  ipcMain.handle(IPC_CHANNELS.generateReport, (_event, kind: unknown) =>
    requireRuntime().generateReport(ReportKindSchema.parse(kind)),
  );
  ipcMain.handle(IPC_CHANNELS.loadChatHistory, (_event, input: unknown) =>
    requireRuntime().loadChatHistory(
      z
        .object({
          leagueId: z.string().min(1),
          before: ChatHistoryCursorSchema.nullable(),
          limit: z.number().int().min(1).max(200).optional(),
        })
        .transform(({ leagueId, before, limit }) => ({
          leagueId,
          before,
          ...(limit === undefined ? {} : { limit }),
        }))
        .parse(input),
    ),
  );
  ipcMain.handle(IPC_CHANNELS.sendChat, (_event, message: unknown) =>
    requireRuntime().sendChat(z.string().min(1).max(10_000).parse(message)),
  );
  ipcMain.handle(IPC_CHANNELS.codexLogin, async () => {
    const codex = requireRuntime().codex;
    if (!codex) throw new Error("Codex is still starting");
    await shell.openExternal(await codex.login());
  });
  ipcMain.handle(IPC_CHANNELS.codexLogout, async () => {
    const codex = requireRuntime().codex;
    if (!codex) throw new Error("Codex is still starting");
    await codex.logout();
  });
  ipcMain.handle(IPC_CHANNELS.clearLocalData, () =>
    requireRuntime().clearLocalData(),
  );
  ipcMain.handle(IPC_CHANNELS.updateAiSettings, (_event, input: unknown) =>
    requireRuntime().updateAiSettings(AiSettingsSchema.parse(input)),
  );
  ipcMain.handle(
    IPC_CHANNELS.toggleDraftCandidatePin,
    (_event, playerId: unknown) =>
      requireRuntime().toggleDraftCandidatePin(
        z.string().min(1).max(100).parse(playerId),
      ),
  );
  ipcMain.handle(IPC_CHANNELS.openExternal, async (_event, input: unknown) => {
    const url = z.string().url().parse(input);
    if (!url.startsWith("https://"))
      throw new Error("Only HTTPS links can be opened");
    await shell.openExternal(url);
  });
}

void app.whenReady().then(() => {
  runtime = new AppRuntime(app.getPath("userData"));
  runtime.on("runtime-event", (event: RuntimeEvent) =>
    mainWindow?.webContents.send(IPC_CHANNELS.runtimeEvent, event),
  );
  registerIpc();
  mainWindow = createWindow();
  void runtime.start().catch((error: unknown) => {
    console.error(
      "Sleeper Caffeine background services failed to start",
      error,
    );
  });
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow();
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
app.on("before-quit", () => {
  void runtime?.stop();
});
