import { describe, expect, test } from "vitest";
import { applyAppCommand, deriveCommandHistoryDelta } from "../src/renderer/modules/appCommands";

function makeState() {
  return {
    preset: {
      ui: {
        mode: "edit",
        grid: { cols: 4, rows: 3 },
        buttonSize: { w: 72, h: 72 },
        service: { col: 0, row: 0, radius: 8, showInGrid: true }
      },
      buttons: [
        {
          id: "a",
          label: "A",
          style: {
            bgColor: "#111111",
            textColor: "#ffffff",
            fontSize: 12,
            radius: 6,
            wrapLabel: false
          },
          position: { col: 1, row: 0 },
          commands: [
            { name: "q0", contactId: "c-udp", payload: { type: "string", value: "A0" } },
            { name: "q1", contactId: "c-udp", payload: { type: "string", value: "A1" } }
          ]
        },
        {
          id: "b",
          label: "B",
          style: {
            bgColor: "#222222",
            textColor: "#eeeeee",
            fontSize: 14,
            radius: 7,
            wrapLabel: true
          },
          position: { col: 2, row: 0 },
          commands: [{ name: "only", contactId: "c-udp", payload: { type: "string", value: "B0" } }]
        }
      ],
      contacts: [
        { id: "c-udp", name: "U", protocol: "udp", target: { host: "127.0.0.1", port: 7000 } },
        { id: "c-osc", name: "O", protocol: "osc-udp", target: { host: "127.0.0.1", port: 9000 } }
      ],
      settings: { onCommandError: "stop" }
    },
    ui: {
      selectedButtonId: "a",
      selectedButtonIds: ["a"],
      selectedTarget: "button",
      activeRightTab: "button",
      isDirty: false,
      selectedContactId: null
    }
  };
}

