import type { QuickButtonApi } from "../ipc/client";

declare global {
  interface Window {
    quickButtonApi: QuickButtonApi;
  }
}

export {};
