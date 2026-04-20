import { describe, expect, test } from "vitest";
import { createHistoryController } from "../src/renderer/modules/history";
import { applyAppCommand } from "../src/renderer/modules/appCommands";

function makeState() {
  return {
    preset: {
      ui: {
        mode: "edit",
        grid: { cols: 4, rows: 3 },
        buttonSize: { w: 72, h: 72 },
        service: { col: 0, row: 0, radius: 8, showInGrid: true }
      },
      settings: { onCommandError: "stop" },
      contacts: [],
      buttons: [
        {
          id: "a",
          label: "A",
          style: { bgColor: "#111111", textColor: "#ffffff", fontSize: 12, radius: 6 },
          position: { col: 1, row: 0 },
          commands: []
        }
      ]
    },
    ui: {
      selectedButtonId: "a",
      selectedButtonIds: ["a"],
      selectedTarget: "button",
      selectedContactId: null,
      activeRightTab: "button",
      isDirty: true
    }
  };
}

describe("history controller (operation-based)", () => {
  test("undo/redo applies inverse commands and restores UI snapshot", () => {
    const state = makeState() as any;
    let renders = 0;
    const history = createHistoryController({
      state,
      render: () => {
        renders += 1;
      }
    });

    const forward = { type: "button.setLabel", buttonId: "a", label: "B" } as const;
    const backward = { type: "button.setLabel", buttonId: "a", label: "A" } as const;
    const uiBefore = {
      selectedButtonId: "a",
      selectedButtonIds: ["a"],
      selectedTarget: "button",
      selectedContactId: null,
      activeRightTab: "connections"
    } as const;
    const uiAfter = {
      selectedButtonId: "a",
      selectedButtonIds: ["a"],
      selectedTarget: "button",
      selectedContactId: null,
      activeRightTab: "button"
    } as const;

    applyAppCommand(state, forward);
    history.record({ forward: [forward], backward: [backward], uiBefore, uiAfter });

    expect(state.preset.buttons[0].label).toBe("B");
    expect(history.undo()).toBe(true);
    expect(state.preset.buttons[0].label).toBe("A");
    expect(state.ui.activeRightTab).toBe("connections");

    expect(history.redo()).toBe(true);
    expect(state.preset.buttons[0].label).toBe("B");
    expect(state.ui.activeRightTab).toBe("button");
    expect(renders).toBe(2);
  });

  test("reset clears undo/redo stacks", () => {
    const state = makeState() as any;
    const history = createHistoryController({ state, render: () => {} });

    const forward = { type: "button.setLabel", buttonId: "a", label: "B" } as const;
    const backward = { type: "button.setLabel", buttonId: "a", label: "A" } as const;
    applyAppCommand(state, forward);
    history.record({
      forward: [forward],
      backward: [backward],
      uiBefore: {
        selectedButtonId: "a",
        selectedButtonIds: ["a"],
        selectedTarget: "button"
      },
      uiAfter: {
        selectedButtonId: "a",
        selectedButtonIds: ["a"],
        selectedTarget: "button"
      }
    });

    history.reset();
    expect(history.undo()).toBe(false);
    expect(history.redo()).toBe(false);
  });

  test("record groups consecutive entries with same key", () => {
    const state = makeState() as any;
    const history = createHistoryController({ state, render: () => {} });

    const f1 = { type: "button.setLabel", buttonId: "a", label: "B" } as const;
    const b1 = { type: "button.setLabel", buttonId: "a", label: "A" } as const;
    applyAppCommand(state, f1);
    history.record(
      {
        forward: [f1],
        backward: [b1],
        uiBefore: { selectedButtonId: "a", selectedButtonIds: ["a"], selectedTarget: "button" },
        uiAfter: { selectedButtonId: "a", selectedButtonIds: ["a"], selectedTarget: "button" }
      },
      { groupKey: "label" }
    );

    const f2 = { type: "button.setLabel", buttonId: "a", label: "C" } as const;
    const b2 = { type: "button.setLabel", buttonId: "a", label: "B" } as const;
    applyAppCommand(state, f2);
    history.record(
      {
        forward: [f2],
        backward: [b2],
        uiBefore: { selectedButtonId: "a", selectedButtonIds: ["a"], selectedTarget: "button" },
        uiAfter: { selectedButtonId: "a", selectedButtonIds: ["a"], selectedTarget: "button" }
      },
      { groupKey: "label" }
    );

    expect(history.undo()).toBe(true);
    expect(state.preset.buttons[0].label).toBe("A");
  });
});
