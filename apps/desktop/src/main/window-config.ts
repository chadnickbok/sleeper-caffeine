import type { BrowserWindowConstructorOptions } from "electron";
import type { DesktopPlatform } from "@sleeper-caffeine/ipc-contract";

export const DEFAULT_WINDOW_SIZE = { width: 1440, height: 930 } as const;
export const MINIMUM_WINDOW_SIZE = { width: 1050, height: 720 } as const;

export function createWindowOptions(
  platform: DesktopPlatform,
): BrowserWindowConstructorOptions {
  return {
    ...DEFAULT_WINDOW_SIZE,
    minWidth: MINIMUM_WINDOW_SIZE.width,
    minHeight: MINIMUM_WINDOW_SIZE.height,
    ...(platform === "darwin"
      ? {
          titleBarStyle: "hiddenInset" as const,
          trafficLightPosition: { x: 16, y: 18 },
        }
      : {}),
    backgroundColor: "#07131f",
    show: false,
  };
}
