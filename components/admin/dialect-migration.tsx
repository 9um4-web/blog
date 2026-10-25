"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { applyDialectMigration, type MigrationPreviewRow } from "@/lib/actions/migrate-dialect";

export function DialectMigration({ rows }: { rows: MigrationPreviewRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const changed = rows.filter((row) => row.changed);

  const apply = () => {
    if (!window.confirm(`${changed.length}개 글을 새 문법으로 저장합니다. 원본 백업을 받아 두셨나요?`)) return;
    startTransition(async () => {
      const result = await applyDialectMigration();
      if (result.ok) {
        toast.success(`${result.updated}개 글을 변환했습니다.`);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" asChild>
          <a href="/admin/migrate-dialect/backup" download>
            1. 원본 백업 받기 (JSON)
          </a>
        </Button>
        <Button onClick={apply} disabled={pending || changed.length === 0}>
          2. 변환 적용 ({changed.length}개)
        </Button>
        <span className="text-sm text-muted-foreground">
          전체 {rows.length}개 중 변환할 글 {changed.length}개
        </span>
      </div>

      {rows.map((row) => (
        <details key={row.id} className="rounded-lg border p-3" open={row.notices.length > 0}>
          <summary className="cursor-pointer text-sm">
            <span className="font-medium">{row.title}</span>
            <span className="ml-2 text-muted-foreground">
              #{row.id} · {row.changed ? "변환됨" : "그대로"}
              {row.notices.length > 0 ? ` · 확인 ${row.notices.length}건` : ""}
            </span>
          </summary>
          {row.notices.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-700 dark:text-amber-400">
              {row.notices.map((notice) => (
                <li key={notice}>{notice}</li>
              ))}
            </ul>
          )}
          {row.changed && (
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <pre className="overflow-auto rounded bg-muted p-2 text-xs whitespace-pre-wrap">{row.before}</pre>
              <pre className="overflow-auto rounded bg-muted p-2 text-xs whitespace-pre-wrap">{row.after}</pre>
            </div>
          )}
        </details>
      ))}
    </div>
  );
}
