type GridState = {
  preset: {
    ui: {
      mode: "edit" | "use";
      grid: { cols: number; rows: number };
      buttonSize: { w: number; h: number };
    };
    buttons: Array<{
      id: string;
      label: string;
      style: Record<string, unknown>;
      position: { col: number; row: number };
      commands: unknown[];
    }>;
  };
  ui: {
    selectedTarget: "button" | "service" | null;
    selectedButtonId: string | null;
    selectedButtonIds?: string[];
  };
};

import type { AppCommand } from "./appCommands";
import { trackOnboardingStep } from "./onboarding";

type GridDeps = {
  state: GridState;
  gridEl: HTMLElement;
  topServiceSlotEl: HTMLElement | null;
  canEdit: () => boolean;
  dispatch: (command: AppCommand) => void;
  render: () => void;
  runButton: (btn: unknown) => Promise<void>;
  showToast: (message: string, type?: string) => void;
  nowId: (prefix: string) => string;
  defaultCommand: (name?: string) => unknown;
  MAX_BUTTONS: number;
  getButtonAtCell: (col: number, row: number) => GridState["preset"]["buttons"][number] | null;
  isServiceCell: (col: number, row: number) => boolean;
  serviceConfig: () => { col: number; row: number; radius: number };
  ensureServiceCellVacant: () => void;
  serviceCellElement: (compact: boolean, source?: string, inactive?: boolean) => HTMLElement;
  serviceTopBarElement: () => HTMLElement;
  gridBackgroundConfig: () => { color: string; opacity: number };
  applyButtonStyleToElement: (el: HTMLElement, btn: unknown) => void;
  applyEditorFromSelection: () => void;
};

export type GridController = {
  renderGrid: () => void;
};

