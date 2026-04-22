export type AppMode = "edit" | "use";

export type Protocol = "udp" | "tcp" | "osc-udp";
export type PayloadType = "string" | "hex" | "json";
export type CommandErrorPolicy = "stop" | "continue";
export type OscArgType = "int" | "float" | "string" | "bool";

export interface UiConfig {
  alwaysOnTop: boolean;
  clickThroughBackground: boolean;
  mode: AppMode;
  buttonSize: {
    w: number;
    h: number;
  };
  grid: {
    cols: number;
    rows: number;
  };
  window: {
    x: number;
    y: number;
  };
  service: {
    col: number;
    row: number;
    radius: number;
    showInGrid: boolean;
  };
  gridBackground: {
    color: string;
    opacity: number;
  };
  webServer?: {
    enabled?: boolean;
    host?: string;
    port?: number;
  };
}

export interface AppSettings {
  onCommandError: CommandErrorPolicy;
  toastEnabled: boolean;
}

export interface ButtonStyle {
  bgColor: string;
  textColor: string;
  fontSize: number;
  radius: number;
  iconPath?: string;
  wrapLabel?: boolean;
}

export interface ButtonPosition {
  col: number;
  row: number;
}

export interface Target {
  host: string;
  port: number;
}

export interface Payload {
  type: PayloadType;
  value: string;
}

export interface OscArg {
  type: OscArgType;
  value: number | string | boolean;
}

export interface OscPayload {
  address: string;
  args: OscArg[];
}

export interface Command {
  kind?: "command";
  protocol: Protocol;
  target: Target;
  payload?: Payload;
  osc?: OscPayload;
}

export interface DelayCommand {
  kind: "delay";
  delayMs: number;
}

export interface ButtonConfig {
  id: string;
  label: string;
  style: ButtonStyle;
  position: ButtonPosition;
  commands: Array<Command | DelayCommand>;
}

export interface Contact {
  id: string;
  name: string;
  protocol: Protocol;
  host: string;
  port: number;
}

export const PRESET_SCHEMA_VERSION = 2;

export interface PresetMeta {
  createdAt: string;
  updatedAt: string;
}

export interface Preset {
  version: number;
  meta: PresetMeta;
  ui: UiConfig;
  settings: AppSettings;
  buttons: ButtonConfig[];
  contacts: Contact[];
}

export interface SendResult {
  ok: boolean;
  message?: string;
}

export interface ChainStepResult extends SendResult {
  index: number;
}

export interface ChainResult {
  ok: boolean;
  steps: ChainStepResult[];
}
