import type { AppCommand, AppDispatchOptions } from "./appCommands";
import { trackOnboardingStep } from "./onboarding";

type EditorState = {
  ui: {
    selectedTarget: "button" | "service" | null;
  };
};

type EditorDeps = {
  state: EditorState;
  commandsEl: HTMLElement;
  canEdit: () => boolean;
  selectedButton: () => { id?: string; commands: any[] } | null;
  contacts: () => Array<{
    id: string;
    name: string;
    protocol: string;
    target: { host: string; port: number };
  }>;
  getContactById: (id: string) => any;
  validateCommand: (command: any) => string | null;
  resolveCommandForSend: (command: any) => any;
  dispatch: (command: AppCommand, options?: AppDispatchOptions) => void;
  renderEditorSelection: () => void;
  showToast: (message: string, type?: string) => void;
  runtimeTestSend: (payload: any) => Promise<{ ok: boolean; message?: string }>;
};

export type EditorController = {
  renderEditor: () => void;
};

export function createEditorController({
  state,
  commandsEl,
  canEdit,
  selectedButton,
  contacts,
  getContactById,
  validateCommand,
  resolveCommandForSend,
  dispatch,
  renderEditorSelection,
  showToast,
  runtimeTestSend
}: EditorDeps): EditorController {
  const SVG_NS = "http://www.w3.org/2000/svg";
  let draggingCommandIndex: number | null = null;
  let selectedCommandDragIndex: number | null = null;

  const icon = (paths: string[]): SVGSVGElement => {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 16 16");
    svg.setAttribute("aria-hidden", "true");
    for (const d of paths) {
      const p = document.createElementNS(SVG_NS, "path");
      p.setAttribute("d", d);
      svg.appendChild(p);
    }
    return svg;
  };

  const appendOption = (select: HTMLSelectElement, value: string, label: string): void => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    select.appendChild(option);
  };

  const moveSelectedButtonCommand = (fromIndex: number, toIndex: number): void => {
    const btn = selectedButton();
    if (!btn || typeof btn.id !== "string" || !Array.isArray(btn.commands)) return;
    const total = btn.commands.length;
    if (total < 2) return;
    const source = Math.max(0, Math.min(total - 1, Number(fromIndex)));
    const targetSlot = Math.max(0, Math.min(total, Number(toIndex)));
    if (!Number.isInteger(source) || !Number.isInteger(targetSlot)) return;
    if (targetSlot === source || targetSlot === source + 1) return;
    const normalizedTarget = source < targetSlot ? targetSlot - 1 : targetSlot;
    selectedCommandDragIndex = normalizedTarget;
    dispatch({
      type: "button.moveCommand",
      buttonId: btn.id,
      fromIndex: source,
      toIndex: targetSlot
    });
  };

  const commandEditor = (command: any, commandIndex: number): HTMLElement => {
    const wrap = document.createElement("div");
    wrap.className = "command";
    const editorLocked = !canEdit();
    if (selectedCommandDragIndex === commandIndex) {
      wrap.classList.add("drag-selected");
    }
    wrap.draggable = !editorLocked;
    if (!editorLocked) {
      wrap.addEventListener("pointerdown", (event) => {
        const target = event.target instanceof Element ? event.target : null;
        if (target?.closest("input, select, textarea, button")) return;
        if (selectedCommandDragIndex === commandIndex) return;
        selectedCommandDragIndex = commandIndex;
        renderEditor();
      });
      wrap.addEventListener("dragstart", (event) => {
        draggingCommandIndex = commandIndex;
        wrap.classList.add("dragging");
        if (event.dataTransfer) {
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", String(commandIndex));
        }
      });
      wrap.addEventListener("dragend", () => {
        draggingCommandIndex = null;
        wrap.classList.remove("dragging");
        commandsEl.querySelectorAll(".command.over").forEach((el) => el.classList.remove("over"));
      });
      wrap.addEventListener("dragover", (event) => {
        if (draggingCommandIndex === null || draggingCommandIndex === commandIndex) return;
        event.preventDefault();
        wrap.classList.add("over");
      });
      wrap.addEventListener("dragleave", () => {
        wrap.classList.remove("over");
      });
      wrap.addEventListener("drop", (event) => {
        if (draggingCommandIndex === null) return;
        event.preventDefault();
        event.stopPropagation();
        wrap.classList.remove("over");
        const fromIndex = draggingCommandIndex;
        draggingCommandIndex = null;
        moveSelectedButtonCommand(fromIndex, commandIndex);
      });
    }

    command.name = typeof command.name === "string" ? command.name : "";
    command.enabled = command.enabled !== false;
    command.isCollapsed = Boolean(command.isCollapsed);
    const isDelay = command.kind === "delay";
    if (isDelay) {
      command.delayMs = Math.max(0, Math.min(120000, Math.trunc(Number(command.delayMs) || 0)));
    }
    let contactSelect: HTMLSelectElement | null = null;
    let selectedContact: ReturnType<typeof getContactById> = null;
    if (!isDelay) {
      const selectEl = document.createElement("select");
      contactSelect = selectEl;
      selectEl.disabled = editorLocked;
      appendOption(selectEl, "", "Select connection");
      contacts().forEach((contact) => {
        const option = document.createElement("option");
        option.value = contact.id;
        option.textContent = `${contact.name} (${contact.protocol} ${contact.target.host}:${contact.target.port})`;
        selectEl.appendChild(option);
      });
      selectEl.value = command.contactId ?? "";
      selectEl.addEventListener("change", () => {
        const btn = selectedButton();
        if (!btn?.id) return;
        dispatch({
          type: "button.setCommandContactId",
          buttonId: btn.id,
          commandIndex,
          contactId: selectEl.value
        });
      });
      selectedContact = getContactById(command.contactId);
    }
    const commandNameInput = document.createElement("input");
    commandNameInput.placeholder = "Command name";
    commandNameInput.value = command.name;
    commandNameInput.disabled = editorLocked;
    commandNameInput.addEventListener("input", () => {
      const btn = selectedButton();
      if (!btn?.id) return;
      dispatch(
        {
          type: "button.setCommandName",
          buttonId: btn.id,
          commandIndex,
          name: commandNameInput.value
        },
        { render: false, historyGroup: `cmd-name-${btn.id}-${commandIndex}` }
      );
    });

    const collapseBtn = document.createElement("button");
    collapseBtn.className = "icon-action";
    collapseBtn.disabled = editorLocked;
    collapseBtn.setAttribute(
      "aria-label",
      command.isCollapsed ? "Expand command" : "Collapse command"
    );
    collapseBtn.title = command.isCollapsed ? "Expand command" : "Collapse command";
    collapseBtn.appendChild(
      command.isCollapsed
        ? icon(["M3.5 6.5L8 10.5l4.5-4"])
        : icon(["M3.5 9.5L8 5.5l4.5 4"])
    );
    collapseBtn.addEventListener("click", () => {
      if (editorLocked) return;
      const btn = selectedButton();
      if (!btn?.id) return;
      dispatch({ type: "button.toggleCommandCollapsed", buttonId: btn.id, commandIndex });
    });
    const enabledBtn = document.createElement("button");
    enabledBtn.className = "icon-action command-enabled-toggle";
    if (command.enabled) {
      enabledBtn.classList.add("is-enabled");
    } else {
      enabledBtn.classList.add("is-disabled");
    }
    enabledBtn.disabled = editorLocked;
    enabledBtn.setAttribute("aria-label", command.enabled ? "Deactivate command" : "Activate command");
    enabledBtn.title = command.enabled ? "Deactivate command" : "Activate command";
    enabledBtn.appendChild(
      command.enabled
        ? icon(["M8 3.2v5", "M5.2 5.4a4 4 0 1 0 5.6 0"])
        : icon(["M8 3.2v5", "M5.2 5.4a4 4 0 1 0 5.6 0", "M3.2 12.8l9.6-9.6"])
    );
    enabledBtn.addEventListener("click", () => {
      if (editorLocked) return;
      const btn = selectedButton();
      if (!btn?.id) return;
      dispatch({
        type: "button.replaceCommand",
        buttonId: btn.id,
        commandIndex,
        command: { ...command, enabled: !command.enabled }
      });
    });

    const testBtn = document.createElement("button");
    testBtn.className = "icon-action";
    testBtn.title = "Test send";
    testBtn.setAttribute("aria-label", "Test send");
    testBtn.appendChild(icon(["M3 8h8", "M8.5 4.5L12 8l-3.5 3.5"]));
    testBtn.disabled = isDelay || !selectedContact;
    testBtn.addEventListener("click", async () => {
      if (isDelay) return;
      const validationError = validateCommand(command);
      if (validationError) {
        showToast(validationError);
        return;
      }
      const resolved = resolveCommandForSend(command);
      if (!resolved) {
        showToast("Select a valid connection");
        return;
      }
      const result = await runtimeTestSend(resolved);
      if (!result.ok) {
        showToast(result.message ?? "Send failed");
        return;
      }
      trackOnboardingStep("test-send");
      showToast("Test send OK", "info");
    });

    const removeBtn = document.createElement("button");
    removeBtn.className = "icon-action";
    removeBtn.title = "Delete command";
    removeBtn.setAttribute("aria-label", "Delete command");
    removeBtn.appendChild(
      icon([
        "M3.5 5h9",
        "M6 5V12.5",
        "M10 5V12.5",
        "M5.5 5V3.5h5V5",
        "M4.5 5V13a1 1 0 0 0 1 1h5a1 1 0 0 0 1-1V5"
      ])
    );
    removeBtn.disabled = editorLocked;
    removeBtn.addEventListener("click", () => {
      if (editorLocked) return;
      const shouldDelete = window.confirm("Delete this command?");
      if (!shouldDelete) return;
      const btn = selectedButton();
      if (!btn?.id) return;
      dispatch({ type: "button.deleteCommand", buttonId: btn.id, commandIndex });
    });

    const headerRow = document.createElement("div");
    headerRow.className = "command-header-row";
    if (command.isCollapsed) {
      headerRow.classList.add("is-collapsed");
      const commandNameText = document.createElement("div");
      commandNameText.className = "command-name-text";
      if (!command.enabled) {
        commandNameText.classList.add("inactive");
      }
      commandNameText.textContent = command.name.trim() || `Command ${commandIndex + 1}`;
      headerRow.appendChild(commandNameText);
      headerRow.appendChild(enabledBtn);
      headerRow.appendChild(collapseBtn);
      wrap.appendChild(headerRow);
      return wrap;
    }

    headerRow.appendChild(commandNameInput);
    headerRow.appendChild(removeBtn);
    if (!isDelay) {
      headerRow.appendChild(testBtn);
    }
    headerRow.appendChild(collapseBtn);
    wrap.appendChild(headerRow);
    if (contactSelect) {
      wrap.appendChild(contactSelect);
    }

    if (isDelay) {
      const delayRow = document.createElement("div");
      delayRow.className = "command-inline-row";
      const delayLabel = document.createElement("div");
      delayLabel.className = "muted";
      delayLabel.textContent = "Delay (ms)";
      const delayInput = document.createElement("input");
      delayInput.type = "number";
      delayInput.min = "0";
      delayInput.max = "120000";
      delayInput.step = "10";
      delayInput.value = String(command.delayMs ?? 0);
      delayInput.disabled = editorLocked;
      delayInput.addEventListener("input", () => {
        const btn = selectedButton();
        if (!btn?.id) return;
        dispatch(
          {
            type: "button.replaceCommand",
            buttonId: btn.id,
            commandIndex,
            command: {
              ...command,
              kind: "delay",
              delayMs: Math.max(0, Math.min(120000, Math.trunc(Number(delayInput.value) || 0)))
            }
          },
          { render: false, historyGroup: `cmd-delay-${btn.id}-${commandIndex}` }
        );
      });
      delayRow.appendChild(delayLabel);
      delayRow.appendChild(delayInput);
      wrap.appendChild(delayRow);
    } else if (selectedContact?.protocol === "osc-udp") {
      const address = document.createElement("input");
      address.placeholder = "OSC address";
      address.value = command.osc?.address ?? "/ping";
      address.disabled = editorLocked;
      address.addEventListener("input", () => {
        const btn = selectedButton();
        if (!btn?.id) return;
        dispatch(
          {
            type: "button.setCommandOscAddress",
            buttonId: btn.id,
            commandIndex,
            address: address.value
          },
          { render: false, historyGroup: `cmd-osc-address-${btn.id}-${commandIndex}` }
        );
      });

      const argType = document.createElement("select");
      appendOption(argType, "string", "string");
      appendOption(argType, "int", "int");
      appendOption(argType, "float", "float");
      appendOption(argType, "bool", "bool");
      argType.disabled = editorLocked;
      argType.value = command.osc?.args?.[0]?.type ?? "string";
      argType.addEventListener("change", () => {
        const btn = selectedButton();
        if (!btn?.id) return;
        const currentValue = command.osc?.args?.[0]?.value ?? "";
        dispatch({
          type: "button.setCommandOscArgFirst",
          buttonId: btn.id,
          commandIndex,
          argType: argType.value,
          argValue: currentValue
        });
      });

      const argValue = document.createElement("input");
      argValue.placeholder = "Argument value";
      argValue.disabled = editorLocked;
      argValue.value = String(command.osc?.args?.[0]?.value ?? "");
      argValue.addEventListener("input", () => {
        const btn = selectedButton();
        if (!btn?.id) return;
        const type = command.osc?.args?.[0]?.type ?? "string";
        let nextValue: any = argValue.value;
        if (type === "int") nextValue = Math.trunc(Number(argValue.value) || 0);
        if (type === "float") nextValue = Number(argValue.value) || 0;
        if (type === "bool") nextValue = argValue.value.toLowerCase() === "true";
        dispatch(
          {
            type: "button.setCommandOscArgFirst",
            buttonId: btn.id,
            commandIndex,
            argType: type,
            argValue: nextValue
          },
          { render: false, historyGroup: `cmd-osc-arg-${btn.id}-${commandIndex}` }
        );
      });

      const inlineRow = document.createElement("div");
      inlineRow.className = "command-inline-row";
      wrap.appendChild(address);
      inlineRow.appendChild(argType);
      inlineRow.appendChild(argValue);
      wrap.appendChild(inlineRow);
    } else {
      const payloadType = document.createElement("select");
      appendOption(payloadType, "string", "string");
      appendOption(payloadType, "hex", "hex");
      if (selectedContact?.protocol === "udp") {
        appendOption(payloadType, "json", "json");
      }
      const nextTypeRaw = String(command.payload?.type ?? "string");
      const nextType =
        nextTypeRaw === "hex"
          ? "hex"
          : selectedContact?.protocol === "udp" && nextTypeRaw === "json"
            ? "json"
            : "string";
      payloadType.value = nextType;
      payloadType.disabled = editorLocked;
      payloadType.addEventListener("change", () => {
        const btn = selectedButton();
        if (!btn?.id) return;
        dispatch(
          {
            type: "button.setCommandPayloadType",
            buttonId: btn.id,
            commandIndex,
            payloadType: payloadType.value === "hex" ? "hex" : payloadType.value === "json" ? "json" : "string"
          },
          { render: false, historyGroup: `cmd-payload-type-${btn.id}-${commandIndex}` }
        );
      });

      const payloadValue = document.createElement("input");
      payloadValue.placeholder = nextType === "json" ? '{"key":"value"}' : "Payload";
      payloadValue.value = command.payload?.value ?? "";
      payloadValue.disabled = editorLocked;
      payloadValue.addEventListener("input", () => {
        const btn = selectedButton();
        if (!btn?.id) return;
        dispatch(
          {
            type: "button.setCommandPayloadValue",
            buttonId: btn.id,
            commandIndex,
            value: payloadValue.value
          },
          { render: false, historyGroup: `cmd-payload-value-${btn.id}-${commandIndex}` }
        );
      });

      const inlineRow = document.createElement("div");
      inlineRow.className = "command-inline-row";
      inlineRow.appendChild(payloadType);
      inlineRow.appendChild(payloadValue);
      wrap.appendChild(inlineRow);
    }

    return wrap;
  };

  const renderEditor = (): void => {
    renderEditorSelection();
    commandsEl.textContent = "";
    commandsEl.ondragover = null;
    commandsEl.ondrop = null;
    const btn = state.ui.selectedTarget === "button" ? selectedButton() : null;
    if (!btn) return;
    const dragIndex = selectedCommandDragIndex;
    if (typeof dragIndex !== "number" || !Number.isInteger(dragIndex) || dragIndex < 0) {
      selectedCommandDragIndex = null;
    } else if (dragIndex >= btn.commands.length) {
      selectedCommandDragIndex = btn.commands.length ? btn.commands.length - 1 : null;
    }
    btn.commands.forEach((command, index) => {
      commandsEl.appendChild(commandEditor(command, index));
    });
    if (canEdit()) {
      commandsEl.ondragover = (event) => {
        if (draggingCommandIndex === null) return;
        event.preventDefault();
      };
      commandsEl.ondrop = (event) => {
        if (draggingCommandIndex === null) return;
        if ((event.target as Element | null)?.closest(".command")) return;
        event.preventDefault();
        const fromIndex = draggingCommandIndex;
        draggingCommandIndex = null;
        moveSelectedButtonCommand(fromIndex, btn.commands.length);
      };
    }
  };

  return {
    renderEditor
  };
}
