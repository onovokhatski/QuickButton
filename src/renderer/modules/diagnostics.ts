type DiagnosticsDeps = {
  reportError: (payload: {
    sessionId?: string;
    kind: string;
    name: string;
    message: string;
    stack?: string;
    source?: string;
    lineno?: number;
    colno?: number;
  }) => void;
};

export function installRendererDiagnostics({ reportError }: DiagnosticsDeps): void {
  window.addEventListener("error", (event) => {
    const err = event?.error;
    reportError({
      kind: "error",
      name: err?.name ?? "Error",
      message: err?.message ?? event?.message ?? "Unknown error",
      stack: err?.stack ?? "",
      source: event?.filename ?? "",
      lineno: event?.lineno ?? 0,
      colno: event?.colno ?? 0
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event?.reason;
    const isError = reason instanceof Error;
    reportError({
      kind: "unhandledrejection",
      name: isError ? reason.name : "UnhandledRejection",
      message: isError ? reason.message : String(reason ?? "unhandled rejection"),
      stack: isError ? (reason.stack ?? "") : "",
      source: ""
    });
  });
}
