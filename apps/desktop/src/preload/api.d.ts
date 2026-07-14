import type { SleeperCaffeineApi } from "@sleeper-caffeine/ipc-contract";

declare global {
  interface Window {
    sleeperCaffeine: SleeperCaffeineApi;
  }
}

export {};
