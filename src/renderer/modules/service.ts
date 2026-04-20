import { applyAppCommand } from "./appCommands";
type ServiceUi = {
  col: number;
  row: number;
  radius: number;
  showInGrid: boolean;
};

type ServiceState = {
  preset: {
    ui: {
      mode: "edit" | "use";
      grid: { cols: number; rows: number };
      service?: Partial<ServiceUi>;
    };
    buttons: Array<{ id: string; position: { col: number; row: number } }>;
  };
  ui: {
    isDirty: boolean;
    selectedTarget: "button" | "service" | null;
    selectedButtonId: string | null;
    selectedButtonIds?: string[];
  };
};

type ServiceDeps = {
  state: ServiceState;
  canEdit: () => boolean;
  dispatch: (command: { type: "preset.toggleMode" }) => void;
  render: () => void;
  setStatus: (message: string) => void;
  showToast: (message: string, type?: string) => void;
  confirmDiscardChanges: () => boolean;
  getButtonAtCell: (col: number, row: number) => { id: string; position: { col: number; row: number } } | null;
  onMinimizeWindow: () => void;
  onCloseWindow: () => void;
};

export type ServiceController = {
  serviceConfig: () => ServiceUi;
  isServiceCell: (col: number, row: number) => boolean;
  serviceCellElement: (compact: boolean, source?: string, inactive?: boolean) => HTMLElement;
  serviceTopBarElement: () => HTMLElement;
  ensureServiceCellVacant: () => void;
  handleServiceAction: (action: string | null, source?: string | null) => boolean;
};

