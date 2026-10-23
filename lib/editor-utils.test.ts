import { describe, expect, it } from "vitest";
import { parseEditorMode } from "./editor-utils";

describe("parseEditorMode", () => {
  it("알려진 모드는 그대로, 그 밖은 통합(기본)", () => {
    expect(parseEditorMode("split")).toBe("split");
    expect(parseEditorMode("source")).toBe("source");
    expect(parseEditorMode("wysiwyg")).toBe("wysiwyg");
    expect(parseEditorMode("unified")).toBe("unified");
    expect(parseEditorMode(undefined)).toBe("unified");
    expect(parseEditorMode("nope")).toBe("unified");
  });
});
