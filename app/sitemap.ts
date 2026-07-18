import type { MetadataRoute } from "next";
import {
  listAllTags,
  listPublicPosts,
  listSeries,
  listSpecialPages,
} from "@/lib/db/queries";
import { SITE_URL } from "@/lib/seo";

const STATIC_ROUTES: Array<{ path: string; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"]; priority: number }> = [
  { path: "/", changeFrequency: "daily", priority: 1 },
  { path: "/posts", changeFrequency: "daily", priority: 0.8 },
  { path: "/tags", changeFrequency: "weekly", priority: 0.5 },
  { path: "/series", changeFrequency: "weekly", priority: 0.5 },
  { path: "/guestbook", changeFrequency: "weekly", priority: 0.3 },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [posts, tags, seriesList, specialPages] = await Promise.all([
    listPublicPosts(),
    listAllTags(),
    listSeries(),
    listSpecialPages(),
  ]);

  const staticEntries: MetadataRoute.Sitemap = STATIC_ROUTES.map((route) => ({
    url: `${SITE_URL}${route.path}`,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));

  const postEntries: MetadataRoute.Sitemap = posts
    .filter((post) => post.slug !== null)
    .map((post) => ({
      url: `${SITE_URL}/${post.slug}`,
      lastModified: post.updatedAt,
      changeFrequency: "monthly",
      priority: 0.7,
    }));

  const tagEntries: MetadataRoute.Sitemap = tags.map((tag) => ({
    url: `${SITE_URL}/tag/${tag.slug}`,
    changeFrequency: "weekly",
    priority: 0.4,
  }));

  const seriesEntries: MetadataRoute.Sitemap = seriesList.map((s) => ({
    url: `${SITE_URL}/series/${s.slug}`,
    changeFrequency: "weekly",
    priority: 0.5,
  }));

  const specialPageEntries: MetadataRoute.Sitemap = specialPages.map((page) => ({
    url: `${SITE_URL}/page/${page.key}`,
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  return [
    ...staticEntries,
    ...postEntries,
    ...tagEntries,
    ...seriesEntries,
    ...specialPageEntries,
  ];
}
