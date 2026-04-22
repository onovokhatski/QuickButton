export type RightTab = "button" | "grid" | "connections";
export type SelectionTarget = "button" | "service" | null;
export type LabelVisibility = "always" | "hover" | "never";
export type TextAlignX = "left" | "center" | "right";
export type TextAlignY = "top" | "middle" | "bottom";
export type Protocol = "udp" | "tcp" | "osc-udp";
export type CommandErrorPolicy = "stop" | "continue";

export type CommandLike = {
  kind?: "command" | "delay";
  enabled?: boolean;
  protocol?: Protocol;
  name?: string;
  delayMs?: number;
  contactId?: string;
  isCollapsed?: boolean;
  target?: { host: string; port: number; persistent?: boolean; keepAliveMs?: number };
  payload?: { type: "string" | "hex"; value: string };
  osc?: { address: string; args: Array<{ type: string; value: unknown }> };
  retry?: { count?: number; jitterMs?: number };
};

export type ButtonStyleLike = {
  bgColor: string;
  /** 0–100, 100 = opaque */
  bgOpacity?: number;
  borderColor?: string;
  textColor: string;
  fontSize: number;
  radius: number;
  wrapLabel?: boolean;
  iconAssetId?: string;
  iconPath?: string;
  iconDarken?: number;
  labelVisibility?: LabelVisibility;
  textAlignX?: TextAlignX;
  textAlignY?: TextAlignY;
};

export type ButtonLike = {
  id: string;
  label: string;
  style: ButtonStyleLike;
  position: { col: number; row: number };
  commands: CommandLike[];
};

export type ContactLike = {
  id: string;
  name: string;
  protocol: Protocol;
  target: { host: string; port: number; persistent?: boolean; keepAliveMs?: number };
};

export type PresetLike = {
  ui: {
    mode: "edit" | "use";
    alwaysOnTop: boolean;
    clickThroughBackground?: boolean;
    buttonSize: { w: number; h: number };
    grid: { cols: number; rows: number };
    gridBackground?: { color?: string; opacity?: number };
    service?: { showInGrid?: boolean; radius?: number };
  };
  settings: { onCommandError: CommandErrorPolicy; toastEnabled?: boolean };
  buttons: ButtonLike[];
  contacts?: ContactLike[];
};

export type RendererStateLike = {
  preset: PresetLike;
  ui: {
    activeRightTab: RightTab;
    selectedTarget: SelectionTarget;
    selectedButtonId: string | null;
    selectedButtonIds?: string[];
    selectedContactId?: string | null;
    isDirty: boolean;
  };
};
