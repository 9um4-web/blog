export const EDITOR_MODE_COOKIE = "post_editor_mode";

export type EditorMode = "unified" | "split" | "source";

export function parseEditorMode(value: string | undefined): EditorMode {
  return value === "split" || value === "source" ? value : "unified";
}
