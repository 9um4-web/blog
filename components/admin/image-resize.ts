/**
 * 이미지/임베드 드래그 리사이즈 헬퍼.
 * 지정한 body 엘리먼트 내의 모든 <img>와 .embed-widget을 찾아 리사이즈 핸들을
 * 붙이고 드래그 이벤트를 바인딩한다.
 * - 좌/우 핸들: 너비 조절 (이미지 + 모든 임베드)
 * - 하단 핸들: 높이 조절 (내용 높이가 콘텐츠와 무관하게 자유로운 임베드만 — SoundCloud)
 */

export type ResizeDimension = "width" | "height";

export type ImageResizeHandler = (
  lineNum: number,
  originalSrc: string,
  newSize: string,
  dimension: ResizeDimension,
) => void;

/** 높이 드래그 핸들을 붙일 임베드 (비율 고정·자동 높이 위젯은 제외) */
const HEIGHT_RESIZABLE_SELECTOR = ".soundcloud-embed";

const MIN_WIDTH_PX = 50;
const MIN_HEIGHT_PX = 80;
const MAX_HEIGHT_PX = 1200;

export function setupImageResizing(bodyEl: HTMLElement, onImageResize: ImageResizeHandler) {
  const targets = bodyEl.querySelectorAll("img, .embed-widget");

  targets.forEach((el) => {
    const isImg = el.tagName === "IMG";

    // 1. 이미 처리된 경우 건너뜀
    if (isImg) {
      if (el.parentElement?.classList.contains("image-resize-container")) return;
    } else {
      if (el.querySelector(".image-resize-handle")) return;
    }

    // 2. data-sl 속성을 가진 가장 가까운 조상 혹은 자기 자신 탐색 (원본 줄 번호 확인)
    const ancestorWithSl = el.closest("[data-sl]");
    if (!ancestorWithSl) return;
    const lineNum = parseInt((ancestorWithSl as HTMLElement).dataset.sl || "", 10);
    if (isNaN(lineNum)) return;

    let container = el as HTMLElement;
    let resizeTarget = el as HTMLElement;

    // 3. 이미지인 경우만 래퍼 컨테이너 생성 및 삽입
    if (isImg) {
      container = document.createElement("div");
      container.className = "image-resize-container";
      const img = el as HTMLImageElement;
      if (img.style.width) container.style.width = img.style.width;

      img.parentNode?.insertBefore(container, img);
      container.appendChild(img);
      resizeTarget = img;
    }

    const originalSrcOf = () =>
      isImg
        ? resizeTarget.getAttribute("src") || ""
        : resizeTarget.getAttribute("data-src") || "";

    /** 드래그 공통 골격: 이동량 → 적용, 종료 시 최종값 보고 */
    const startDrag = (
      e: MouseEvent,
      onMove: (deltaX: number, deltaY: number) => void,
      onEnd: () => void,
    ) => {
      e.preventDefault();
      e.stopPropagation();
      document.body.dataset.imageResizing = "true";
      const startX = e.clientX;
      const startY = e.clientY;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        onMove(moveEvent.clientX - startX, moveEvent.clientY - startY);
      };
      const handleMouseUp = () => {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
        // 드래그가 끝난 후 아주 잠깐 동안 클릭 이벤트 무시용 플래그 설정
        document.body.dataset.imageJustResized = "true";
        delete document.body.dataset.imageResizing;
        setTimeout(() => {
          delete document.body.dataset.imageJustResized;
        }, 50);
        onEnd();
      };

      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    };

    // 4. 좌우(너비) 드래그 핸들
    const handleWidthMouseDown = (e: MouseEvent, isRight: boolean) => {
      const startWidth = resizeTarget.getBoundingClientRect().width;
      const containerWidth = bodyEl.getBoundingClientRect().width;
      const originalSrc = originalSrcOf();

      startDrag(
        e,
        (deltaX) => {
          let newWidth = isRight ? startWidth + deltaX : startWidth - deltaX;
          // 최소 50px, 최대 부모 컨테이너 넓이로 제한
          newWidth = Math.max(MIN_WIDTH_PX, Math.min(newWidth, containerWidth));
          if (isImg) {
            resizeTarget.style.width = `${newWidth}px`;
            resizeTarget.style.height = "auto";
            container.style.width = `${newWidth}px`;
          } else {
            resizeTarget.style.width = `${newWidth}px`;
          }
        },
        () => {
          const finalWidthPx = resizeTarget.getBoundingClientRect().width;

          // 원래 단위(px or %) 파악
          let usePercent = false;
          try {
            const url = new URL(originalSrc, "http://localhost");
            const w =
              url.searchParams.get("w") ||
              url.searchParams.get("width") ||
              new URLSearchParams(url.hash.slice(1)).get("w") ||
              new URLSearchParams(url.hash.slice(1)).get("width") ||
              "";
            if (w.includes("%")) {
              usePercent = true;
            }
          } catch {}

          const finalWidthStr = usePercent
            ? `${Math.round((finalWidthPx / containerWidth) * 100)}%`
            : `${Math.round(finalWidthPx)}`;
          onImageResize(lineNum, originalSrc, finalWidthStr, "width");
        },
      );
    };

    const leftHandle = document.createElement("div");
    leftHandle.className = "image-resize-handle left";
    const rightHandle = document.createElement("div");
    rightHandle.className = "image-resize-handle right";
    container.appendChild(leftHandle);
    container.appendChild(rightHandle);
    leftHandle.addEventListener("mousedown", (e) => handleWidthMouseDown(e, false));
    rightHandle.addEventListener("mousedown", (e) => handleWidthMouseDown(e, true));

    // 5. 하단(높이) 드래그 핸들 — 높이가 자유로운 임베드만
    if (!isImg && (el as HTMLElement).matches(HEIGHT_RESIZABLE_SELECTOR)) {
      const bottomHandle = document.createElement("div");
      bottomHandle.className = "image-resize-handle bottom";
      container.appendChild(bottomHandle);

      bottomHandle.addEventListener("mousedown", (e) => {
        const startHeight = resizeTarget.getBoundingClientRect().height;
        const originalSrc = originalSrcOf();

        startDrag(
          e,
          (_deltaX, deltaY) => {
            const newHeight = Math.max(
              MIN_HEIGHT_PX,
              Math.min(startHeight + deltaY, MAX_HEIGHT_PX),
            );
            resizeTarget.style.height = `${newHeight}px`;
          },
          () => {
            const finalHeightPx = resizeTarget.getBoundingClientRect().height;
            // 높이는 % 단위 개념이 없으므로 항상 px 정수로 보고
            onImageResize(lineNum, originalSrc, `${Math.round(finalHeightPx)}`, "height");
          },
        );
      });
    }
  });
}