export function createServiceController({
  state,
  canEdit,
  dispatch,
  render,
  setStatus,
  showToast,
  confirmDiscardChanges,
  getButtonAtCell,
  onMinimizeWindow,
  onCloseWindow
}: ServiceDeps): ServiceController {
  const SVG_NS = "http://www.w3.org/2000/svg";

  const createIcon = (paths: string[]): SVGSVGElement => {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 16 16");
    svg.setAttribute("aria-hidden", "true");
    for (const d of paths) {
      const path = document.createElementNS(SVG_NS, "path");
      path.setAttribute("d", d);
      svg.appendChild(path);
    }
    return svg;
  };

  const createServiceButton = ({
    source,
    action,
    title,
    ariaLabel,
    iconPaths,
    inactive = false,
    dirtyIndicator = false,
    dragHandle = false
  }: {
    source: string;
    action: string;
    title: string;
    ariaLabel: string;
    iconPaths: string[];
    inactive?: boolean;
    dirtyIndicator?: boolean;
    dragHandle?: boolean;
  }): HTMLButtonElement => {
    const button = document.createElement("button");
    button.classList.add("service-btn");
    if (inactive) button.classList.add("inactive");
    if (dirtyIndicator) button.classList.add("dirty-indicator");
    if (dragHandle) button.classList.add("drag-handle");
    button.disabled = inactive;
    button.dataset.serviceSource = source;
    button.dataset.serviceAction = action;
    button.title = title;
    button.setAttribute("aria-label", ariaLabel);
    button.appendChild(createIcon(iconPaths));
    return button;
  };

  const serviceConfig = (): ServiceUi => {
    const raw = state.preset.ui.service;
    return {
      col: Number(raw?.col ?? 0),
      row: Number(raw?.row ?? 0),
      radius: Number(raw?.radius ?? 8),
      showInGrid: typeof raw?.showInGrid === "boolean" ? raw.showInGrid : true
    };
  };

  const isServiceCell = (col: number, row: number): boolean => {
    const service = serviceConfig();
    if (!service.showInGrid) {
      return false;
    }
    return col === service.col && row === service.row;
  };

  const serviceCellElement = (compact: boolean, source = "grid", inactive = false): HTMLElement => {
    const root = document.createElement("div");
    root.className = compact ? "service single" : "service";
    if (compact) {
      root.appendChild(
        createServiceButton({
          source,
          action: "toggle-mode",
          title: "Toggle edit/use (Cmd/Ctrl+E)",
          ariaLabel: "Toggle mode",
          iconPaths: ["M3.5 5.5h9", "M3.5 8h9", "M3.5 10.5h9"],
          inactive
        })
      );
      return root;
    }

    root.appendChild(
      createServiceButton({
        source,
        action: "close",
        title: "Close window",
        ariaLabel: "Close",
        iconPaths: ["M4 4l8 8", "M12 4l-8 8"],
        inactive,
        dirtyIndicator: state.ui.isDirty
      })
    );
    root.appendChild(
      createServiceButton({
        source,
        action: "minimize",
        title: "Minimize window",
        ariaLabel: "Minimize",
        iconPaths: ["M3 12.5h10"],
        inactive
      })
    );
    root.appendChild(
      createServiceButton({
        source,
        action: "toggle-mode",
        title: "Toggle edit/use (Cmd/Ctrl+E)",
        ariaLabel: "Toggle mode",
        iconPaths: ["M3.5 5.5h9", "M3.5 8h9", "M3.5 10.5h9"],
        inactive
      })
    );
    root.appendChild(
      createServiceButton({
        source,
        action: "drag",
        title: "Drag to move the window",
        ariaLabel: "Move window",
        iconPaths: [
          "M8 2.5v11",
          "M2.5 8h11",
          "M8 2.5l-1.8 1.8",
          "M8 2.5l1.8 1.8",
          "M8 13.5l-1.8-1.8",
          "M8 13.5l1.8-1.8",
          "M2.5 8l1.8-1.8",
          "M2.5 8l1.8 1.8",
          "M13.5 8l-1.8-1.8",
          "M13.5 8l-1.8 1.8"
        ],
        inactive,
        dragHandle: !inactive
      })
    );
    return root;
  };

  const serviceTopBarElement = (): HTMLElement => {
    const root = document.createElement("div");
    root.className = "service-top";
    root.appendChild(
      createServiceButton({
        source: "top",
        action: "close",
        title: "Close window",
        ariaLabel: "Close",
        iconPaths: ["M4 4l8 8", "M12 4l-8 8"],
        dirtyIndicator: state.ui.isDirty
      })
    );
    root.appendChild(
      createServiceButton({
        source: "top",
        action: "minimize",
        title: "Minimize window",
        ariaLabel: "Minimize",
        iconPaths: ["M3 12.5h10"]
      })
    );
    root.appendChild(
      createServiceButton({
        source: "top",
        action: "toggle-mode",
        title: "Toggle edit/use (Cmd/Ctrl+E)",
        ariaLabel: "Toggle mode",
        iconPaths: ["M3.5 5.5h9", "M3.5 8h9", "M3.5 10.5h9"]
      })
    );
    return root;
  };

  const ensureServiceCellVacant = (): void => {
    const service = serviceConfig();
    const clampedCol = Math.max(0, Math.min(state.preset.ui.grid.cols - 1, Number(service.col) || 0));
    const clampedRow = Math.max(0, Math.min(state.preset.ui.grid.rows - 1, Number(service.row) || 0));
    if (clampedCol !== service.col || clampedRow !== service.row) {
      applyAppCommand(state, { type: "service.setPosition", col: clampedCol, row: clampedRow });
    }

    const occupant = getButtonAtCell(clampedCol, clampedRow);
    if (!occupant) {
      return;
    }
    for (let row = 0; row < state.preset.ui.grid.rows; row += 1) {
      for (let col = 0; col < state.preset.ui.grid.cols; col += 1) {
        if (isServiceCell(col, row)) {
          continue;
        }
        if (!getButtonAtCell(col, row)) {
          applyAppCommand(state, {
            type: "layout.moveButtonToCell",
            buttonId: occupant.id,
            col,
            row
          });
          return;
        }
      }
    }
  };

  const handleServiceAction = (action: string | null, source?: string | null): boolean => {
    if (!action) {
      return false;
    }
    if (canEdit()) {
      state.ui.selectedTarget = "service";
      state.ui.selectedButtonId = null;
      state.ui.selectedButtonIds = [];
      if (source === "grid") {
        render();
        return true;
      }
    }

    if (action === "minimize") {
      onMinimizeWindow();
      return true;
    }
    if (action === "close") {
      if (state.ui.isDirty) {
        showToast("Unsaved changes. Save before closing?", "info");
      }
      if (!confirmDiscardChanges()) {
        return true;
      }
      onCloseWindow();
      return true;
    }
    if (action === "toggle-mode") {
      dispatch({ type: "preset.toggleMode" });
      setStatus(`Mode: ${state.preset.ui.mode}`);
      return true;
    }
    return false;
  };

  return {
    serviceConfig,
    isServiceCell,
    serviceCellElement,
    serviceTopBarElement,
    ensureServiceCellVacant,
    handleServiceAction
  };
}
