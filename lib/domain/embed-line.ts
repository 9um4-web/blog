import { detectEmbed } from "@gogum4/editor-schema/embed";
import { isVideoFileUrl } from "./embeds";

/** 본문 한 줄이 임베드(`![|500x300](주소)`)일 수 있는 모양. 주소가 임베드인지는 isEmbedUrl로 따로 본다. */
export const EMBED_LINE = /^(\s*)!\[([^\]]*)\]\(([^)\s]+)\)\s*$/;

/** 임베드 크기(px)의 범위 — @gogum4/editor-schema의 규칙(100~2000)과 같다. */
export const EMBED_MIN_PX = 100;
export const EMBED_MAX_PX = 2000;

export function isEmbedUrl(url: string): boolean {
  return detectEmbed(url) !== null || isVideoFileUrl(url);
}

/** 가로를 바꿀 때 세로를 지워야 하는(가로세로 비율이 정해진) 임베드: 유튜브와 비디오 파일. */
export function isRatioEmbedUrl(url: string): boolean {
  return detectEmbed(url)?.provider === "youtube" || isVideoFileUrl(url);
}
