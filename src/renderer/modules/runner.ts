import { trackOnboardingStep } from "./onboarding";
import type { ButtonLike, CommandLike, ContactLike, RendererStateLike } from "./domainTypes";

const MAX_COMMAND_PAYLOAD_BYTES = 64 * 1024;

type RunnerDeps = {
  state: RendererStateLike;
  gridEl: HTMLElement;
  getContactById: (contactId: string) => ContactLike | null;
  resolveCommandForSend: (command: CommandLike) => unknown;
  setStatus: (message: string) => void;
  showToast: (message: string, type?: string) => void;
  executeChain: (payload: {
    buttonId: string;
    chain: unknown[];
    onError: "stop" | "continue";
  }) => Promise<{ ok: boolean; steps: Array<{ ok: boolean; message?: string; code?: string }> }>;
};

export type RunnerController = {
  validateCommand: (command: CommandLike) => string | null;
  runButton: (btn: ButtonLike) => Promise<void>;
};

export function createRunnerController({
  state,
  gridEl,
  getContactById,
  resolveCommandForSend,
  setStatus,
  showToast,
  executeChain
}: RunnerDeps): RunnerController {
  const pulseButton = (buttonId: string, variant = ""): void => {
    const selectorId = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(buttonId) : buttonId;
    const el = gridEl.querySelector(`[data-btn-id="${selectorId}"]`);
    if (!el) return;
    el.classList.remove("click-pulse", "pulse-success", "pulse-error");
    void el.clientWidth;
    el.classList.add("click-pulse");
    if (variant === "success") el.classList.add("pulse-success");
    if (variant === "error") el.classList.add("pulse-error");
    window.setTimeout(() => {
      el.classList.remove("click-pulse", "pulse-success", "pulse-error");
    }, 420);
  };

  const mapNetworkError = (code?: string, rawMessage?: string): string => {
    switch (code) {
      case "ETIMEDOUT":
        return "Device did not respond (timeout)";
      case "ECONNREFUSED":
        return "Connection refused by remote host";
      case "EHOSTUNREACH":
      case "ENETUNREACH":
      case "ENOTFOUND":
        return "Host unreachable";
      case "EINVAL":
        return "Invalid network settings";
      default:
        return rawMessage || "Unknown network error";
    }
  };

  const validateCommand = (command: CommandLike): string | null => {
    if (!command.contactId) return "Select a connection";
    const contact = getContactById(command.contactId);
    if (!contact) return "Selected connection not found";
    if (!contact.target?.host) return "Connection host is required";
    const port = Number(contact.target?.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      return "Connection port must be 1..65535";
    }
    if (contact.protocol === "osc-udp") {
      if (!command.osc?.address) return "OSC address is required";
      if (!Array.isArray(command.osc?.args)) return "OSC args must be array";
      return null;
    }
    if (!command.payload?.value) return "Payload value is required";
    const payloadValue = String(command.payload.value);
    if (command.payload.type === "hex") {
      const compact = payloadValue
        .trim()
        .split(/\s+/)
        .map((chunk: string) => chunk.replace(/^0x/i, ""))
        .join("");
      if (!compact || compact.length % 2 !== 0 || /[^0-9a-f]/i.test(compact)) {
        return "Invalid hex payload";
      }
      const byteLength = compact.length / 2;
      if (byteLength > MAX_COMMAND_PAYLOAD_BYTES) {
        return `Payload exceeds ${MAX_COMMAND_PAYLOAD_BYTES} bytes`;
      }
    } else {
      const byteLength = new TextEncoder().encode(payloadValue).length;
      if (byteLength > MAX_COMMAND_PAYLOAD_BYTES) {
        return `Payload exceeds ${MAX_COMMAND_PAYLOAD_BYTES} bytes`;
      }
    }
    return null;
  };

  const runButton = async (btn: ButtonLike): Promise<void> => {
    if (!btn?.commands?.length) {
      showToast("No commands configured");
      return;
    }
    pulseButton(btn.id);
    for (const command of btn.commands) {
      const validationError = validateCommand(command);
      if (validationError) {
        showToast(validationError);
        return;
      }
    }
    const resolvedChain = [];
    for (const command of btn.commands) {
      const resolved = resolveCommandForSend(command);
      if (!resolved) {
        showToast("Selected connection not found");
        return;
      }
      resolvedChain.push(resolved);
    }
    const result = await executeChain({
      buttonId: btn.id,
      chain: resolvedChain,
      onError: state.preset.settings.onCommandError
    });
    const total = resolvedChain.length;
    const okCount = result.steps.filter((s) => s.ok).length;
    const label = btn.label || "button";
    if (!result.ok) {
      const failedStep = result.steps.find((item) => !item.ok);
      const message = mapNetworkError(failedStep?.code, failedStep?.message ?? "unknown error");
      pulseButton(btn.id, "error");
      setStatus(`✗ ${label}: ${okCount}/${total} (${message})`);
      showToast(`✗ ${label}: ${message}`, "error");
    } else {
      pulseButton(btn.id, "success");
      setStatus(`✓ ${label}: ${okCount}/${total} sent`);
      trackOnboardingStep("test-send");
      if (state.preset?.settings?.toastEnabled !== false) {
        showToast(`✓ ${label}: ${okCount}/${total} sent`, "success");
      }
    }
  };

  return {
    validateCommand,
    runButton
  };
}
