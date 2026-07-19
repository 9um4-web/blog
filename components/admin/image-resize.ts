/**
 * 이미지 드래그 리사이즈 헬퍼.
 * 지정한 body 엘리먼트 내의 모든 <img> 태그를 찾아 리사이즈 핸들이 감싸도록 설정하고
 * 드래그 앤 드롭 이벤트를 바인딩한다.
 */
export function setupImageResizing(
  bodyEl: HTMLElement,
  onImageResize: (lineNum: number, originalSrc: string, newWidth: string) => void
) {
  const images = bodyEl.querySelectorAll("img");

  images.forEach((img) => {
    // 1. 이미 래핑된 경우 건너뜀
    if (img.parentElement?.classList.contains("image-resize-container")) return;

    // 2. data-sl 속성을 가진 가장 가까운 조상 탐색 (원본 줄 번호 확인)
    const ancestorWithSl = img.closest("[data-sl]");
    if (!ancestorWithSl) return;
    const lineNum = parseInt((ancestorWithSl as HTMLElement).dataset.sl || "", 10);
    if (isNaN(lineNum)) return;

    // 3. 래퍼 컨테이너 생성 및 삽입
    const container = document.createElement("div");
    container.className = "image-resize-container";
    if (img.style.width) container.style.width = img.style.width;

    img.parentNode?.insertBefore(container, img);
    container.appendChild(img);

    // 4. 좌우 드래그 핸들 생성 및 삽입
    const leftHandle = document.createElement("div");
    leftHandle.className = "image-resize-handle left";

    const rightHandle = document.createElement("div");
    rightHandle.className = "image-resize-handle right";

    container.appendChild(leftHandle);
    container.appendChild(rightHandle);

    // 5. 드래그 이벤트 리스너 등록
    const handleMouseDown = (e: MouseEvent, isRight: boolean) => {
      e.preventDefault();
      e.stopPropagation();

      document.body.dataset.imageResizing = "true";

      const startX = e.clientX;
      const startWidth = img.getBoundingClientRect().width;
      const containerWidth = bodyEl.getBoundingClientRect().width;
      const originalSrc = img.getAttribute("src") || "";

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const deltaX = moveEvent.clientX - startX;
        let newWidth = isRight ? startWidth + deltaX : startWidth - deltaX;
        // 최소 50px, 최대 부모 컨테이너 넓이로 제한
        newWidth = Math.max(50, Math.min(newWidth, containerWidth));

        img.style.width = `${newWidth}px`;
        img.style.height = "auto";
        container.style.width = `${newWidth}px`;
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

        const finalWidthPx = img.getBoundingClientRect().width;

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

        let finalWidthStr = "";
        if (usePercent) {
          finalWidthStr = `${Math.round((finalWidthPx / containerWidth) * 100)}%`;
        } else {
          finalWidthStr = `${Math.round(finalWidthPx)}`;
        }

        onImageResize(lineNum, originalSrc, finalWidthStr);
      };

      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    };

    leftHandle.addEventListener("mousedown", (e) => handleMouseDown(e, false));
    rightHandle.addEventListener("mousedown", (e) => handleMouseDown(e, true));
  });
}
