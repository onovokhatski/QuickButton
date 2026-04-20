import type { AppCommand } from "./appCommands";
import { applyAppCommand } from "./appCommands";
import { trackOnboardingStep } from "./onboarding";

type Contact = {
  id: string;
  name: string;
  protocol: "udp" | "tcp" | "osc-udp";
  target: { host: string; port: number; persistent?: boolean; keepAliveMs?: number };
};

type PresetState = {
  preset: {
    contacts?: Contact[];
    buttons: Array<{
      commands: Array<{
        contactId?: string;
        target?: { host: string; port: number };
        protocol?: "udp" | "tcp" | "osc-udp";
      }>;
    }>;
  };
  ui: {
    selectedContactId: string | null;
  };
};

type ConnectionsDeps = {
  state: PresetState;
  canEdit: () => boolean;
  dispatch: (command: AppCommand) => void;
  render: () => void;
  showToast: (message: string, type?: string) => void;
  nowId: (prefix: string) => string;
  form: {
    contactNameEl: HTMLInputElement;
    contactProtocolEl: HTMLSelectElement;
    contactHostEl: HTMLInputElement;
    contactPortEl: HTMLInputElement;
    contactNewEl: HTMLButtonElement;
    contactSaveEl: HTMLButtonElement;
    contactsListEl: HTMLElement;
  };
};

export type ConnectionsController = {
  contacts: () => Contact[];
  getContactById: (contactId: string) => Contact | null;
  defaultContact: () => Contact;
  resolveCommandForSend: (command: {
    contactId?: string;
    payload?: { type: string; value: string };
    osc?: { address: string; args: unknown[] };
  }) => unknown | null;
  ensureContactsFromLegacyCommands: () => void;
  renderConnectionsPanel: () => void;
  deleteContactById: (contactId: string) => void;
  bindConnectionsEvents: () => void;
};

