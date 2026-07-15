/**
 * Mermaid lazy render (스펙 4.2):
 * - 접힌 섹션 내부 블록은 렌더하지 않는다 (조상 중 data-collapsed가 있으면 스킵)
 * - 최초 1회만 렌더하고(data-mermaid-done) 이후 접었다 펴도 재사용
 * - 실패 시 원문 코드블록을 그대로 남긴다 (스펙 9.2)
 */
let seq = 0;

export async function renderVisibleMermaid(root: HTMLElement): Promise<void> {
  const blocks = Array.from(
    root.querySelectorAll<HTMLElement>("[data-mermaid]:not([data-mermaid-done])"),
  ).filter((el) => !el.closest("section[data-collapsed]"));
  if (blocks.length === 0) return;

  const { default: mermaid } = await import("mermaid");
  mermaid.initialize({ startOnLoad: false, theme: "neutral" });

  for (const block of blocks) {
    const pre = block.querySelector("pre");
    const code = pre?.textContent ?? "";
    block.setAttribute("data-mermaid-done", "");
    try {
      const { svg } = await mermaid.render(`mermaid-${seq++}`, code);
      const host = document.createElement("div");
      host.className = "mermaid-svg";
      host.innerHTML = svg;
      block.appendChild(host);
      pre?.classList.add("hidden");
    } catch {
      // 실패: fallback으로 원문 <pre>가 그대로 노출된다
    }
  }
}
