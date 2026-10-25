"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { ImagePlus } from "lucide-react";
import { toast } from "sonner";

interface PostOption {
  title: string;
  slug: string;
}

interface SeriesOption {
  id: number;
  name: string;
  slug: string;
}

interface ImageOption {
  id: number;
  filename: string;
  mimeType: string;
  size: number;
}

interface DirectiveMatch {
  kind: "post" | "series" | "slash" | "image";
  query: string;
  start: number;
  end: number;
  altText?: string;
}

interface Props extends Omit<React.ComponentProps<"textarea">, "value" | "onChange"> {
  value: string;
  onValueChange: (value: string) => void;
  posts: PostOption[];
  series: SeriesOption[];
  images: ImageOption[];
}

interface SuggestionOption {
  key: string;
  label: string;
  sub: string;
  value: string;
  moveCursorOffset?: number;
}

const CALLOUTS: SuggestionOption[] = [
  { key: "note", label: "> [!NOTE]", sub: "노트 콜아웃", value: "> [!NOTE]\n> " },
  { key: "tip", label: "> [!TIP]", sub: "팁 콜아웃", value: "> [!TIP]\n> " },
  { key: "important", label: "> [!IMPORTANT]", sub: "중요 콜아웃", value: "> [!IMPORTANT]\n> " },
  { key: "warning", label: "> [!WARNING]", sub: "경고 콜아웃", value: "> [!WARNING]\n> " },
  { key: "caution", label: "> [!CAUTION]", sub: "주의 콜아웃", value: "> [!CAUTION]\n> " },
  { key: "info", label: "> [!info]", sub: "정보 콜아웃", value: "> [!info]\n> " },
  { key: "danger", label: "> [!danger]", sub: "위험 콜아웃", value: "> [!danger]\n> " },
  { key: "callout", label: "> [!이름]", sub: "이름을 직접 정하는 콜아웃 (예: rocket)", value: "> [!이름] 제목\n> ", moveCursorOffset: 5 },
];

const BLOCK_SYNTAX: SuggestionOption[] = [
  { key: "center", label: "가운데 정렬", sub: '<div align="center"> … </div>', value: '<div align="center">\n\n\n\n</div>', moveCursorOffset: 24 },
  { key: "right", label: "오른쪽 정렬", sub: '<div align="right"> … </div>', value: '<div align="right">\n\n\n\n</div>', moveCursorOffset: 23 },
  { key: "indent", label: "들여쓰기", sub: "&emsp; 두 개가 한 단계 (문단·제목 맨 앞)", value: "&emsp;&emsp;" },
  { key: "fold", label: "접기 영역 지정", sub: '<div data-fold="2"> … </div> (h=2~6, none)', value: '<div data-fold="2">\n\n\n\n</div>', moveCursorOffset: 22 },
  { key: "embed", label: "임베드", sub: "![](주소) 유튜브·X·Instagram·Pinterest·SoundCloud (![|500x300](…)로 크기)", value: "![]()", moveCursorOffset: 4 },
  { key: "video", label: "비디오 파일", sub: "![](영상.mp4)", value: "![]()", moveCursorOffset: 4 },
  { key: "post", label: "글 카드 임베드", sub: "![[슬러그]]", value: "![[]]", moveCursorOffset: 3 },
  { key: "series", label: "시리즈 카드 임베드", sub: "![[series/슬러그]]", value: "![[series/]]", moveCursorOffset: 11 },
  { key: "postlink", label: "글 링크", sub: "[[슬러그|표시할 텍스트]]", value: "[[]]", moveCursorOffset: 2 },
  // 추가 문법(lib/domain/extras.ts)
  { key: "highlight", label: "하이라이트", sub: "==글==", value: "====", moveCursorOffset: 2 },
  { key: "insert", label: "삽입", sub: "++글++ (추가된 글)", value: "++++", moveCursorOffset: 2 },
  { key: "superscript", label: "위첨자", sub: "x^2^ 또는 <sup>", value: "<sup></sup>", moveCursorOffset: 5 },
  { key: "subscript", label: "아래첨자", sub: "<sub>글</sub>", value: "<sub></sub>", moveCursorOffset: 5 },
  { key: "textcolor", label: "글자색", sub: '<span style="color: #dc2626">', value: '<span style="color: #dc2626"></span>', moveCursorOffset: 29 },
  { key: "bgcolor", label: "배경색", sub: '<span style="background-color: #fef08a">', value: '<span style="background-color: #fef08a"></span>', moveCursorOffset: 40 },
  { key: "abbr", label: "약어", sub: '<abbr title="뜻">글</abbr>', value: '<abbr title=""></abbr>', moveCursorOffset: 13 },
  { key: "comment", label: "주석", sub: "%%글%% (독자에게 안 보임)", value: "%%%%", moveCursorOffset: 2 },
  { key: "citation", label: "인용", sub: "[@citekey]", value: "[@]", moveCursorOffset: 2 },
  { key: "footnote-inline", label: "인라인 각주", sub: "^[각주 내용]", value: "^[]", moveCursorOffset: 2 },
  { key: "toc", label: "목차", sub: "[toc]", value: "[toc]", moveCursorOffset: 5 },
  { key: "dl", label: "정의 목록", sub: "용어 다음 줄 : 설명", value: "용어\n: 설명", moveCursorOffset: 2 },
];

