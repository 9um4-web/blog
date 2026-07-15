import { listPublicPosts } from "@/lib/db/queries";

function escapeXml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** RSS 피드. SpecialPage 배정 포스트는 listPublicPosts에서 이미 제외됨 (스펙 8장) */
export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  const posts = await listPublicPosts();

  const items = posts
    .map(
      (p) => `    <item>
      <title>${escapeXml(p.title)}</title>
      <link>${origin}/${p.slug}</link>
      <guid>${origin}/${p.slug}</guid>
      <pubDate>${p.createdAt.toUTCString()}</pubDate>
    </item>`,
    )
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Blog</title>
    <link>${origin}</link>
    <description>개인 블로그</description>
${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
  });
}
