import { describe, expect, it } from "vitest";
import {
  extractPostEmbedRequests,
  hydratePostEmbedParts,
  splitPostEmbedParts,
} from "./post-embeds";

describe("post embeds", () => {
  it("placeholder에서 조회 대상 slug/id를 추출한다", () => {
    const html = [
      '<p>앞</p>',
      '<div class="md-embed md-embed-post" data-embed="post" data-post-slug="hello-world"></div>',
      '<div class="md-embed md-embed-series" data-embed="series" data-series-id="3"></div>',
      '<div class="md-embed md-embed-post" data-embed="post" data-post-slug="hello-world"></div>',
    ].join("");

    const result = extractPostEmbedRequests(splitPostEmbedParts(html));
    expect(result.postSlugs).toEqual(["hello-world"]);
    expect(result.seriesIds).toEqual([3]);
  });

  it("placeholder를 포스트 카드/시리즈 카드 파트로 치환한다", () => {
    const html = [
      '<div class="md-embed md-embed-post" data-embed="post" data-post-slug="hello-world"></div>',
      '<div class="md-embed md-embed-series" data-embed="series" data-series-id="7"></div>',
    ].join("");

    const hydrated = hydratePostEmbedParts(splitPostEmbedParts(html), {
      postCards: [{ slug: "hello-world", title: "Hello", summary: "요약" }],
      seriesCards: [
        {
          id: 7,
          name: "시리즈 A",
          description: "설명",
          isCompleted: false,
          posts: [
            { postId: 1, slug: "hello-world", title: "Hello" },
            { postId: 2, slug: "post-2", title: "Post 2" },
          ],
        },
      ],
    });

    expect(hydrated[0]).toEqual({
      kind: "post-card",
      card: { slug: "hello-world", title: "Hello", summary: "요약" },
    });
    expect(hydrated[1]).toMatchObject({
      kind: "series-card",
      series: { id: 7, name: "시리즈 A", posts: [{ postId: 1 }, { postId: 2 }] },
    });
  });

  it("존재하지 않는 대상은 에러 문구로 대체한다", () => {
    const html = [
      '<div data-embed="post" data-post-slug="missing"></div>',
      '<div data-embed="series" data-series-id="9"></div>',
    ].join("");

    const hydrated = hydratePostEmbedParts(splitPostEmbedParts(html), {
      postCards: [],
      seriesCards: [],
    });
    expect(hydrated[0]).toMatchObject({ kind: "error", message: expect.stringContaining("찾을 수 없는 포스트") });
    expect(hydrated[1]).toMatchObject({ kind: "error", message: expect.stringContaining("찾을 수 없는 시리즈") });
  });
});