const GENERAL_MARKDOWN_SUGGESTIONS: SuggestionOption[] = [
  { key: "h2", label: "H2 Heading", sub: "## 제목", value: "## ", moveCursorOffset: 3 },
  { key: "h3", label: "H3 Heading", sub: "### 제목", value: "### ", moveCursorOffset: 4 },
  { key: "h4", label: "H4 Heading", sub: "#### 제목", value: "#### ", moveCursorOffset: 5 },
  { key: "bullet", label: "Bullet List", sub: "- 항목", value: "- ", moveCursorOffset: 2 },
  { key: "number", label: "Numbered List", sub: "1. 항목", value: "1. ", moveCursorOffset: 3 },
  { key: "task", label: "Task List", sub: "- [ ] 할 일", value: "- [ ] ", moveCursorOffset: 6 },
  { key: "quote", label: "Quote", sub: "> 인용구", value: "> ", moveCursorOffset: 2 },
  { key: "code", label: "Code Block", sub: "```javascript ... ```", value: "```javascript\n\n```", moveCursorOffset: 14 },
  { key: "table", label: "Table", sub: "| 표 |", value: "|  |  |\n|---|---|\n|  |  |", moveCursorOffset: 2 },
  { key: "hr", label: "Horizontal Rule", sub: "--- 구분선", value: "---", moveCursorOffset: 3 },
  { key: "inline-math", label: "Inline Math", sub: "$수식$", value: "$ $", moveCursorOffset: 2 },
  { key: "block-math", label: "Block Math", sub: "$$블록 수식$$", value: "$$\n\n$$", moveCursorOffset: 3 },
  ...CALLOUTS,
  ...BLOCK_SYNTAX,
];

/**
 * `![[슬러그` / `[[슬러그` / `![[series/슬러그` / 슬래시(/) / 이미지 주소를 타이핑하는 중일 때
 * 커서 위치에 후보 목록을 띄운다.
 */
