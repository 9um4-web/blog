"use client";

import { useCallback, useRef, useState } from "react";
import { renderPostPreview } from "@/lib/actions/posts";
import type { HydratedPostBodyPart } from "@/lib/post-embeds";

const DEBOUNCE_MS = 300;

/**
 * 에디터 미리보기 상태. 본문 변경을 디바운스해 서버 렌더를 요청하고,
 * 요청 id로 늦게 도착한 응답을 버려 순서 꼬임을 방지한다.
 * (effect가 아니라 이벤트에서 schedule을 호출하는 전제)
 */
export function usePostPreview() {
  const [bodyParts, setBodyParts] = useState<HydratedPostBodyPart[]>([]);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reqId = useRef(0);

  // 내부적으로 ref/setter만 쓰므로 안정 참조 — 마운트 effect 의존성에 넣어도 1회만 실행
  const schedule = useCallback((content: string) => {
    if (timer.current) clearTimeout(timer.current);
    setLoading(true);
    timer.current = setTimeout(async () => {
      const id = ++reqId.current;
      try {
        const { bodyParts: parts } = await renderPostPreview(content);
        if (id === reqId.current) setBodyParts(parts);
      } catch {
        if (id === reqId.current) {
          setBodyParts([{ kind: "error", message: "미리보기 렌더 실패" }]);
        }
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    }, DEBOUNCE_MS);
  }, []);

  return { bodyParts, loading, schedule };
}
