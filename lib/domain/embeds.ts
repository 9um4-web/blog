import { type EmbedProvider, type EmbedTarget, embedSource } from "@gogum4/editor-schema/embed";

/** 외부 임베드(`![](주소)`)와 비디오 파일(`![](파일.mp4)`)의 hast 조각. 주소는 항상 @gogum4/editor-schema의 허용 목록을 거친 것만 iframe이 된다. */

export interface EmbedData {
  hName: string;
  hProperties: Record<string, unknown>;
  hChildren: unknown[];
}

/** 공급자별 기본 크기와 iframe 속성(블로그 위젯 CSS `.embed-widget`과 짝이다). */
const PROVIDER_LOOK: Record<EmbedProvider, { width: string; height?: string; aspect?: string; title: string; iframe: Record<string, unknown> }> = {
  youtube: {
    width: "100%",
    aspect: "16 / 9",
    title: "YouTube video",
    iframe: {
      allow: "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share",
      referrerPolicy: "strict-origin-when-cross-origin",
      allowFullScreen: true,
      loading: "lazy",
    },
  },
  x: {
    width: "100%",
    height: "450px",
    title: "X post",
    iframe: { referrerPolicy: "strict-origin-when-cross-origin", allowFullScreen: true, loading: "lazy", style: "width: 100%; height: 100%; border: none;" },
  },
  soundcloud: {
    width: "100%",
    height: "166px",
    title: "SoundCloud player",
    iframe: { scrolling: "no", frameBorder: "no", style: "width: 100%; height: 100%; border: none;" },
  },
  instagram: {
    width: "100%",
    height: "600px",
    title: "Instagram post",
    iframe: {
      frameBorder: "0",
      scrolling: "no",
      allowTransparency: true,
      style: "width: 100%; height: 100%; border: 1px solid var(--border); border-radius: calc(var(--radius) + 2px);",
    },
  },
  pinterest: {
    width: "345px",
    height: "500px",
    title: "Pinterest pin",
    iframe: { frameBorder: "0", scrolling: "no", style: "width: 100%; height: 100%; border: none;" },
  },
};

const SOUNDCLOUD_LOOK = "&color=%23ff5500&auto_play=false&hide_related=false&show_comments=true&show_user=true&show_reposts=false&show_teaser=true";

function style(look: { width: string; height?: string; aspect?: string }, width?: number, height?: number): string {
  const styles = [`width: ${width !== undefined ? `${width}px` : look.width}`];
  if (height !== undefined) {
    styles.push(`height: ${height}px`);
    if (look.aspect) styles.push("aspect-ratio: auto");
  } else if (look.height) {
    styles.push(`height: ${look.height}`);
  } else if (look.aspect) {
    styles.push(`aspect-ratio: ${look.aspect}`);
  }
  return styles.join("; ");
}

/** 지원하는 공급자의 임베드. 허용한 출처의 iframe 주소를 못 만들면 null. */
export function externalEmbed(target: EmbedTarget, width?: number, height?: number): EmbedData | null {
  const src = embedSource(target);
  if (src === null) return null;
  const look = PROVIDER_LOOK[target.provider];
  return {
    hName: "div",
    hProperties: {
      className: ["embed-widget", target.provider === "youtube" ? "video-embed" : `${target.provider}-embed`],
      "data-embed-type": target.provider,
      "data-src": target.url,
      style: style(look, width, height),
    },
    hChildren: [
      {
        type: "element",
        tagName: "iframe",
        properties: { src: target.provider === "soundcloud" ? `${src}${SOUNDCLOUD_LOOK}` : src, title: look.title, ...look.iframe },
        children: [],
      },
    ],
  };
}

const VIDEO_FILE = /\.(mp4|webm|ogv|mov|m4v)(?:[?#].*)?$/i;

export function isVideoFileUrl(url: string): boolean {
  return VIDEO_FILE.test(url.trim());
}

/** 비디오 파일 임베드(`![](영상.mp4)`). 주소 스킴 검사는 파이프라인 끝의 rehypeSanitizeUrls가 한다. */
export function videoFileEmbed(url: string, width?: number, height?: number): EmbedData {
  return {
    hName: "div",
    hProperties: {
      className: ["embed-widget", "video-file-embed"],
      "data-embed-type": "video",
      "data-src": url,
      style: style({ width: "100%", aspect: "16 / 9" }, width, height),
    },
    hChildren: [
      {
        type: "element",
        tagName: "video",
        properties: {
          src: url,
          controls: true,
          style: "width: 100%; height: 100%; border-radius: calc(var(--radius) + 2px); border: 1px solid var(--border);",
        },
        children: [],
      },
    ],
  };
}