export function createGridController({
  state,
  gridEl,
  topServiceSlotEl,
  canEdit,
  dispatch,
  render,
  runButton,
  showToast,
  nowId,
  defaultCommand,
  MAX_BUTTONS,
  getButtonAtCell,
  isServiceCell,
  serviceConfig,
  ensureServiceCellVacant,
  serviceCellElement,
  serviceTopBarElement,
  gridBackgroundConfig,
  applyButtonStyleToElement,
  applyEditorFromSelection
}: GridDeps): GridController {
  let draggingButtonId: string | null = null;
  let draggingService = false;

  const renderGrid = (): void => {
    const { cols, rows } = state.preset.ui.grid;
    const { w, h } = state.preset.ui.buttonSize;
    const gridBg = gridBackgroundConfig();
    const compactService = h < 32;
    const serviceGapX = Math.max(2, Math.round(w * 0.055));
    const serviceGapY = Math.max(2, Math.round(h * 0.055));
    const serviceButtonWidth = Math.max(10, Math.floor((w - serviceGapX) / 2));
    const serviceButtonHeight = Math.max(10, Math.floor((h - serviceGapY) / 2));
    ensureServiceCellVacant();

    gridEl.style.gridTemplateColumns = `repeat(${cols}, ${w}px)`;
    gridEl.style.gridTemplateRows = `repeat(${rows}, ${h}px)`;
    gridEl.style.setProperty("--service-gap-x", `${serviceGapX}px`);
    gridEl.style.setProperty("--service-gap-y", `${serviceGapY}px`);
    gridEl.style.setProperty("--service-btn-width", `${serviceButtonWidth}px`);
    gridEl.style.setProperty("--service-btn-height", `${serviceButtonHeight}px`);
    gridEl.style.setProperty("--service-radius", `${serviceConfig().radius ?? 8}px`);
    const red = Number.parseInt(gridBg.color.slice(1, 3), 16);
    const green = Number.parseInt(gridBg.color.slice(3, 5), 16);
    const blue = Number.parseInt(gridBg.color.slice(5, 7), 16);
    gridEl.style.background = `rgba(${red}, ${green}, ${blue}, ${gridBg.opacity})`;
    if (topServiceSlotEl) {
      topServiceSlotEl.replaceChildren(serviceTopBarElement());
    }
    gridEl.textContent = "";

    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const cell = document.createElement("div");
        cell.className = "cell";
        cell.dataset.col = String(col);
        cell.dataset.row = String(row);
        cell.style.width = `${w}px`;
        cell.style.height = `${h}px`;

        if (state.preset.ui.mode === "edit") {
          cell.addEventListener("dragover", (event) => {
            event.preventDefault();
            cell.classList.add("over");
          });
          cell.addEventListener("dragleave", () => cell.classList.remove("over"));
          cell.addEventListener("drop", (event) => {
            event.preventDefault();
            cell.classList.remove("over");

            if (draggingService) {
              const svcPos = serviceConfig();
              if (col === svcPos.col && row === svcPos.row) return;
              dispatch({ type: "layout.moveServiceToCell", col, row });
              return;
            }

            if (!draggingButtonId) return;
            const dragged = state.preset.buttons.find((item) => item.id === draggingButtonId);
            if (!dragged) return;

            if (isServiceCell(col, row)) {
              dispatch({ type: "layout.swapButtonWithService", buttonId: dragged.id });
              return;
            }

            const occupant = getButtonAtCell(col, row);
            if (occupant && occupant.id !== dragged.id) {
              dispatch({
                type: "layout.swapButtonPositions",
                draggedId: dragged.id,
                occupantId: occupant.id
              });
              return;
            }
            dispatch({ type: "layout.moveButtonToCell", buttonId: dragged.id, col, row });
          });
        }

        if (isServiceCell(col, row)) {
          if (canEdit() && state.ui.selectedTarget === "service") {
            cell.classList.add("service-selected");
          }
          cell.appendChild(serviceCellElement(compactService, "grid", state.preset.ui.mode === "edit"));
          if (state.preset.ui.mode === "edit") {
            const serviceWrap = cell.querySelector(".service");
            if (serviceWrap) {
              const serviceWrapEl = serviceWrap as HTMLElement;
              serviceWrapEl.draggable = canEdit() && state.ui.selectedTarget === "service";
              serviceWrapEl.addEventListener("dragstart", () => {
                draggingService = true;
                draggingButtonId = null;
              });
              serviceWrapEl.addEventListener("dragend", () => {
                draggingService = false;
              });
            }
            cell.addEventListener("click", () => {
              state.ui.selectedTarget = "service";
              state.ui.selectedButtonId = null;
              state.ui.selectedButtonIds = [];
              render();
            });
          }
          gridEl.appendChild(cell);
          continue;
        }

        const btn = getButtonAtCell(col, row);
        if (btn) {
          const uiBtn = document.createElement("button");
          uiBtn.className = "user-btn";
          uiBtn.dataset.btnId = btn.id;
          uiBtn.title = `${btn.label} (${btn.id})`;
          uiBtn.draggable = state.preset.ui.mode === "edit";
          applyButtonStyleToElement(uiBtn, btn);
          uiBtn.textContent = btn.label;

          if (
            canEdit() &&
            state.ui.selectedTarget === "button" &&
            state.ui.selectedButtonId === btn.id
          ) {
            uiBtn.style.outline = "2px solid #7ad2ff";
          }
          const selectedIds = new Set(state.ui.selectedButtonIds ?? []);
          if (canEdit() && selectedIds.has(btn.id) && state.ui.selectedButtonId !== btn.id) {
            uiBtn.classList.add("multi-selected");
          }

          uiBtn.addEventListener("click", async (event) => {
            if (state.preset.ui.mode === "use") {
              await runButton(btn);
              return;
            }
            const shiftKey = Boolean((event as MouseEvent).shiftKey);
            state.ui.selectedTarget = "button";
            state.ui.selectedButtonId = btn.id;
            if (shiftKey && canEdit()) {
              const current = new Set(state.ui.selectedButtonIds ?? []);
              current.add(btn.id);
              state.ui.selectedButtonIds = Array.from(current);
            } else {
              state.ui.selectedButtonIds = [btn.id];
            }
            applyEditorFromSelection();
            render();
          });

          uiBtn.addEventListener("dragstart", () => {
            draggingService = false;
            draggingButtonId = btn.id;
          });
          uiBtn.addEventListener("dragend", () => {
            draggingButtonId = null;
          });

          cell.appendChild(uiBtn);
        } else if (state.preset.ui.mode === "edit") {
          const add = document.createElement("button");
          add.textContent = "+";
          add.addEventListener("click", () => {
            if (state.preset.buttons.length >= MAX_BUTTONS) {
              showToast("Max 100 buttons reached");
              return;
            }
            const newButton = {
              id: nowId("btn"),
              label: `Btn ${state.preset.buttons.length + 1}`,
              style: {
                bgColor: "#252525",
                textColor: "#ffffff",
                fontSize: 13,
                radius: 8
              },
              position: { col, row },
              commands: [defaultCommand("Command 1")]
            };
            dispatch({ type: "layout.addButton", button: newButton });
            trackOnboardingStep("button");
          });
          cell.appendChild(add);
        }

        gridEl.appendChild(cell);
      }
    }
  };

  return { renderGrid };
}
