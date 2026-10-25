import { DialectMigration } from "@/components/admin/dialect-migration";
import { previewDialectMigration } from "@/lib/actions/migrate-dialect";

export const metadata = { title: "방언 변환" };

export default async function AdminMigrateDialectPage() {
  const rows = await previewDialectMigration();
  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold">글 문법 변환</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        예전 문법(<code>::youtube[…]</code>, <code>:::note</code>, <code>::post{"{slug=…}"}</code> 등)으로 쓴 글을 Obsidian 호환
        문법(<code>![](주소)</code>, <code>&gt; [!note]</code>, <code>![[슬러그]]</code> 등)으로 한 번 옮깁니다. 아래는 저장하지 않은 미리보기입니다.
        적용 전에 원본 백업을 받아 두세요.
      </p>
      <DialectMigration rows={rows} />
    </div>
  );
}
