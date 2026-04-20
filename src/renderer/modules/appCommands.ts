/**
 * Plan-3 / A1: единая точка мутаций preset (команды).
 * Постепенно переносим сюда логику из events/grid/editor/preset.
 */

import { nowId } from "./model";

/** Второй аргумент `dispatch`: без полного `render()` и/или без `markDirty` (load/replace). */
export type AppDispatchOptions = { render?: boolean; skipMarkDirty?: boolean; historyGroup?: string };
export type CommandHistoryDelta = { forward: AppCommand[]; backward: AppCommand[] };

export type AppCommand =
  | { type: "layout.addButton"; button: Record<string, unknown> }
  | { type: "layout.insertButton"; index: number; button: Record<string, unknown> }
  | { type: "layout.deleteButton"; buttonId: string }
  | { type: "layout.moveServiceToCell"; col: number; row: number }
  | { type: "layout.swapButtonWithService"; buttonId: string }
  | { type: "layout.swapButtonPositions"; draggedId: string; occupantId: string }
  | { type: "layout.moveButtonToCell"; buttonId: string; col: number; row: number }
  | { type: "button.setLabel"; buttonId: string; label: string }
  | { type: "button.setBgColor"; buttonIds: string[]; color: string }
  | { type: "button.setTextColor"; buttonIds: string[]; color: string }
  | { type: "button.setFontSize"; buttonIds: string[]; fontSize: number }
  | { type: "button.setRadius"; buttonIds: string[]; radius: number }
  | { type: "button.toggleWrapLabel"; buttonId: string }
  | { type: "button.setIconAssetId"; buttonId: string; assetId: string }
  | { type: "button.clearIcon"; buttonId: string }
  | { type: "button.setIconDarken"; buttonId: string; iconDarken: number }
  | { type: "button.setLabelVisibility"; buttonId: string; labelVisibility: string }
  | { type: "button.appendCommand"; buttonId: string; command: Record<string, unknown> }
  | { type: "button.insertCommand"; buttonId: string; commandIndex: number; command: Record<string, unknown> }
  | { type: "button.replaceCommand"; buttonId: string; commandIndex: number; command: Record<string, unknown> }
  | { type: "button.moveCommand"; buttonId: string; fromIndex: number; toIndex: number }
  | { type: "button.deleteCommand"; buttonId: string; commandIndex: number }
  | { type: "button.setCommandContactId"; buttonId: string; commandIndex: number; contactId: string }
  | { type: "button.setCommandName"; buttonId: string; commandIndex: number; name: string }
  | { type: "button.toggleCommandCollapsed"; buttonId: string; commandIndex: number }
  | { type: "button.setCommandOscAddress"; buttonId: string; commandIndex: number; address: string }
  | {
      type: "button.setCommandOscArgFirst";
      buttonId: string;
      commandIndex: number;
      argType: string;
      argValue: unknown;
    }
  | { type: "button.setCommandPayloadType"; buttonId: string; commandIndex: number; payloadType: "string" | "hex" }
  | { type: "button.setCommandPayloadValue"; buttonId: string; commandIndex: number; value: string }
  | { type: "contacts.addContact"; contact: Record<string, unknown> }
  | {
      type: "contacts.updateContact";
      contactId: string;
      name: string;
      protocol: string;
      host: string;
      port: number;
    }
  | { type: "contacts.deleteContact"; contactId: string }
  | { type: "contacts.ensureFromLegacyCommands" }
  | { type: "preset.replace"; preset: Record<string, unknown> }
  | { type: "preset.setMode"; mode: "edit" | "use" }
  | { type: "preset.toggleMode" }
  | { type: "preset.setGridCols"; cols: number }
  | { type: "preset.setGridRows"; rows: number }
  | { type: "preset.setButtonSizeW"; width: number }
  | { type: "preset.setButtonSizeH"; height: number }
  | { type: "preset.setOnCommandError"; onError: "stop" | "continue" }
  | { type: "preset.setAlwaysOnTop"; value: boolean }
  | { type: "preset.setClickThroughBackground"; value: boolean }
  | { type: "preset.setGridBgColor"; color: string }
  | { type: "preset.setGridBgOpacityPercent"; opacityPercent: number }
  | { type: "service.setPosition"; col: number; row: number }
  | { type: "service.setShowInGrid"; value: boolean }
  | { type: "service.setRadius"; radius: number };