function detectDirectiveContext(text: string, cursor: number): DirectiveMatch | null {
  const windowStart = Math.max(0, cursor - 300);
  const before = text.slice(windowStart, cursor);

  // 1. 시리즈 임베드 슬러그 자동완성 (최우선)
  const seriesMatch = /!\[\[series\/([a-z0-9-]*)$/.exec(before);
  if (seriesMatch) {
    const query = seriesMatch[1];
    return { kind: "series", query, start: cursor - query.length, end: cursor };
  }

  // 2. 글 임베드/링크 슬러그 자동완성
  const postMatch = /!?\[\[([a-z0-9-]*)$/.exec(before);
  if (postMatch) {
    const query = postMatch[1];
    return { kind: "post", query, start: cursor - query.length, end: cursor };
  }

  // 3. 슬래시(/) 슬래시 커맨드 자동완성
  const slashMatch = /(?:\n|^|\s)(\/)([a-zA-Z0-9-]*)$/.exec(before);
  if (slashMatch) {
    const slash = slashMatch[1];
    const query = slashMatch[2];
    const prefixLen = slashMatch[0].length - slash.length - query.length;
    const start = windowStart + slashMatch.index + prefixLen;
    return { kind: "slash", query, start, end: cursor };
  }

  // 4. 이미지 마크다운 URL 자동완성
  // ! [ alt ] ( query
  const imageMatch = /!\[([^\]\n]*)\]\(([^)\n]*)$/.exec(before);
  if (imageMatch) {
    const altText = imageMatch[1];
    const query = imageMatch[2];
    const start = cursor - query.length;
    return { kind: "image", query, start, end: cursor, altText };
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
  const q = query.toLowerCase();
  return series.filter((s) => s.slug.includes(q) || s.name.toLowerCase().includes(q)).slice(0, 8);
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)}MB`;
}

function filterImages(images: ImageOption[], query: string): ImageOption[] {
  const q = query.toLowerCase();
  return images
    .filter((img) => {
      const path = `/images/${img.id}/${img.filename}`;
      return img.filename.toLowerCase().includes(q) || path.toLowerCase().includes(q);
    })
    .sort((a, b) => {
      const aPath = `/images/${a.id}/${a.filename}`;
      const bPath = `/images/${b.id}/${b.filename}`;
      const aMatch = a.filename.toLowerCase().startsWith(q) || aPath.toLowerCase().startsWith(q);
      const bMatch = b.filename.toLowerCase().startsWith(q) || bPath.toLowerCase().startsWith(q);
      return Number(bMatch) - Number(aMatch);
    })
    .slice(0, 8);
}

function filterSuggestions(options: SuggestionOption[], query: string): OptionItem[] {
  const q = query.toLowerCase();
  return options
    .filter((opt) => opt.key.includes(q) || opt.label.toLowerCase().includes(q) || opt.sub.toLowerCase().includes(q))
    .map((opt) => ({
      key: opt.key,
      label: opt.label,
      sub: opt.sub,
      value: opt.value,
      moveCursorOffset: opt.moveCursorOffset,
    }))
    .slice(0, 8);
}

interface OptionItem {
  key: string;
  label: string;
  sub: string;
  value: string;
  moveCursorOffset?: number;
  thumbnail?: string;
}

function computeOptions(
  next: DirectiveMatch | null,
  posts: PostOption[],
  series: SeriesOption[],
  images: ImageOption[],
): OptionItem[] {
  if (next === null) return [];
  if (next.kind === "post") {
    return filterPosts(posts, next.query).map((p) => ({
      key: p.slug,
      label: p.title,
      sub: p.slug,
      value: p.slug,
    }));
  }
  if (next.kind === "series") {
    return filterSeries(series, next.query).map((s) => ({
      key: s.slug,
      label: s.name,
      sub: s.slug,
      value: s.slug,
    }));
  }
  if (next.kind === "image") {
    return filterImages(images, next.query).map((img) => ({
      key: `${img.id}-${img.filename}`,
      label: img.filename,
      sub: `${formatSize(img.size)} (${img.mimeType})`,
      value: `/images/${img.id}/${img.filename}`,
      thumbnail: `/images/${img.id}/${img.filename}`,
    }));
  }
  if (next.kind === "slash") {
    return filterSuggestions(GENERAL_MARKDOWN_SUGGESTIONS, next.query);
  }
  return [];
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
  images,
  className,
  ...props
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const [match, setMatch] = useState<DirectiveMatch | null>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [activeIndex, setActiveIndex] = useState(0);
  const [isDragActive, setIsDragActive] = useState(false);
  const dragCounter = useRef(0);
  const [uploading, setUploading] = useState(false);

  const uploadFile = async (file: File) => {
    setUploading(true);
    const toastId = toast.loading("이미지를 업로드하는 중...");
    try {
      const formData = new FormData();
      formData.set("file", file);
      const res = await fetch("/api/images", { method: "POST", body: formData });
      const body = await res.json();
      if (!res.ok || !body.markdown) {
        toast.error(body.error ?? "업로드에 실패했습니다.", { id: toastId });
        return;
      }

      const el = textareaRef.current;
      if (el) {
        const start = el.selectionStart ?? value.length;
        const end = el.selectionEnd ?? start;
        const hasPrevNewline = start === 0 || value[start - 1] === "\n";
        const hasNextNewline = end === value.length || value[end] === "\n";
        const prefix = hasPrevNewline ? "" : "\n";
        const suffix = hasNextNewline ? "" : "\n";
        const insertText = `${prefix}${body.markdown}${suffix}`;

        const newValue = value.slice(0, start) + insertText + value.slice(end);
        onValueChange(newValue);
        const newCursor = start + insertText.length;
        setTimeout(() => {
          el.focus();
          el.setSelectionRange(newCursor, newCursor);
        }, 0);
      }
      toast.success("이미지를 본문에 삽입했습니다.", { id: toastId });
    } catch {
      toast.error("업로드 중 네트워크 오류가 발생했습니다.", { id: toastId });
    } finally {
      setUploading(false);
    }
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragActive(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current <= 0) {
      setIsDragActive(false);
      dragCounter.current = 0;
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    dragCounter.current = 0;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files);
      const imageFiles = files.filter((f) => f.type.startsWith("image/"));
      if (imageFiles.length > 0) {
        for (const file of imageFiles) {
          await uploadFile(file);
        }
      }
    }
  };

  const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (e.clipboardData && e.clipboardData.files && e.clipboardData.files.length > 0) {
      const files = Array.from(e.clipboardData.files);
      const imageFiles = files.filter((f) => f.type.startsWith("image/"));
      if (imageFiles.length > 0) {
        e.preventDefault();
        for (const file of imageFiles) {
          await uploadFile(file);
        }
      }
    }
  };

  const options = computeOptions(match, posts, series, images);

  /** match는 그대로 두고 화면상 위치만 다시 계산 — 스크롤/리사이즈 시 재사용 */
  const updatePositionFor = useCallback(
    (next: DirectiveMatch) => {
      const el = textareaRef.current;
      if (!el) return;
      const nextOptions = computeOptions(next, posts, series, images);
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
    [posts, series, images],
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
    const onScroll = (e: Event) => {
      if (dropdownRef.current && e.target === dropdownRef.current) return;
      setMatch(null);
    };
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [match]);

  // 화살표 키로 항목 이동할 때 해당 항목이 스크롤 영역 밖으로 나가면 영역 내로 스크롤
  useEffect(() => {
    if (!match || !dropdownRef.current) return;
    const container = dropdownRef.current;
    const activeEl = container.children[activeIndex] as HTMLElement | undefined;
    if (activeEl) {
      const containerTop = container.scrollTop;
      const containerBottom = containerTop + container.clientHeight;
      const elemTop = activeEl.offsetTop;
      const elemBottom = elemTop + activeEl.offsetHeight;

      if (elemTop < containerTop) {
        container.scrollTop = elemTop;
      } else if (elemBottom > containerBottom) {
        container.scrollTop = elemBottom - container.clientHeight;
      }
    }
  }, [activeIndex, match]);

  const applySelection = (item: OptionItem) => {
    const el = textareaRef.current;
    if (!el || !match) return;
    // 글·시리즈 슬러그는 닫는 ]]까지 채운다(이미 있으면 그대로).
    const closing = (match.kind === "post" || match.kind === "series") && !value.slice(match.end).startsWith("]]") ? "]]" : "";
    const inserted = item.value + closing;
    const newValue = value.slice(0, match.start) + inserted + value.slice(match.end);
    let newCursor = match.start + inserted.length;
    if (item.moveCursorOffset !== undefined) {
      newCursor = match.start + item.moveCursorOffset;
    } else if (closing === "" && (match.kind === "post" || match.kind === "series")) {
      newCursor = match.start + inserted.length + 2;
    }
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
    <div
      className="relative"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
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
        onPaste={handlePaste}
        className={className}
      />
      {isDragActive && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center rounded-md border-2 border-dashed border-primary bg-background/80 backdrop-blur-sm pointer-events-none">
          <ImagePlus className="mb-2 size-8 animate-bounce text-primary" />
          <span className="text-sm font-medium">여기에 이미지 파일을 드롭하여 업로드</span>
        </div>
      )}
      {match && options.length > 0 && (
        <div
          ref={dropdownRef}
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
              className={`flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm ${
                i === activeIndex ? "bg-accent text-accent-foreground" : ""
              }`}
            >
              {opt.thumbnail && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={opt.thumbnail}
                  alt=""
                  loading="lazy"
                  className="size-8 rounded border object-cover bg-muted flex-shrink-0"
                />
              )}
              <div className="flex flex-col min-w-0 flex-1">
                <span className="truncate font-medium">{opt.label}</span>
                <span className="truncate text-xs text-muted-foreground">{opt.sub}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
