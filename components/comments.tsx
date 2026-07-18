"use client";

import Giscus from "@giscus/react";
import { useTheme } from "next-themes";
import type { GiscusConfig } from "@/lib/db/queries";

interface CommentsProps {
  config: GiscusConfig;
  /**
   * 포스트 댓글은 pathname 매핑(글 URL별 스레드),
   * 방명록은 specific 매핑(고정 스레드 하나)을 사용한다.
   */
  mapping: { type: "pathname" } | { type: "specific"; term: string };
}

export function Comments({ config, mapping }: CommentsProps) {
  const { resolvedTheme } = useTheme();

  return (
    <Giscus
      repo={config.repo as `${string}/${string}`}
      repoId={config.repoId}
      category={config.category}
      categoryId={config.categoryId}
      mapping={mapping.type}
      term={mapping.type === "specific" ? mapping.term : undefined}
      strict="0"
      reactionsEnabled="1"
      emitMetadata="0"
      inputPosition="top"
      theme={resolvedTheme === "dark" ? "dark" : "light"}
      lang="ko"
      loading="lazy"
    />
  );
}