describe("applyAppCommand", () => {
  test("button.setBgColor updates multiple buttons", () => {
    const state = makeState() as any;
    applyAppCommand(state, {
      type: "button.setBgColor",
      buttonIds: ["a", "b"],
      color: "#abcdef"
    });
    expect(state.preset.buttons[0].style.bgColor).toBe("#abcdef");
    expect(state.preset.buttons[1].style.bgColor).toBe("#abcdef");
  });

  test("button.setBgOpacity updates multiple buttons", () => {
    const state = makeState() as any;
    applyAppCommand(state, {
      type: "button.setBgOpacity",
      buttonIds: ["a", "b"],
      bgOpacity: 40
    });
    expect(state.preset.buttons[0].style.bgOpacity).toBe(40);
    expect(state.preset.buttons[1].style.bgOpacity).toBe(40);
  });

  test("button.setBorderColor updates multiple buttons", () => {
    const state = makeState() as any;
    applyAppCommand(state, {
      type: "button.setBorderColor",
      buttonIds: ["a", "b"],
      color: "#778899"
    });
    expect(state.preset.buttons[0].style.borderColor).toBe("#778899");
    expect(state.preset.buttons[1].style.borderColor).toBe("#778899");
  });

  test("layout.deleteButton removes and resets selection", () => {
    const state = makeState() as any;
    applyAppCommand(state, { type: "layout.deleteButton", buttonId: "a" });
    expect(state.preset.buttons.map((b: { id: string }) => b.id)).toEqual(["b"]);
    expect(state.ui.selectedButtonId).toBe("b");
    expect(state.ui.selectedButtonIds).toEqual(["b"]);
  });

  test("layout.addButton appends and selects", () => {
    const state = makeState() as any;
    const btn = {
      id: "new1",
      label: "N",
      style: { bgColor: "#000", textColor: "#fff", fontSize: 10, radius: 4 },
      position: { col: 2, row: 0 },
      commands: [{ name: "C1" }]
    };
    applyAppCommand(state, { type: "layout.addButton", button: btn });
    expect(state.preset.buttons).toHaveLength(3);
    expect(state.ui.selectedButtonId).toBe("new1");
  });

  test("button.toggleWrapLabel flips flag", () => {
    const state = makeState() as any;
    applyAppCommand(state, { type: "button.toggleWrapLabel", buttonId: "a" });
    expect(state.preset.buttons[0].style.wrapLabel).toBe(true);
  });

  test("service.setRadius writes ui.service", () => {
    const state = makeState() as any;
    applyAppCommand(state, { type: "service.setRadius", radius: 12 });
    expect(state.preset.ui.service.radius).toBe(12);
  });

  test("layout.moveServiceToCell moves occupant to old service slot", () => {
    const state = makeState() as any;
    applyAppCommand(state, { type: "layout.moveServiceToCell", col: 1, row: 0 });
    expect(state.preset.ui.service.col).toBe(1);
    expect(state.preset.ui.service.row).toBe(0);
    expect(state.preset.buttons.find((b: { id: string }) => b.id === "a")?.position).toEqual({
      col: 0,
      row: 0
    });
    expect(state.ui.selectedTarget).toBe("service");
  });

  test("layout.swapButtonWithService exchanges button and service cells", () => {
    const state = makeState() as any;
    applyAppCommand(state, { type: "layout.swapButtonWithService", buttonId: "b" });
    expect(state.preset.ui.service.col).toBe(2);
    expect(state.preset.ui.service.row).toBe(0);
    expect(state.preset.buttons.find((b: { id: string }) => b.id === "b")?.position).toEqual({
      col: 0,
      row: 0
    });
    expect(state.ui.selectedButtonId).toBe("b");
  });

  test("layout.swapButtonPositions swaps two buttons", () => {
    const state = makeState() as any;
    applyAppCommand(state, {
      type: "layout.swapButtonPositions",
      draggedId: "a",
      occupantId: "b"
    });
    expect(state.preset.buttons.find((b: { id: string }) => b.id === "a")?.position).toEqual({
      col: 2,
      row: 0
    });
    expect(state.preset.buttons.find((b: { id: string }) => b.id === "b")?.position).toEqual({
      col: 1,
      row: 0
    });
    expect(state.ui.selectedButtonId).toBe("a");
  });

  test("layout.moveButtonToCell updates position and selection", () => {
    const state = makeState() as any;
    applyAppCommand(state, { type: "layout.moveButtonToCell", buttonId: "a", col: 3, row: 2 });
    expect(state.preset.buttons.find((b: { id: string }) => b.id === "a")?.position).toEqual({
      col: 3,
      row: 2
    });
    expect(state.ui.selectedButtonId).toBe("a");
  });

  test("button.moveCommand reorders commands", () => {
    const state = makeState() as any;
    applyAppCommand(state, {
      type: "button.moveCommand",
      buttonId: "a",
      fromIndex: 0,
      toIndex: 2
    });
    const cmds = state.preset.buttons[0].commands as { name: string }[];
    expect(cmds.map((c) => c.name)).toEqual(["q1", "q0"]);
  });

  test("button.deleteCommand removes a command", () => {
    const state = makeState() as any;
    applyAppCommand(state, { type: "button.deleteCommand", buttonId: "a", commandIndex: 0 });
    expect((state.preset.buttons[0].commands as unknown[]).length).toBe(1);
    expect((state.preset.buttons[0].commands as { name: string }[])[0].name).toBe("q1");
  });

  test("button.setCommandContactId switches to OSC shape for osc-udp contact", () => {
    const state = makeState() as any;
    applyAppCommand(state, {
      type: "button.setCommandContactId",
      buttonId: "a",
      commandIndex: 0,
      contactId: "c-osc"
    });
    const cmd = (state.preset.buttons[0].commands as Record<string, unknown>[])[0];
    expect(cmd.contactId).toBe("c-osc");
    expect(cmd.osc).toBeTruthy();
    expect(cmd.payload).toBeUndefined();
  });

  test("button.setCommandName and toggleCommandCollapsed", () => {
    const state = makeState() as any;
    applyAppCommand(state, {
      type: "button.setCommandName",
      buttonId: "a",
      commandIndex: 0,
      name: "Renamed"
    });
    expect((state.preset.buttons[0].commands as { name: string }[])[0].name).toBe("Renamed");
    applyAppCommand(state, {
      type: "button.toggleCommandCollapsed",
      buttonId: "a",
      commandIndex: 0
    });
    expect((state.preset.buttons[0].commands as { isCollapsed?: boolean }[])[0].isCollapsed).toBe(
      true
    );
  });

  test("contacts.addContact and updateContact", () => {
    const state = makeState() as any;
    applyAppCommand(state, {
      type: "contacts.addContact",
      contact: { id: "c-new", name: "N", protocol: "udp", target: { host: "10.0.0.1", port: 1111 } }
    });
    expect(state.preset.contacts.some((c: { id: string }) => c.id === "c-new")).toBe(true);
    expect(state.ui.selectedContactId).toBe("c-new");
    applyAppCommand(state, {
      type: "contacts.updateContact",
      contactId: "c-new",
      name: "N2",
      protocol: "tcp",
      host: "10.0.0.2",
      port: 2222
    });
    const row = state.preset.contacts.find((c: { id: string }) => c.id === "c-new") as any;
    expect(row.name).toBe("N2");
    expect(row.protocol).toBe("tcp");
    expect(row.target.port).toBe(2222);
  });

  test("contacts.deleteContact clears command refs and selection", () => {
    const state = makeState() as any;
    state.ui.selectedContactId = "c-udp";
    applyAppCommand(state, { type: "contacts.deleteContact", contactId: "c-udp" });
    expect(state.preset.contacts.every((c: { id: string }) => c.id !== "c-udp")).toBe(true);
    expect((state.preset.buttons[0].commands as { contactId?: string }[])[0].contactId).toBe("");
    expect(state.ui.selectedContactId).toBe(null);
  });

  test("contacts.ensureFromLegacyCommands creates contact from legacy command target", () => {
    const state = makeState() as any;
    (state.preset.buttons[0].commands as any[]).push({
      name: "legacy",
      protocol: "udp",
      target: { host: "9.9.9.9", port: 9999 },
      payload: { type: "string", value: "x" }
    });
    applyAppCommand(state, { type: "contacts.ensureFromLegacyCommands" });
    const cmd = (state.preset.buttons[0].commands as { contactId?: string }[])[2];
    expect(cmd.contactId).toBeTruthy();
    expect(state.preset.contacts.some((c: any) => c.target?.host === "9.9.9.9")).toBe(true);
  });

  test("preset.replace swaps preset and selection", () => {
    const state = makeState() as any;
    const next = {
      ...state.preset,
      version: 5,
      buttons: [{ id: "x", label: "X", style: {}, position: { col: 0, row: 0 }, commands: [] }],
      contacts: [{ id: "cx", name: "C", protocol: "udp", target: { host: "1.1.1.1", port: 1 } }]
    };
    applyAppCommand(state, { type: "preset.replace", preset: next });
    expect(state.preset.version).toBe(5);
    expect(state.ui.selectedButtonId).toBe("x");
    expect(state.ui.selectedContactId).toBe("cx");
  });

  test("derive delta for bulk bg keeps per-button inverse", () => {
    const state = makeState() as any;
    const delta = deriveCommandHistoryDelta(state, {
      type: "button.setBgColor",
      buttonIds: ["a", "b"],
      color: "#abcdef"
    });
    expect(delta?.backward).toEqual([
      { type: "button.setBgColor", buttonIds: ["a"], color: "#111111" },
      { type: "button.setBgColor", buttonIds: ["b"], color: "#222222" }
    ]);
  });

  test("derive delta for bulk bg opacity keeps per-button inverse", () => {
    const state = makeState() as any;
    state.preset.buttons[0].style.bgOpacity = 80;
    state.preset.buttons[1].style.bgOpacity = 55;
    const delta = deriveCommandHistoryDelta(state, {
      type: "button.setBgOpacity",
      buttonIds: ["a", "b"],
      bgOpacity: 20
    });
    expect(delta?.backward).toEqual([
      { type: "button.setBgOpacity", buttonIds: ["a"], bgOpacity: 80 },
      { type: "button.setBgOpacity", buttonIds: ["b"], bgOpacity: 55 }
    ]);
  });

  test("derive delta for bulk border color keeps per-button inverse", () => {
    const state = makeState() as any;
    state.preset.buttons[0].style.borderColor = "#111111";
    state.preset.buttons[1].style.borderColor = "#222222";
    const delta = deriveCommandHistoryDelta(state, {
      type: "button.setBorderColor",
      buttonIds: ["a", "b"],
      color: "#334455"
    });
    expect(delta?.backward).toEqual([
      { type: "button.setBorderColor", buttonIds: ["a"], color: "#111111" },
      { type: "button.setBorderColor", buttonIds: ["b"], color: "#222222" }
    ]);
  });

  test("derive delta for contacts.deleteContact preserves contact refs", () => {
    const state = makeState() as any;
    const delta = deriveCommandHistoryDelta(state, { type: "contacts.deleteContact", contactId: "c-udp" });
    expect(delta?.backward[0]).toMatchObject({ type: "contacts.addContact" });
    expect(delta?.backward.some((cmd: any) => cmd.type === "button.replaceCommand")).toBe(true);
  });
});
