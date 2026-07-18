import {
  boolean,
  customType,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  unique,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import type { HeadingNode } from "@/lib/domain/markdown";

export const posts = pgTable("post", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  // null이면 title 기반 자동 생성 결과가 저장됨. 커스텀 슬러그도 같은 컬럼 사용 (스펙 2장)
  slug: text("slug").unique(),
  contentMd: text("content_md").notNull().default(""),
  // 목록 카드에 표시할 요약. null이면 본문 앞부분 발췌로 대체
  summary: text("summary"),
  // true면 목록/검색/태그/시리즈/사이트맵/RSS 등 공개 열람 경로에서 제외되고 직접 링크로만 접근 가능
  unlisted: boolean("unlisted").notNull().default(false),
  // 파싱 성공 시에만 갱신 (스펙 3장)
  headingTree: jsonb("heading_tree").$type<HeadingNode[]>(),
  parseError: text("parse_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  parsedAt: timestamp("parsed_at", { withTimezone: true }),
});

export const tags = pgTable(
  "tag",
  {
    id: serial("id").primaryKey(),
    parentTagId: integer("parent_tag_id").references((): AnyPgColumn => tags.id, {
      onDelete: "restrict",
    }),
    name: text("name").notNull(),
    slug: text("slug").unique().notNull(),
  },
  (t) => [
    // 부모가 같은 태그끼리 이름 중복을 막기 위해 NULLS NOT DISTINCT 적용 (루트 태그 포함)
    unique("tag_parent_name_uq")
      .on(t.parentTagId, t.name)
      .nullsNotDistinct(),
  ],
);

export const tagClosure = pgTable(
  "tag_closure",
  {
    ancestorId: integer("ancestor_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
    descendantId: integer("descendant_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
    depth: integer("depth").notNull(), // 0 = self
  },
  (t) => [primaryKey({ columns: [t.ancestorId, t.descendantId] })],
);

export const postTags = pgTable(
  "post_tag",
  {
    postId: integer("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    tagId: integer("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.postId, t.tagId] })],
);

export const series = pgTable("series", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").unique().notNull(),
  description: text("description"),
  isCompleted: boolean("is_completed").notNull().default(false),
});

export const postSeries = pgTable(
  "post_series",
  {
    postId: integer("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    // 시리즈 삭제 시 관계 행만 삭제, Post는 유지 (스펙 6장)
    seriesId: integer("series_id")
      .notNull()
      .references(() => series.id, { onDelete: "cascade" }),
    // fractional order 문자열 정렬 키 (스펙 6장)
    order: text("order").notNull(),
  },
  // PK가 UNIQUE(post_id, series_id) 역할을 겸함
  (t) => [primaryKey({ columns: [t.postId, t.seriesId] })],
);

/** 사이트 전역 설정 (key-value). 현재는 site_name만 사용 */
export const settings = pgTable("setting", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

const bytea = customType<{ data: Buffer }>({
  dataType() {
    return "bytea";
  },
});

export const images = pgTable("image", {
  id: serial("id").primaryKey(),
  // URL 경로에 쓰이므로 업로드 시 안전한 문자로 정규화해서 저장
  filename: text("filename").notNull(),
  mimeType: text("mime_type").notNull(),
  // 스펙의 DB 기반 저장 철학에 맞춰 본문과 동일하게 Postgres에 보관
  // (별도 볼륨 불필요, pg_dump 하나로 백업 일원화)
  data: bytea("data").notNull(),
  size: integer("size").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const specialPages = pgTable("special_page", {
  id: serial("id").primaryKey(),
  // "main", "about" 등. 영문 소문자/하이픈 (스펙 8장)
  key: text("key").notNull().unique(),
  // 슬롯에 배정된 포스트는 슬롯 해제 없이 삭제 불가 (RESTRICT, 스펙 8장)
  postId: integer("post_id")
    .notNull()
    .references(() => posts.id, { onDelete: "restrict" }),
  label: text("label"),
});
