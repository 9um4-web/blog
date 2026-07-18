/**
 * 각주 미리보기 (나무위키식): 데스크톱은 hover, 모바일은 탭으로 각주 내용을
 * 팝오버로 띄운다. GFM 각주 참조(`[data-footnote-ref]`)는 remark-rehype가
 * href="#user-content-fn-N"로 생성하므로, 그 href로 본문 내 각주 정의(li)를
 * 찾아 내용을 복제해 보여준다 — 원래의 페이지 스크롤 이동은 막는다.
 */

const HOVER_OPEN_DELAY = 80;
const HOVER_CLOSE_DELAY = 150;

let activePopover: HTMLDivElement | null = null;
let activeTrigger: HTMLElement | null = null;
let closeTimer: ReturnType<typeof setTimeout> | null = null;

function clearCloseTimer() {
  if (closeTimer !== null) {
    clearTimeout(closeTimer);
    closeTimer = null;
  }
}

function closePopover() {
  clearCloseTimer();
  activePopover?.remove();
  activePopover = null;
  activeTrigger?.setAttribute("aria-expanded", "false");
  activeTrigger = null;
}

function scheduleClose() {
  clearCloseTimer();
  closeTimer = setTimeout(closePopover, HOVER_CLOSE_DELAY);
}

function footnoteContentFor(root: HTMLElement, trigger: HTMLElement): DocumentFragment | null {
  const href = trigger.getAttribute("href");
  if (!href?.startsWith("#")) return null;
  const target = root.querySelector(href);
  if (!target) return null;

  const clone = target.cloneNode(true) as HTMLElement;
  clone.querySelectorAll("[data-footnote-backref]").forEach((el) => el.remove());

  const fragment = document.createDocumentFragment();
  while (clone.firstChild) fragment.appendChild(clone.firstChild);
  return fragment;
}

function positionPopover(popover: HTMLDivElement, trigger: HTMLElement) {
  const rect = trigger.getBoundingClientRect();
  const margin = 8;
  const popRect = popover.getBoundingClientRect();

  let left = rect.left + rect.width / 2 - popRect.width / 2;
  left = Math.min(Math.max(left, margin), window.innerWidth - popRect.width - margin);

  let top = rect.bottom + margin;
  if (top + popRect.height > window.innerHeight - margin) {
    top = rect.top - popRect.height - margin;
  }
  top = Math.max(top, margin);

  popover.style.left = `${left}px`;
  popover.style.top = `${top}px`;
}

function openPopover(root: HTMLElement, trigger: HTMLElement) {
  clearCloseTimer();
  if (activeTrigger === trigger) return;
  closePopover();

  const content = footnoteContentFor(root, trigger);
  if (!content) return;

  const popover = document.createElement("div");
  popover.className = "footnote-preview";
  popover.setAttribute("role", "note");
  popover.appendChild(content);

  popover.addEventListener("pointerenter", clearCloseTimer);
  popover.addEventListener("pointerleave", (e) => {
    if (e.pointerType === "mouse") scheduleClose();
  });

  document.body.appendChild(popover);
  positionPopover(popover, trigger);

  trigger.setAttribute("aria-expanded", "true");
  activePopover = popover;
  activeTrigger = trigger;
}

/** bodyRef 컨테이너에 위임 리스너를 붙인다. 반환된 함수로 정리(cleanup)한다. */
export function attachFootnotePreview(root: HTMLElement): () => void {
  let hoverTimer: ReturnType<typeof setTimeout> | null = null;

  const onPointerOver = (e: PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    const trigger = (e.target as HTMLElement).closest<HTMLElement>("[data-footnote-ref]");
    if (!trigger || !root.contains(trigger)) return;
    if (hoverTimer !== null) clearTimeout(hoverTimer);
    hoverTimer = setTimeout(() => openPopover(root, trigger), HOVER_OPEN_DELAY);
  };

  const onPointerOut = (e: PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    if (hoverTimer !== null) {
      clearTimeout(hoverTimer);
      hoverTimer = null;
    }
    const related = e.relatedTarget as Node | null;
    if (activePopover && related && activePopover.contains(related)) return;
    scheduleClose();
  };

  // 데스크톱 hover든 모바일 탭이든 클릭 자체는 항상 팝오버 토글로 처리하고
  // 페이지 하단 각주 목록으로 점프하는 기본 동작은 막는다
  const onClick = (e: MouseEvent) => {
    const trigger = (e.target as HTMLElement).closest<HTMLElement>("[data-footnote-ref]");
    if (!trigger || !root.contains(trigger)) return;
    e.preventDefault();
    if (activeTrigger === trigger) closePopover();
    else openPopover(root, trigger);
  };

  const onDocumentPointerDown = (e: PointerEvent) => {
    if (!activePopover) return;
    const target = e.target as Node;
    if (activePopover.contains(target) || activeTrigger?.contains(target)) return;
    closePopover();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape" && activePopover) closePopover();
  };

  root.addEventListener("pointerover", onPointerOver);
  root.addEventListener("pointerout", onPointerOut);
  root.addEventListener("click", onClick);
  document.addEventListener("pointerdown", onDocumentPointerDown);
  document.addEventListener("keydown", onKeyDown);

  return () => {
    root.removeEventListener("pointerover", onPointerOver);
    root.removeEventListener("pointerout", onPointerOut);
    root.removeEventListener("click", onClick);
    document.removeEventListener("pointerdown", onDocumentPointerDown);
    document.removeEventListener("keydown", onKeyDown);
    if (hoverTimer !== null) clearTimeout(hoverTimer);
    closePopover();
  };
}
