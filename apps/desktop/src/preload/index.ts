import { contextBridge, ipcRenderer } from "electron";
import {
  IPC_CHANNELS,
  type RuntimeEvent,
  type SleeperCaffeineApi,
} from "@sleeper-caffeine/ipc-contract";

const api: SleeperCaffeineApi = {
  bootstrap: () => ipcRenderer.invoke(IPC_CHANNELS.bootstrap),
  previewLeague: (input) =>
    ipcRenderer.invoke(IPC_CHANNELS.previewLeague, input),
  saveLeague: (input) => ipcRenderer.invoke(IPC_CHANNELS.saveLeague, input),
  setActiveLeague: (leagueId) =>
    ipcRenderer.invoke(IPC_CHANNELS.setActiveLeague, leagueId),
  refreshActiveLeague: () =>
    ipcRenderer.invoke(IPC_CHANNELS.refreshActiveLeague),
  generateReport: (kind) =>
    ipcRenderer.invoke(IPC_CHANNELS.generateReport, kind),
  sendChat: (message) => ipcRenderer.invoke(IPC_CHANNELS.sendChat, message),
  loginCodex: () => ipcRenderer.invoke(IPC_CHANNELS.codexLogin),
  logoutCodex: () => ipcRenderer.invoke(IPC_CHANNELS.codexLogout),
  clearLocalData: () => ipcRenderer.invoke(IPC_CHANNELS.clearLocalData),
  updateAiSettings: (input) =>
    ipcRenderer.invoke(IPC_CHANNELS.updateAiSettings, input),
  openExternal: (url) => ipcRenderer.invoke(IPC_CHANNELS.openExternal, url),
  onRuntimeEvent: (listener) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      runtimeEvent: RuntimeEvent,
    ) => listener(runtimeEvent);
    ipcRenderer.on(IPC_CHANNELS.runtimeEvent, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.runtimeEvent, handler);
  },
};

contextBridge.exposeInMainWorld("sleeperCaffeine", api);
