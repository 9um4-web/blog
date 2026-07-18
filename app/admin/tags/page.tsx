import { TagsManager } from "@/components/admin/tags-manager";
import { listAllTags } from "@/lib/db/queries";

export const metadata = { title: "태그 관리" };

export default async function AdminTagsPage() {
  const tags = await listAllTags();
  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">태그</h1>
      <TagsManager tags={tags} />
    </div>
  );
}
