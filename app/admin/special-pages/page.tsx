import { SpecialPagesManager } from "@/components/admin/special-pages-manager";
import { listPostsForAdmin, listSpecialPages } from "@/lib/db/queries";

export const metadata = { title: "특수 페이지 관리" };

export default async function AdminSpecialPagesPage() {
  const [pages, allPosts] = await Promise.all([listSpecialPages(), listPostsForAdmin()]);
  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">특수 페이지</h1>
      <SpecialPagesManager
        pages={pages}
        allPosts={allPosts.map((p) => ({ id: p.id, title: p.title }))}
      />
    </div>
  );
}