type AppState = {
  preset: {
    contacts?: Array<{ id: string; protocol?: string; name?: string; target?: { host: string; port: number } }>;
    buttons: Array<{
      id: string;
      style?: Record<string, unknown>;
      commands?: unknown[];
      label?: string;
      position: { col: number; row: number };
    }>;
    ui: {
      mode?: "edit" | "use";
      grid?: { cols?: number; rows?: number };
      buttonSize?: { w?: number; h?: number };
      gridBackground?: { color?: string; opacity?: number };
      service?: { col?: number; row?: number; radius?: number; showInGrid?: boolean };
      clickThroughBackground?: boolean;
      alwaysOnTop?: boolean;
    };
    settings?: { onCommandError?: "stop" | "continue" };
  };
  ui: {
    selectedButtonId: string | null;
    selectedButtonIds: string[];
    selectedTarget: "button" | "service" | null;
    selectedContactId?: string | null;
  };
};

function migrateLegacyContactsInPlace(state: AppState): void {
  const preset = state.preset as {
    contacts?: Array<Record<string, unknown>>;
    buttons?: Array<{ commands?: unknown[] }>;
  };
  if (!Array.isArray(preset.contacts)) preset.contacts = [];
  if (!Array.isArray(preset.buttons)) preset.buttons = [];
  const contactsArr = preset.contacts;

  preset.buttons.forEach((button) => {
    if (!Array.isArray(button.commands)) return;
    (button.commands as Array<Record<string, unknown>>).forEach((cmd) => {
      if (cmd.contactId) return;
      if (!cmd.target || !cmd.protocol) return;
      const target = cmd.target as { host: string; port: number };
      const proto = String(cmd.protocol);
      const existing = contactsArr.find(
        (c) =>
          String(c.protocol) === proto &&
          String((c.target as { host?: string })?.host) === target.host &&
          Number((c.target as { port?: number })?.port) === Number(target.port)
      );
      if (existing) {
        cmd.contactId = String(existing.id);
        return;
      }
      const id = nowId("contact");
      const created: Record<string, unknown> = {
        id,
        name: `${proto.toUpperCase()} ${target.host}:${target.port}`,
        protocol: proto,
        target: { host: target.host, port: Number(target.port) }
      };
      contactsArr.push(created);
      cmd.contactId = id;
    });
  });
}

function applyPresetReplace(state: AppState, preset: Record<string, unknown>): void {
  (state as { preset: unknown }).preset = preset;
  if (!Array.isArray(preset.contacts)) preset.contacts = [];
  if (!Array.isArray(preset.buttons)) preset.buttons = [];
  migrateLegacyContactsInPlace(state);
  const buttons = (state.preset as { buttons: Array<{ id?: string }> }).buttons;
  state.ui.selectedButtonId = buttons[0]?.id ? String(buttons[0].id) : null;
  state.ui.selectedButtonIds = state.ui.selectedButtonId ? [state.ui.selectedButtonId] : [];
  state.ui.selectedTarget = state.ui.selectedButtonId ? "button" : null;
  const cl = state.preset.contacts ?? [];
  state.ui.selectedContactId = cl[0]?.id ? String(cl[0].id) : null;
}

function findButton(state: AppState, id: string) {
  return state.preset.buttons.find((b) => b.id === id) ?? null;
}

function getCommandObject(
  state: AppState,
  buttonId: string,
  commandIndex: number
): Record<string, unknown> | null {
  const btn = findButton(state, buttonId);
  if (!btn || !Array.isArray(btn.commands)) return null;
  const raw = btn.commands[commandIndex];
  if (!raw || typeof raw !== "object") return null;
  return raw as Record<string, unknown>;
}

function ensureStyle(btn: AppState["preset"]["buttons"][number]) {
  if (!btn.style || typeof btn.style !== "object") btn.style = {};
  return btn.style as Record<string, unknown>;
}

function cloneValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

