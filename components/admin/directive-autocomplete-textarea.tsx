"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Textarea } from "@/components/ui/textarea";

interface PostOption {
  title: string;
  slug: string;
}

interface SeriesOption {
  id: number;
  name: string;
}

interface DirectiveMatch {
  kind: "post" | "series";
  query: string;
  start: number;
  end: number;
}

interface Props extends Omit<React.ComponentProps<"textarea">, "value" | "onChange"> {
  value: string;
  onValueChange: (value: string) => void;
  posts: PostOption[];
  series: SeriesOption[];
}

/**
 * ::post{slug=...} / :postlink[...]{slug=...} / ::series{id=...} 를 타이핑하는 중일 때
 * 커서 위치에 후보 목록을 띄운다. 값 부분(slug/id)이 `[a-z0-9-]`/숫자 밖의 문자(주로 `}`)를
 * 만나는 순간 정규식이 더 이상 매치되지 않아 자동으로 닫힌다.
 */
function detectDirectiveContext(text: string, cursor: number): DirectiveMatch | null {
  const windowStart = Math.max(0, cursor - 300);
  const before = text.slice(windowStart, cursor);

  const postMatch = /(?:::post|:postlink\[[^\]\n]*\])\{slug=([a-z0-9-]*)$/.exec(before);
  if (postMatch) {
    const query = postMatch[1];
    return { kind: "post", query, start: cursor - query.length, end: cursor };
  }

  const seriesMatch = /::series\{id=([0-9]*)$/.exec(before);
  if (seriesMatch) {
    const query = seriesMatch[1];
    return { kind: "series", query, start: cursor - query.length, end: cursor };
  }

  return null;
}

function filterPosts(posts: PostOption[], query: string): PostOption[] {
  const q = query.toLowerCase();
  return posts
    .filter((p) => p.slug.includes(query) || p.title.toLowerCase().includes(q))
    .sort((a, b) => Number(b.slug.startsWith(query)) - Number(a.slug.startsWith(query)))
    .slice(0, 8);
}

function filterSeries(series: SeriesOption[], query: string): SeriesOption[] {
  return series.filter((s) => String(s.id).startsWith(query)).slice(0, 8);
}

interface OptionItem {
  key: string;
  label: string;
  sub: string;
  value: string;
}

function computeOptions(
  next: DirectiveMatch | null,
  posts: PostOption[],
  series: SeriesOption[],
): OptionItem[] {
  if (next === null) return [];
  return next.kind === "post"
    ? filterPosts(posts, next.query).map((p) => ({
        key: p.slug,
        label: p.title,
        sub: p.slug,
        value: p.slug,
      }))
    : filterSeries(series, next.query).map((s) => ({
        key: String(s.id),
        label: s.name,
        sub: `#${s.id}`,
        value: String(s.id),
      }));
}

// 드롭다운 CSS(max-h-56/w-72)와 맞춰야 화면 밖으로 나가는지 미리 판단할 수 있다.
// 실제 렌더 높이는 항목 수에 따라 달라지므로(최대 8개 넘으면 max-h로 잘림), 화면 아래로
// 뒤집을지 판단할 때 "항상 꽉 찬 드롭다운"으로 가정하면 후보가 적을 때 불필요하게 위로
// 뒤집혀버린다 — 실제 예상 높이(itemHeight * 개수)로 계산해야 한다.
const DROPDOWN_MAX_HEIGHT = 224;
const DROPDOWN_ITEM_HEIGHT = 50;
const DROPDOWN_PADDING = 8;
const DROPDOWN_WIDTH = 288;
const VIEWPORT_MARGIN = 8;

// textarea 안의 실제 커서 픽셀 좌표를 구하기 위한 미러 div 기법에 필요한 스타일 속성들
const MIRROR_STYLE_PROPS = [
  "boxSizing",
  "width",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "borderTopWidth",
  "borderRightWidth",
  "borderBottomWidth",
  "borderLeftWidth",
  "borderStyle",
  "fontFamily",
  "fontSize",
  "fontStyle",
  "fontWeight",
  "letterSpacing",
  "lineHeight",
  "tabSize",
  "textIndent",
  "textTransform",
  "wordSpacing",
] as const;

function getCaretCoordinates(
  el: HTMLTextAreaElement,
  position: number,
): { top: number; left: number; height: number } {
  const div = document.createElement("div");
  const style = window.getComputedStyle(el);
  for (const prop of MIRROR_STYLE_PROPS) {
    div.style[prop as never] = style[prop as never];
  }
  div.style.position = "absolute";
  div.style.visibility = "hidden";
  div.style.whiteSpace = "pre-wrap";
  div.style.wordWrap = "break-word";
  div.style.top = "0";
  div.style.left = "-9999px";
  div.style.height = "auto";

  document.body.appendChild(div);
  div.textContent = el.value.slice(0, position);
  const span = document.createElement("span");
  span.textContent = el.value.slice(position) || ".";
  div.appendChild(span);

  const coords = {
    top: span.offsetTop - el.scrollTop,
    left: span.offsetLeft - el.scrollLeft,
    height: span.offsetHeight,
  };
  document.body.removeChild(div);
  return coords;
}

export function DirectiveAutocompleteTextarea({
  value,
  onValueChange,
  posts,
  series,
  className,
  ...props
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [match, setMatch] = useState<DirectiveMatch | null>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [activeIndex, setActiveIndex] = useState(0);

  const options = computeOptions(match, posts, series);

  /** match는 그대로 두고 화면상 위치만 다시 계산 — 스크롤/리사이즈 시 재사용 */
  const updatePositionFor = useCallback(
    (next: DirectiveMatch) => {
      const el = textareaRef.current;
      if (!el) return;
      const nextOptions = computeOptions(next, posts, series);
      if (nextOptions.length === 0) return;

      const coords = getCaretCoordinates(el, next.end);
      const rect = el.getBoundingClientRect();
      const estimatedHeight = Math.min(
        DROPDOWN_MAX_HEIGHT,
        nextOptions.length * DROPDOWN_ITEM_HEIGHT + DROPDOWN_PADDING,
      );
      // field-sizing:content라 textarea가 내용에 맞춰 계속 자라기 때문에, 문서 끝에서
      // 타이핑할수록 커서가 textarea 바닥과 가까워진다 — 실제 예상 높이 기준으로 아래
      // 공간이 부족할 때만 위로 뒤집는다 (후보가 적을 때 불필요하게 뒤집히는 것 방지)
      const caretTop = rect.top + coords.top;
      const caretBottom = caretTop + coords.height;
      const caretLeft = rect.left + coords.left;
      const spaceBelow = window.innerHeight - caretBottom;
      const openUp = spaceBelow < estimatedHeight && caretTop > spaceBelow;

      const top = Math.max(
        VIEWPORT_MARGIN,
        openUp ? caretTop - estimatedHeight - 4 : caretBottom + 4,
      );
      const left = Math.min(
        Math.max(VIEWPORT_MARGIN, caretLeft),
        window.innerWidth - DROPDOWN_WIDTH - VIEWPORT_MARGIN,
      );
      setPosition({ top, left });
    },
    [posts, series],
  );

  const refreshMatch = () => {
    const el = textareaRef.current;
    if (!el) return;
    const next = detectDirectiveContext(el.value, el.selectionStart ?? 0);
    setMatch(next);
    setActiveIndex(0);
    if (next) updatePositionFor(next);
  };

  // position: fixed라 스크롤이 나면 커서 기준 좌표가 그대로 어긋난다. 매 스크롤마다
  // 다시 재는 대신(긴 문서에서 계속 재계산하면 버벅이고, 뒤집힘 판정도 스크롤 도중
  // 잠깐씩 흔들려 보일 수 있다) 대부분의 에디터/IDE처럼 스크롤 시 그냥 닫는다 —
  // 커서로 돌아와서 다시 타이핑하면 그 자리에서 다시 뜬다
  useEffect(() => {
    if (!match) return;
    const onScroll = () => setMatch(null);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [match]);

  const applySelection = (item: { value: string }) => {
    const el = textareaRef.current;
    if (!el || !match) return;
    const newValue = value.slice(0, match.start) + item.value + value.slice(match.end);
    const newCursor = match.start + item.value.length;
    onValueChange(newValue);
    setMatch(null);
    // React가 새 value를 커밋한 다음 틱에 커서를 옮겨야 위치가 클램프되지 않는다
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(newCursor, newCursor);
    }, 0);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (match && options.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % options.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + options.length) % options.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        applySelection(options[activeIndex]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMatch(null);
        return;
      }
    }
    props.onKeyDown?.(e);
  };

  return (
    <div className="relative">
      <Textarea
        {...props}
        ref={textareaRef}
        value={value}
        onChange={(e) => {
          // 네이티브 input 이벤트 시점엔 DOM의 value/selectionStart가 이미 최신이라
          // React 상태 반영을 기다릴 필요 없이 바로 감지해도 된다
          onValueChange(e.target.value);
          refreshMatch();
        }}
        onKeyDown={onKeyDown}
        onKeyUp={(e) => {
          if (!["ArrowDown", "ArrowUp", "Enter", "Tab", "Escape"].includes(e.key)) refreshMatch();
          props.onKeyUp?.(e);
        }}
        onClick={(e) => {
          refreshMatch();
          props.onClick?.(e);
        }}
        onBlur={(e) => {
          setMatch(null);
          props.onBlur?.(e);
        }}
        className={className}
      />
      {match && options.length > 0 && (
        <div
          className="fixed z-20 max-h-56 w-72 overflow-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
          style={{ top: position.top, left: position.left }}
        >
          {options.map((opt, i) => (
            <button
              key={opt.key}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                applySelection(opt);
              }}
              onMouseEnter={() => setActiveIndex(i)}
              className={`flex w-full flex-col items-start rounded-sm px-2 py-1.5 text-left text-sm ${
                i === activeIndex ? "bg-accent text-accent-foreground" : ""
              }`}
            >
              <span className="truncate font-medium">{opt.label}</span>
              <span className="truncate text-xs text-muted-foreground">{opt.sub}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