export function createConnectionsController({
  state,
  canEdit,
  dispatch,
  render,
  showToast,
  nowId,
  form
}: ConnectionsDeps): ConnectionsController {
  const SVG_NS = "http://www.w3.org/2000/svg";

  const deleteIcon = (): SVGSVGElement => {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 16 16");
    svg.setAttribute("aria-hidden", "true");
    for (const d of [
      "M3.5 5h9",
      "M6 5V12.5",
      "M10 5V12.5",
      "M5.5 5V3.5h5V5",
      "M4.5 5V13a1 1 0 0 0 1 1h5a1 1 0 0 0 1-1V5"
    ]) {
      const path = document.createElementNS(SVG_NS, "path");
      path.setAttribute("d", d);
      svg.appendChild(path);
    }
    return svg;
  };

  const {
    contactNameEl,
    contactProtocolEl,
    contactHostEl,
    contactPortEl,
    contactNewEl,
    contactSaveEl,
    contactsListEl
  } = form;

  const contacts = (): Contact[] => {
    return Array.isArray(state.preset.contacts) ? state.preset.contacts : [];
  };

  const getContactById = (contactId: string): Contact | null =>
    contacts().find((item) => item.id === contactId) ?? null;

  const defaultContact = (): Contact => ({
    id: nowId("contact"),
    name: `Contact ${contacts().length + 1}`,
    protocol: "udp",
    target: { host: "127.0.0.1", port: 7000 }
  });

  const resolveCommandForSend = (command: {
    contactId?: string;
    payload?: { type: string; value: string };
    osc?: { address: string; args: unknown[] };
    retry?: { count?: number; jitterMs?: number };
  }): unknown | null => {
    const contact = getContactById(command.contactId ?? "");
    if (!contact) {
      return null;
    }
    const resolved: {
      protocol: Contact["protocol"];
      target: { host: string; port: number; persistent?: boolean; keepAliveMs?: number };
      osc?: { address: string; args: unknown[] };
      payload?: { type: string; value: string };
      retry?: { count?: number; jitterMs?: number };
    } = {
      protocol: contact.protocol,
      target: {
        host: contact.target.host,
        port: Number(contact.target.port),
        persistent: Boolean(contact.target.persistent),
        keepAliveMs: Number(contact.target.keepAliveMs) || undefined
      }
    };
    if (command.retry && typeof command.retry === "object") {
      resolved.retry = {
        count: command.retry.count,
        jitterMs: command.retry.jitterMs
      };
    }
    if (contact.protocol === "osc-udp") {
      resolved.osc = command.osc ?? { address: "/ping", args: [] };
      return resolved;
    }
    resolved.payload = command.payload ?? { type: "string", value: "" };
    return resolved;
  };

  const ensureContactsFromLegacyCommands = (): void => {
    applyAppCommand(state, { type: "contacts.ensureFromLegacyCommands" });
  };

  const deleteContactById = (contactId: string): void => {
    if (!canEdit()) {
      return;
    }
    const contact = getContactById(contactId);
    if (!contact) {
      return;
    }
    const confirmed = window.confirm(`Delete connection "${contact.name}"?`);
    if (!confirmed) {
      return;
    }
    dispatch({ type: "contacts.deleteContact", contactId });
  };

  const renderConnectionsPanel = (): void => {
    if (!contactsListEl) {
      return;
    }
    if (state.ui.selectedContactId) {
      const selectedContact = getContactById(state.ui.selectedContactId);
      if (selectedContact) {
        contactNameEl.value = selectedContact.name;
        contactProtocolEl.value = selectedContact.protocol;
        contactHostEl.value = selectedContact.target.host;
        contactPortEl.value = String(selectedContact.target.port);
      }
    } else {
      contactNameEl.value = "";
      contactProtocolEl.value = "udp";
      contactHostEl.value = "127.0.0.1";
      contactPortEl.value = "7000";
    }
    contactsListEl.textContent = "";
    contacts().forEach((contact) => {
      const row = document.createElement("div");
      row.className = "contacts-row";

      const selectBtn = document.createElement("button");
      selectBtn.className = "contact-select";
      selectBtn.textContent = contact.name;
      if (state.ui.selectedContactId === contact.id) {
        selectBtn.style.outline = "2px solid #7ad2ff";
      }
      selectBtn.addEventListener("click", () => {
        state.ui.selectedContactId = contact.id;
        contactNameEl.value = contact.name;
        contactProtocolEl.value = contact.protocol;
        contactHostEl.value = contact.target.host;
        contactPortEl.value = String(contact.target.port);
        render();
      });

      const deleteBtn = document.createElement("button");
      deleteBtn.className = "icon-delete";
      deleteBtn.title = `Delete ${contact.name}`;
      deleteBtn.setAttribute("aria-label", `Delete ${contact.name}`);
      deleteBtn.appendChild(deleteIcon());
      deleteBtn.disabled = !canEdit();
      deleteBtn.addEventListener("click", () => {
        deleteContactById(contact.id);
      });

      row.appendChild(selectBtn);
      row.appendChild(deleteBtn);
      contactsListEl.appendChild(row);
    });
  };

  const bindConnectionsEvents = (): void => {
    contactNewEl.addEventListener("click", () => {
      state.ui.selectedContactId = null;
      contactNameEl.value = "";
      contactProtocolEl.value = "udp";
      contactHostEl.value = "127.0.0.1";
      contactPortEl.value = "7000";
      render();
    });

    contactSaveEl.addEventListener("click", () => {
      if (!canEdit()) {
        return;
      }
      const name = contactNameEl.value.trim();
      const host = contactHostEl.value.trim();
      const port = Number(contactPortEl.value);
      if (!name) {
        showToast("Contact name is required");
        return;
      }
      if (!host) {
        showToast("Contact host is required");
        return;
      }
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        showToast("Contact port must be 1..65535");
        return;
      }

      const current = state.ui.selectedContactId
        ? getContactById(state.ui.selectedContactId)
        : null;
      if (current) {
        dispatch({
          type: "contacts.updateContact",
          contactId: current.id,
          name,
          protocol: contactProtocolEl.value,
          host,
          port
        });
        trackOnboardingStep("contact");
      } else {
        const contact = {
          ...defaultContact(),
          name,
          protocol: contactProtocolEl.value as Contact["protocol"],
          target: { host, port }
        };
        dispatch({ type: "contacts.addContact", contact: contact as Record<string, unknown> });
        trackOnboardingStep("contact");
      }
    });
  };

  return {
    contacts,
    getContactById,
    defaultContact,
    resolveCommandForSend,
    ensureContactsFromLegacyCommands,
    renderConnectionsPanel,
    deleteContactById,
    bindConnectionsEvents
  };
}
