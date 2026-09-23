/**
 * remark-directive(micromark)는 코드 펜스처럼 "닫는 펜스의 콜론 수 >= 여는 펜스"면
 * 바깥 컨테이너부터 닫아버린다. 그래서 같은 길이로 중첩하면
 *
 *   :::indent
 *   :::note
 *   :::        ← indent까지 닫힘
 *   :::        ← 문단 텍스트로 새어나옴
 *
 * 처럼 깨지고, 바깥을 `::::`로 더 길게 써야만 제대로 중첩된다. 사용자가 콜론 수를
 * 세게 할 수는 없으니, 파싱 직전에 여닫는 펜스를 스택으로 짝지어 바깥 컨테이너일수록
 * 콜론이 많아지도록 다시 쓴다. 맨 안쪽은 3개, 한 겹 바깥마다 1개씩 늘어난다.
 *
 * - 줄 수는 바뀌지 않는다(에디터 미리보기의 data-sl/data-el 소스 라인 매핑 유지).
 * - 이미 콜론 수를 늘려 쓴 원문도 같은 결과로 정규화된다(맨 안쪽 펜스부터 짝지음).
 * - 코드 펜스(``` / ~~~)와 $$ 수식 블록 안은 건드리지 않는다.
 * - 짝 없는 여는 펜스(안 닫힘)도 깊이 계산에는 포함 — 기존처럼 문서 끝까지 이어진다.
 */

// CRLF 원문이면 줄 끝에 \r이 남으므로 닫는 펜스는 \s*로 받는다
const OPEN_RE = /^[ \t>]*:{3,}[A-Za-z]/;
const CLOSE_RE = /^[ \t>]*:{3,}\s*$/;
const CODE_FENCE_RE = /^[ \t>]*(`{3,}|~{3,})/;
const MATH_FENCE_RE = /^[ \t>]*\$\$/;

interface Fence {
  openLine: number;
  closeLine: number | null;
  children: Fence[];
}

export function normalizeContainerFences(md: string): string {
  if (!md.includes(":::")) return md;

  const lines = md.split("\n");
  const roots: Fence[] = [];
  const stack: Fence[] = [];
  let codeFence: string | null = null;
  let inMath = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (codeFence) {
      const m = CODE_FENCE_RE.exec(line);
      if (m && m[1][0] === codeFence[0] && m[1].length >= codeFence.length) codeFence = null;
      continue;
    }
    if (inMath) {
      if (MATH_FENCE_RE.test(line)) inMath = false;
      continue;
    }
    const code = CODE_FENCE_RE.exec(line);
    if (code) {
      codeFence = code[1];
      continue;
    }
    // 한 줄짜리 $$ ... $$ 는 블록을 열지 않는다
    if (MATH_FENCE_RE.test(line) && !/\$\$.*\$\$/.test(line.trim())) {
      inMath = true;
      continue;
    }

    if (CLOSE_RE.test(line)) {
      const fence = stack.pop();
      if (fence) fence.closeLine = i;
      continue;
    }
    if (OPEN_RE.test(line)) {
      const fence: Fence = { openLine: i, closeLine: null, children: [] };
      (stack.length ? stack[stack.length - 1].children : roots).push(fence);
      stack.push(fence);
    }
  }

  /** 반환값: 이 펜스 아래로 중첩된 컨테이너 깊이(맨 안쪽 = 0) */
  const assign = (fence: Fence): number => {
    const height = fence.children.reduce((max, c) => Math.max(max, assign(c) + 1), 0);
    const colons = ":".repeat(3 + height);
    lines[fence.openLine] = lines[fence.openLine].replace(/:{3,}/, colons);
    if (fence.closeLine !== null) {
      lines[fence.closeLine] = lines[fence.closeLine].replace(/:{3,}/, colons);
    }
    return height;
  };
  roots.forEach(assign);

  return lines.join("\n");
}
