export function nowId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
}

export function defaultPreset() {
  return {
    version: "1.0",
    ui: {
      alwaysOnTop: true,
      mode: "edit",
      buttonSize: { w: 72, h: 72 },
      grid: { cols: 4, rows: 3 },
      gridBackground: { color: "#000000", opacity: 0.25 },
      service: { col: 0, row: 0, radius: 8, showInGrid: true },
      clickThroughBackground: true,
      window: { x: 80, y: 80 }
    },
    settings: {
      onCommandError: "stop",
      toastEnabled: true
    },
    contacts: [],
    buttons: []
  };
}
