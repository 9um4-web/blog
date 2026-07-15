import { describe, expect, it } from "vitest";
import {
  imageMarkdown,
  MAX_IMAGE_BYTES,
  sanitizeImageFilename,
  validateImageUpload,
} from "./image";

describe("validateImageUpload", () => {
  it("허용 타입과 정상 크기는 통과", () => {
    expect(validateImageUpload("image/png", 1024)).toEqual({ ok: true });
    expect(validateImageUpload("image/webp", MAX_IMAGE_BYTES)).toEqual({ ok: true });
  });

  it("미허용 타입 거부", () => {
    expect(validateImageUpload("application/pdf", 1024)).toEqual({
      ok: false,
      reason: "unsupported-type",
    });
    expect(validateImageUpload("text/html", 10)).toEqual({
      ok: false,
      reason: "unsupported-type",
    });
  });

  it("크기 제한 초과/빈 파일 거부", () => {
    expect(validateImageUpload("image/png", MAX_IMAGE_BYTES + 1)).toEqual({
      ok: false,
      reason: "too-large",
    });
    expect(validateImageUpload("image/png", 0)).toEqual({ ok: false, reason: "empty" });
  });
});

describe("sanitizeImageFilename", () => {
  it("공백/특수문자를 정리하고 MIME 기준 확장자를 강제한다", () => {
    expect(sanitizeImageFilename("My Photo (1).PNG", "image/png")).toBe("my-photo-1.png");
  });

  it("jpeg 파일의 확장자를 jpg로 통일한다", () => {
    expect(sanitizeImageFilename("pic.jpeg", "image/jpeg")).toBe("pic.jpg");
  });

  it("한글 등 비허용 문자만 있으면 image로 fallback", () => {
    expect(sanitizeImageFilename("스크린샷.png", "image/png")).toBe("image.png");
  });

  it("MIME과 다른 확장자를 붙여도 MIME이 이긴다", () => {
    expect(sanitizeImageFilename("evil.html", "image/webp")).toBe("evil.webp");
  });
});

describe("imageMarkdown", () => {
  it("마크다운 이미지 스니펫을 만든다", () => {
    expect(imageMarkdown(3, "cat.png", "고양이")).toBe("![고양이](/images/3/cat.png)");
    expect(imageMarkdown(3, "cat.png")).toBe("![](/images/3/cat.png)");
  });
});