export function deriveCommandHistoryDelta(
  rawState: unknown,
  command: AppCommand
): CommandHistoryDelta | null {
  const state = rawState as AppState;
  if (!state?.preset) return null;

  let presetBefore: Record<string, unknown> | null = null;
  const fallback = (): CommandHistoryDelta => {
    if (!presetBefore) {
      presetBefore = cloneValue(state.preset as Record<string, unknown>);
    }
    return {
      forward: [command],
      backward: [{ type: "preset.replace", preset: presetBefore }]
    };
  };

  switch (command.type) {
    case "preset.replace":
      return null;
    case "contacts.ensureFromLegacyCommands":
      return fallback();
    case "layout.addButton": {
      const id = String((command.button as { id?: string }).id ?? "");
      if (!id) return fallback();
      return { forward: [command], backward: [{ type: "layout.deleteButton", buttonId: id }] };
    }
    case "layout.insertButton": {
      const id = String((command.button as { id?: string }).id ?? "");
      if (!id) return fallback();
      return { forward: [command], backward: [{ type: "layout.deleteButton", buttonId: id }] };
    }
    case "layout.deleteButton": {
      const index = state.preset.buttons.findIndex((b) => b.id === command.buttonId);
      if (index < 0) return null;
      const button = cloneValue(state.preset.buttons[index]) as Record<string, unknown>;
      return {
        forward: [command],
        backward: [{ type: "layout.insertButton", index, button }]
      };
    }
    case "layout.moveServiceToCell": {
      const svc = state.preset.ui?.service;
      const col = Number(svc?.col);
      const row = Number(svc?.row);
      if (!Number.isFinite(col) || !Number.isFinite(row)) return fallback();
      return {
        forward: [command],
        backward: [{ type: "layout.moveServiceToCell", col, row }]
      };
    }
    case "layout.swapButtonWithService":
    case "layout.swapButtonPositions":
      return { forward: [command], backward: [command] };
    case "layout.moveButtonToCell": {
      const btn = findButton(state, command.buttonId);
      if (!btn) return null;
      return {
        forward: [command],
        backward: [{ type: "layout.moveButtonToCell", buttonId: btn.id, col: btn.position.col, row: btn.position.row }]
      };
    }
    case "button.setLabel": {
      const btn = findButton(state, command.buttonId);
      if (!btn) return null;
      return {
        forward: [command],
        backward: [{ type: "button.setLabel", buttonId: btn.id, label: String(btn.label ?? "") }]
      };
    }
    case "button.setBgColor":
      return {
        forward: [command],
        backward: command.buttonIds
          .map((id) => {
            const btn = findButton(state, id);
            if (!btn) return null;
            const oldColor = String((btn.style as Record<string, unknown> | undefined)?.bgColor ?? "#252525");
            return { type: "button.setBgColor", buttonIds: [id], color: oldColor } as AppCommand;
          })
          .filter(Boolean) as AppCommand[]
      };
    case "button.setTextColor":
      return {
        forward: [command],
        backward: command.buttonIds
          .map((id) => {
            const btn = findButton(state, id);
            if (!btn) return null;
            const oldColor = String((btn.style as Record<string, unknown> | undefined)?.textColor ?? "#ffffff");
            return { type: "button.setTextColor", buttonIds: [id], color: oldColor } as AppCommand;
          })
          .filter(Boolean) as AppCommand[]
      };
    case "button.setFontSize":
      return {
        forward: [command],
        backward: command.buttonIds
          .map((id) => {
            const btn = findButton(state, id);
            if (!btn) return null;
            const old = Number((btn.style as Record<string, unknown> | undefined)?.fontSize ?? 13);
            return { type: "button.setFontSize", buttonIds: [id], fontSize: old } as AppCommand;
          })
          .filter(Boolean) as AppCommand[]
      };
    case "button.setRadius":
      return {
        forward: [command],
        backward: command.buttonIds
          .map((id) => {
            const btn = findButton(state, id);
            if (!btn) return null;
            const old = Number((btn.style as Record<string, unknown> | undefined)?.radius ?? 8);
            return { type: "button.setRadius", buttonIds: [id], radius: old } as AppCommand;
          })
          .filter(Boolean) as AppCommand[]
      };
    case "button.toggleWrapLabel":
      return { forward: [command], backward: [command] };
    case "button.setIconAssetId":
    case "button.clearIcon":
      return fallback();
    case "button.setIconDarken": {
      const btn = findButton(state, command.buttonId);
      if (!btn) return null;
      const old = Number((btn.style as Record<string, unknown> | undefined)?.iconDarken ?? 35);
      return {
        forward: [command],
        backward: [{ type: "button.setIconDarken", buttonId: btn.id, iconDarken: old }]
      };
    }
    case "button.setLabelVisibility": {
      const btn = findButton(state, command.buttonId);
      if (!btn) return null;
      const old = String((btn.style as Record<string, unknown> | undefined)?.labelVisibility ?? "always");
      return {
        forward: [command],
        backward: [{ type: "button.setLabelVisibility", buttonId: btn.id, labelVisibility: old }]
      };
    }
    case "button.appendCommand": {
      const btn = findButton(state, command.buttonId);
      if (!btn || !Array.isArray(btn.commands)) return null;
      return {
        forward: [command],
        backward: [{ type: "button.deleteCommand", buttonId: btn.id, commandIndex: btn.commands.length }]
      };
    }
    case "button.insertCommand": {
      return {
        forward: [command],
        backward: [{ type: "button.deleteCommand", buttonId: command.buttonId, commandIndex: command.commandIndex }]
      };
    }
    case "button.replaceCommand": {
      const prev = getCommandObject(state, command.buttonId, command.commandIndex);
      if (!prev) return null;
      return {
        forward: [command],
        backward: [
          {
            type: "button.replaceCommand",
            buttonId: command.buttonId,
            commandIndex: command.commandIndex,
            command: cloneValue(prev)
          }
        ]
      };
    }
    case "button.moveCommand": {
      const btn = findButton(state, command.buttonId);
      if (!btn || !Array.isArray(btn.commands)) return null;
      const total = btn.commands.length;
      const source = Math.max(0, Math.min(total - 1, Number(command.fromIndex)));
      const targetSlot = Math.max(0, Math.min(total, Number(command.toIndex)));
      const movedIndex = source < targetSlot ? targetSlot - 1 : targetSlot;
      const inverseTo = source < targetSlot ? source : source + 1;
      return {
        forward: [command],
        backward: [
          {
            type: "button.moveCommand",
            buttonId: command.buttonId,
            fromIndex: movedIndex,
            toIndex: inverseTo
          }
        ]
      };
    }
    case "button.deleteCommand": {
      const btn = findButton(state, command.buttonId);
      if (!btn || !Array.isArray(btn.commands)) return null;
      const prev = btn.commands[command.commandIndex];
      if (prev === undefined) return null;
      return {
        forward: [command],
        backward: [
          {
            type: "button.insertCommand",
            buttonId: command.buttonId,
            commandIndex: command.commandIndex,
            command: cloneValue(prev as Record<string, unknown>)
          }
        ]
      };
    }
    case "button.setCommandContactId":
    case "button.setCommandName":
    case "button.toggleCommandCollapsed":
    case "button.setCommandOscAddress":
    case "button.setCommandOscArgFirst":
    case "button.setCommandPayloadType":
    case "button.setCommandPayloadValue": {
      const prev = getCommandObject(state, command.buttonId, command.commandIndex);
      if (!prev) return null;
      return {
        forward: [command],
        backward: [
          {
            type: "button.replaceCommand",
            buttonId: command.buttonId,
            commandIndex: command.commandIndex,
            command: cloneValue(prev)
          }
        ]
      };
    }
    case "contacts.addContact":
      return {
        forward: [command],
        backward: [{ type: "contacts.deleteContact", contactId: String((command.contact as { id?: string }).id ?? "") }]
      };
    case "contacts.updateContact": {
      const prev = Array.isArray(state.preset.contacts)
        ? state.preset.contacts.find((c) => c.id === command.contactId)
        : null;
      if (!prev) return null;
      return {
        forward: [command],
        backward: [
          {
            type: "contacts.updateContact",
            contactId: command.contactId,
            name: String(prev.name ?? ""),
            protocol: String(prev.protocol ?? "udp"),
            host: String(prev.target?.host ?? "127.0.0.1"),
            port: Number(prev.target?.port ?? 7000)
          }
        ]
      };
    }
    case "contacts.deleteContact": {
      const contacts = Array.isArray(state.preset.contacts) ? state.preset.contacts : [];
      const removed = contacts.find((c) => c.id === command.contactId);
      if (!removed) return null;
      const backward: AppCommand[] = [
        { type: "contacts.addContact", contact: cloneValue(removed as Record<string, unknown>) }
      ];
      for (const btn of state.preset.buttons) {
        if (!Array.isArray(btn.commands)) continue;
        btn.commands.forEach((rawCmd, idx) => {
          const cmd = rawCmd as { contactId?: string };
          if (cmd?.contactId === command.contactId) {
            backward.push({
              type: "button.replaceCommand",
              buttonId: btn.id,
              commandIndex: idx,
              command: cloneValue(rawCmd as Record<string, unknown>)
            });
          }
        });
      }
      return { forward: [command], backward };
    }
    case "preset.setMode": {
      const old = state.preset.ui?.mode === "use" ? "use" : "edit";
      return { forward: [command], backward: [{ type: "preset.setMode", mode: old }] };
    }
    case "preset.toggleMode":
      return { forward: [command], backward: [command] };
    case "preset.setGridCols": {
      const old = Number(state.preset.ui?.grid?.cols ?? 4);
      return { forward: [command], backward: [{ type: "preset.setGridCols", cols: old }] };
    }
    case "preset.setGridRows": {
      const old = Number(state.preset.ui?.grid?.rows ?? 3);
      return { forward: [command], backward: [{ type: "preset.setGridRows", rows: old }] };
    }
    case "preset.setButtonSizeW": {
      const old = Number(state.preset.ui?.buttonSize?.w ?? 72);
      return { forward: [command], backward: [{ type: "preset.setButtonSizeW", width: old }] };
    }
    case "preset.setButtonSizeH": {
      const old = Number(state.preset.ui?.buttonSize?.h ?? 72);
      return { forward: [command], backward: [{ type: "preset.setButtonSizeH", height: old }] };
    }
    case "preset.setOnCommandError": {
      const old = state.preset.settings?.onCommandError === "continue" ? "continue" : "stop";
      return { forward: [command], backward: [{ type: "preset.setOnCommandError", onError: old }] };
    }
    case "preset.setAlwaysOnTop": {
      const old = Boolean(state.preset.ui?.alwaysOnTop);
      return { forward: [command], backward: [{ type: "preset.setAlwaysOnTop", value: old }] };
    }
    case "preset.setClickThroughBackground": {
      const old = Boolean(state.preset.ui?.clickThroughBackground);
      return {
        forward: [command],
        backward: [{ type: "preset.setClickThroughBackground", value: old }]
      };
    }
    case "preset.setGridBgColor": {
      const old = String(state.preset.ui?.gridBackground?.color ?? "#000000");
      return { forward: [command], backward: [{ type: "preset.setGridBgColor", color: old }] };
    }
    case "preset.setGridBgOpacityPercent": {
      const old = Math.round(Number(state.preset.ui?.gridBackground?.opacity ?? 0.25) * 100);
      return {
        forward: [command],
        backward: [{ type: "preset.setGridBgOpacityPercent", opacityPercent: old }]
      };
    }
    case "service.setShowInGrid": {
      const old = Boolean(state.preset.ui?.service?.showInGrid ?? true);
      return { forward: [command], backward: [{ type: "service.setShowInGrid", value: old }] };
    }
    case "service.setPosition": {
      const oldCol = Number(state.preset.ui?.service?.col ?? 0);
      const oldRow = Number(state.preset.ui?.service?.row ?? 0);
      return {
        forward: [command],
        backward: [{ type: "service.setPosition", col: oldCol, row: oldRow }]
      };
    }
    case "service.setRadius": {
      const old = Number(state.preset.ui?.service?.radius ?? 8);
      return { forward: [command], backward: [{ type: "service.setRadius", radius: old }] };
    }
    default:
      return fallback();
  }
}

