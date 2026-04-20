export interface LoadLastResult<TPreset = unknown> {
  preset: TPreset;
  path: string | null;
  recoveredFromBackup?: boolean;
}

export interface QuickButtonApi {
  preset: {
    open(): Promise<unknown>;
    save(payload: unknown): Promise<{ path: string }>;
    saveAs(payload: unknown): Promise<{ path: string }>;
    loadLast(): Promise<LoadLastResult | unknown>;
  };
  runtime: {
    testSend(payload: unknown): Promise<{ ok: boolean; message?: string; code?: string }>;
    executeChain(payload: unknown): Promise<{
      ok: boolean;
      steps: Array<{ ok: boolean; message?: string; code?: string }>;
    }>;
  };
  window: {
    minimize(): Promise<void>;
    close(): Promise<void>;
    startDrag(): Promise<void>;
    setAlwaysOnTop(payload: { value: boolean }): Promise<void>;
    setContentSize(payload: { width: number; height: number }): Promise<void>;
    setIgnoreMouseEvents(payload: { ignore: boolean; forward?: boolean }): Promise<void>;
    getCursorInWindow(): Promise<{ inside: boolean; x: number; y: number }>;
  };
  dialog: {
    pickIconFile(payload: { currentPath?: string }): Promise<{
      canceled: boolean;
      assetId?: string | null;
      error?: string;
    }>;
  };
  diagnostics: {
    reportError(payload: unknown): Promise<void>;
  };
  app: {
    getInfo(): Promise<{ version: string; gitHash?: string; isPackaged: boolean; sessionId?: string }>;
  };
  menu: {
    onAction(handler: (action: string, payload?: unknown) => void): void;
    setShowServiceInGrid(payload: { value: boolean }): Promise<void>;
  };
}

export function getIpcClient(): QuickButtonApi {
  const api = (window as unknown as { quickButtonApi?: QuickButtonApi }).quickButtonApi;
  if (!api) {
    throw new Error("quickButtonApi is not available");
  }
  return api;
}
