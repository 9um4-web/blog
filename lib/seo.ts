import type { Metadata } from "next";
import { excerptFromMarkdown } from "@/lib/domain/markdown";

/** 배포 도메인. env로 오버라이드 없으면 운영 도메인으로 폴백 (링크 미리보기/사이트맵의 절대 URL 생성용) */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://blog.9um4.com").replace(
  /\/$/,
  "",
);

interface PostLike {
  title: string;
  summary: string | null;
  contentMd: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 포스트/특수 페이지 공용 메타데이터. summary가 있으면 그대로, 없으면 본문 발췌를
 * og:description/twitter description으로 사용한다 — 디스코드 등 링크 미리보기의
 * 설명 문구는 이 값으로 결정된다.
 * openGraph/twitter는 상위(layout) 메타데이터와 병합되지 않고 통째로 대체되므로
 * (Next 메타데이터 병합 규칙) siteName/locale도 매번 명시한다.
 */
export function postMetadata(post: PostLike, path: string, siteName: string): Metadata {
  const description = post.summary?.trim() || excerptFromMarkdown(post.contentMd);
  const url = `${SITE_URL}${path}`;

  return {
    title: post.title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title: post.title,
      description,
      type: "article",
      url,
      siteName,
      locale: "ko_KR",
      publishedTime: post.createdAt.toISOString(),
      modifiedTime: post.updatedAt.toISOString(),
    },
    twitter: {
      card: "summary",
      title: post.title,
      description,
    },
  };
}