function ensurePresetUi(state: AppState): NonNullable<AppState["preset"]["ui"]> {
  if (!state.preset.ui || typeof state.preset.ui !== "object") {
    state.preset.ui = {};
  }
  return state.preset.ui;
}

function ensureServiceUi(state: AppState): { col?: number; row?: number; radius?: number; showInGrid?: boolean } {
  const ui = ensurePresetUi(state);
  if (!ui.service || typeof ui.service !== "object") {
    ui.service = { col: 0, row: 0, radius: 8, showInGrid: true };
  }
  return ui.service;
}

export function applyAppCommand(rawState: unknown, command: AppCommand): void {
  const state = rawState as AppState;

  if (command.type === "preset.replace") {
    applyPresetReplace(state, command.preset);
    return;
  }

  if (!state?.preset) return;

  if (command.type === "contacts.ensureFromLegacyCommands") {
    migrateLegacyContactsInPlace(state);
    return;
  }

  const contactsOnlyCommands: AppCommand["type"][] = [
    "contacts.addContact",
    "contacts.updateContact",
    "contacts.deleteContact"
  ];
  if (!contactsOnlyCommands.includes(command.type) && !Array.isArray(state.preset.buttons)) {
    return;
  }

  switch (command.type) {
    case "layout.addButton": {
      state.preset.buttons.push(command.button as AppState["preset"]["buttons"][number]);
      const id = String((command.button as { id?: string }).id ?? "");
      state.ui.selectedTarget = "button";
      state.ui.selectedButtonId = id;
      state.ui.selectedButtonIds = id ? [id] : [];
      break;
    }
    case "layout.insertButton": {
      const index = Math.max(0, Math.min(state.preset.buttons.length, Number(command.index) || 0));
      state.preset.buttons.splice(index, 0, command.button as AppState["preset"]["buttons"][number]);
      const id = String((command.button as { id?: string }).id ?? "");
      state.ui.selectedTarget = "button";
      state.ui.selectedButtonId = id;
      state.ui.selectedButtonIds = id ? [id] : [];
      break;
    }
    case "layout.deleteButton": {
      state.preset.buttons = state.preset.buttons.filter((b) => b.id !== command.buttonId);
      state.ui.selectedButtonId = state.preset.buttons[0]?.id ?? null;
      state.ui.selectedButtonIds = state.ui.selectedButtonId ? [state.ui.selectedButtonId] : [];
      state.ui.selectedTarget = state.ui.selectedButtonId ? "button" : null;
      break;
    }
    case "layout.moveServiceToCell": {
      if (!state.preset.ui.service || typeof state.preset.ui.service !== "object") {
        state.preset.ui.service = { col: 0, row: 0 };
      }
      const svc = state.preset.ui.service as { col: number; row: number };
      const oldCol = Number(svc.col) || 0;
      const oldRow = Number(svc.row) || 0;
      const { col: nc, row: nr } = command;
      if (oldCol === nc && oldRow === nr) return;
      const occupant =
        state.preset.buttons.find((b) => b.position.col === nc && b.position.row === nr) ?? null;
      svc.col = nc;
      svc.row = nr;
      if (occupant) {
        occupant.position.col = oldCol;
        occupant.position.row = oldRow;
      }
      state.ui.selectedTarget = "service";
      state.ui.selectedButtonId = null;
      state.ui.selectedButtonIds = [];
      break;
    }
    case "layout.swapButtonWithService": {
      const btn = findButton(state, command.buttonId);
      if (!btn) return;
      if (!state.preset.ui.service || typeof state.preset.ui.service !== "object") {
        state.preset.ui.service = { col: 0, row: 0 };
      }
      const svc = state.preset.ui.service as { col: number; row: number };
      const sc = Number(svc.col) || 0;
      const sr = Number(svc.row) || 0;
      const bc = btn.position.col;
      const br = btn.position.row;
      btn.position.col = sc;
      btn.position.row = sr;
      svc.col = bc;
      svc.row = br;
      state.ui.selectedTarget = "button";
      state.ui.selectedButtonId = btn.id;
      state.ui.selectedButtonIds = [btn.id];
      break;
    }
    case "layout.swapButtonPositions": {
      const dragged = findButton(state, command.draggedId);
      const occupant = findButton(state, command.occupantId);
      if (!dragged || !occupant) return;
      const dc = dragged.position.col;
      const dr = dragged.position.row;
      dragged.position.col = occupant.position.col;
      dragged.position.row = occupant.position.row;
      occupant.position.col = dc;
      occupant.position.row = dr;
      state.ui.selectedTarget = "button";
      state.ui.selectedButtonId = dragged.id;
      state.ui.selectedButtonIds = [dragged.id];
      break;
    }
    case "layout.moveButtonToCell": {
      const btn = findButton(state, command.buttonId);
      if (!btn) return;
      btn.position.col = command.col;
      btn.position.row = command.row;
      state.ui.selectedTarget = "button";
      state.ui.selectedButtonId = btn.id;
      state.ui.selectedButtonIds = [btn.id];
      break;
    }
    case "button.setLabel": {
      const btn = findButton(state, command.buttonId);
      if (!btn) return;
      btn.label = command.label;
      break;
    }
    case "button.setBgColor": {
      for (const id of command.buttonIds) {
        const btn = findButton(state, id);
        if (!btn) continue;
        ensureStyle(btn).bgColor = command.color;
      }
      break;
    }
    case "button.setTextColor": {
      for (const id of command.buttonIds) {
        const btn = findButton(state, id);
        if (!btn) continue;
        ensureStyle(btn).textColor = command.color;
      }
      break;
    }
    case "button.setFontSize": {
      for (const id of command.buttonIds) {
        const btn = findButton(state, id);
        if (!btn) continue;
        ensureStyle(btn).fontSize = command.fontSize;
      }
      break;
    }
    case "button.setRadius": {
      for (const id of command.buttonIds) {
        const btn = findButton(state, id);
        if (!btn) continue;
        ensureStyle(btn).radius = command.radius;
      }
      break;
    }
    case "button.toggleWrapLabel": {
      const btn = findButton(state, command.buttonId);
      if (!btn) return;
      const style = ensureStyle(btn);
      style.wrapLabel = !Boolean(style.wrapLabel);
      break;
    }
    case "button.setIconAssetId": {
      const btn = findButton(state, command.buttonId);
      if (!btn) return;
      const style = ensureStyle(btn);
      style.iconAssetId = command.assetId;
      delete style.iconPath;
      break;
    }
    case "button.clearIcon": {
      const btn = findButton(state, command.buttonId);
      if (!btn) return;
      const style = ensureStyle(btn);
      delete style.iconAssetId;
      delete style.iconPath;
      break;
    }
    case "button.setIconDarken": {
      const btn = findButton(state, command.buttonId);
      if (!btn) return;
      ensureStyle(btn).iconDarken = command.iconDarken;
      break;
    }
    case "button.setLabelVisibility": {
      const btn = findButton(state, command.buttonId);
      if (!btn) return;
      ensureStyle(btn).labelVisibility = command.labelVisibility;
      break;
    }
    case "button.appendCommand": {
      const btn = findButton(state, command.buttonId);
      if (!btn) return;
      if (!Array.isArray(btn.commands)) btn.commands = [];
      btn.commands.push(command.command);
      break;
    }
    case "button.insertCommand": {
      const btn = findButton(state, command.buttonId);
      if (!btn) return;
      if (!Array.isArray(btn.commands)) btn.commands = [];
      const i = Math.max(0, Math.min(btn.commands.length, Number(command.commandIndex) || 0));
      btn.commands.splice(i, 0, command.command);
      break;
    }
    case "button.replaceCommand": {
      const btn = findButton(state, command.buttonId);
      if (!btn || !Array.isArray(btn.commands)) return;
      const i = Number(command.commandIndex);
      if (!Number.isInteger(i) || i < 0 || i >= btn.commands.length) return;
      btn.commands[i] = command.command;
      break;
    }
    case "button.moveCommand": {
      const btn = findButton(state, command.buttonId);
      if (!btn || !Array.isArray(btn.commands)) return;
      const total = btn.commands.length;
      const source = Math.max(0, Math.min(total - 1, Number(command.fromIndex)));
      const targetSlot = Math.max(0, Math.min(total, Number(command.toIndex)));
      if (!Number.isInteger(source) || !Number.isInteger(targetSlot)) return;
      if (targetSlot === source || targetSlot === source + 1) return;
      const [moved] = btn.commands.splice(source, 1);
      if (!moved) return;
      const normalizedTarget = source < targetSlot ? targetSlot - 1 : targetSlot;
      btn.commands.splice(normalizedTarget, 0, moved);
      break;
    }
    case "button.deleteCommand": {
      const btn = findButton(state, command.buttonId);
      if (!btn || !Array.isArray(btn.commands)) return;
      const i = command.commandIndex;
      if (i < 0 || i >= btn.commands.length) return;
      btn.commands.splice(i, 1);
      break;
    }
    case "button.setCommandContactId": {
      const cmd = getCommandObject(state, command.buttonId, command.commandIndex);
      if (!cmd) return;
      cmd.contactId = command.contactId;
      const contacts = Array.isArray(state.preset.contacts) ? state.preset.contacts : [];
      const contact = contacts.find((c) => c.id === command.contactId);
      if (contact?.protocol === "osc-udp") {
        cmd.osc = cmd.osc ?? {
          address: "/ping",
          args: [{ type: "string", value: "ping" }]
        };
        delete cmd.payload;
      } else {
        cmd.payload = cmd.payload ?? { type: "string", value: "PING" };
        delete cmd.osc;
      }
      break;
    }
    case "button.setCommandName": {
      const cmd = getCommandObject(state, command.buttonId, command.commandIndex);
      if (!cmd) return;
      cmd.name = command.name;
      break;
    }
    case "button.toggleCommandCollapsed": {
      const cmd = getCommandObject(state, command.buttonId, command.commandIndex);
      if (!cmd) return;
      cmd.isCollapsed = !Boolean(cmd.isCollapsed);
      break;
    }
    case "button.setCommandOscAddress": {
      const cmd = getCommandObject(state, command.buttonId, command.commandIndex);
      if (!cmd) return;
      const osc =
        typeof cmd.osc === "object" && cmd.osc !== null
          ? (cmd.osc as Record<string, unknown>)
          : { address: "/ping", args: [] as unknown[] };
      osc.address = command.address;
      if (!Array.isArray(osc.args)) osc.args = [];
      cmd.osc = osc;
      break;
    }
    case "button.setCommandOscArgFirst": {
      const cmd = getCommandObject(state, command.buttonId, command.commandIndex);
      if (!cmd) return;
      const osc =
        typeof cmd.osc === "object" && cmd.osc !== null
          ? (cmd.osc as Record<string, unknown>)
          : { address: "/ping", args: [] as unknown[] };
      osc.args = [{ type: command.argType, value: command.argValue }];
      cmd.osc = osc;
      break;
    }
    case "button.setCommandPayloadType": {
      const cmd = getCommandObject(state, command.buttonId, command.commandIndex);
      if (!cmd) return;
      const payload =
        typeof cmd.payload === "object" && cmd.payload !== null
          ? (cmd.payload as Record<string, unknown>)
          : { type: "string", value: "" };
      payload.type = command.payloadType === "hex" ? "hex" : "string";
      cmd.payload = payload;
      break;
    }
    case "button.setCommandPayloadValue": {
      const cmd = getCommandObject(state, command.buttonId, command.commandIndex);
      if (!cmd) return;
      const payload =
        typeof cmd.payload === "object" && cmd.payload !== null
          ? (cmd.payload as Record<string, unknown>)
          : { type: "string", value: "" };
      payload.value = command.value;
      cmd.payload = payload;
      break;
    }
    case "contacts.addContact": {
      if (!Array.isArray(state.preset.contacts)) state.preset.contacts = [];
      state.preset.contacts.push(command.contact as (typeof state.preset.contacts)[number]);
      state.ui.selectedContactId = String((command.contact as { id: string }).id ?? "");
      break;
    }
    case "contacts.updateContact": {
      if (!Array.isArray(state.preset.contacts)) return;
      const row = state.preset.contacts.find((c) => c.id === command.contactId);
      if (!row) return;
      const contact = row as Record<string, unknown>;
      contact.name = command.name;
      const p = command.protocol;
      contact.protocol = p === "tcp" ? "tcp" : p === "osc-udp" ? "osc-udp" : "udp";
      contact.target = { host: command.host, port: command.port };
      break;
    }
    case "contacts.deleteContact": {
      if (!Array.isArray(state.preset.contacts)) state.preset.contacts = [];
      const id = command.contactId;
      state.preset.contacts = state.preset.contacts.filter((c) => c.id !== id);
      const buttonList = Array.isArray(state.preset.buttons) ? state.preset.buttons : [];
      for (const btn of buttonList) {
        if (!Array.isArray(btn.commands)) continue;
        for (const cmd of btn.commands as Array<{ contactId?: string }>) {
          if (cmd.contactId === id) cmd.contactId = "";
        }
      }
      if (state.ui.selectedContactId === id) {
        state.ui.selectedContactId = null;
      }
      break;
    }
    case "preset.setMode": {
      const ui = ensurePresetUi(state);
      ui.mode = command.mode;
      break;
    }
    case "preset.toggleMode": {
      const ui = ensurePresetUi(state);
      ui.mode = ui.mode === "use" ? "edit" : "use";
      break;
    }
    case "preset.setGridCols": {
      const ui = ensurePresetUi(state);
      if (!ui.grid || typeof ui.grid !== "object") ui.grid = { cols: 4, rows: 3 };
      ui.grid.cols = Math.max(1, Math.min(20, Number(command.cols) || 1));
      break;
    }
    case "preset.setGridRows": {
      const ui = ensurePresetUi(state);
      if (!ui.grid || typeof ui.grid !== "object") ui.grid = { cols: 4, rows: 3 };
      ui.grid.rows = Math.max(1, Math.min(20, Number(command.rows) || 1));
      break;
    }
    case "preset.setButtonSizeW": {
      const ui = ensurePresetUi(state);
      if (!ui.buttonSize || typeof ui.buttonSize !== "object") ui.buttonSize = { w: 72, h: 72 };
      ui.buttonSize.w = Math.max(16, Math.min(160, Number(command.width) || 16));
      break;
    }
    case "preset.setButtonSizeH": {
      const ui = ensurePresetUi(state);
      if (!ui.buttonSize || typeof ui.buttonSize !== "object") ui.buttonSize = { w: 72, h: 72 };
      ui.buttonSize.h = Math.max(16, Math.min(160, Number(command.height) || 16));
      break;
    }
    case "preset.setOnCommandError": {
      if (!state.preset.settings || typeof state.preset.settings !== "object") {
        state.preset.settings = {};
      }
      state.preset.settings.onCommandError = command.onError === "continue" ? "continue" : "stop";
      break;
    }
    case "preset.setAlwaysOnTop": {
      const ui = ensurePresetUi(state);
      ui.alwaysOnTop = Boolean(command.value);
      break;
    }
    case "preset.setClickThroughBackground": {
      const ui = ensurePresetUi(state);
      ui.clickThroughBackground = Boolean(command.value);
      break;
    }
    case "preset.setGridBgColor": {
      const ui = ensurePresetUi(state);
      if (!ui.gridBackground || typeof ui.gridBackground !== "object") {
        ui.gridBackground = { color: "#000000", opacity: 0.25 };
      }
      const rawColor = String(command.color || "#000000").trim();
      ui.gridBackground.color = /^#[0-9a-f]{6}$/i.test(rawColor) ? rawColor : "#000000";
      break;
    }
    case "preset.setGridBgOpacityPercent": {
      const ui = ensurePresetUi(state);
      if (!ui.gridBackground || typeof ui.gridBackground !== "object") {
        ui.gridBackground = { color: "#000000", opacity: 0.25 };
      }
      const percent = Math.max(0, Math.min(100, Number(command.opacityPercent) || 0));
      ui.gridBackground.opacity = percent / 100;
      break;
    }
    case "service.setShowInGrid": {
      const service = ensureServiceUi(state);
      service.showInGrid = Boolean(command.value);
      if (!service.showInGrid && state.ui.selectedTarget === "service") {
        state.ui.selectedTarget = null;
      }
      break;
    }
    case "service.setPosition": {
      const service = ensureServiceUi(state);
      service.col = command.col;
      service.row = command.row;
      break;
    }
    case "service.setRadius": {
      const service = ensureServiceUi(state);
      service.radius = command.radius;
      break;
    }
  }
}
