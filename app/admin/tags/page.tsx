import { TagsManager } from "@/components/admin/tags-manager";
import { listAllTags, listNamespaces } from "@/lib/db/queries";

export const metadata = { title: "태그 관리" };

export default async function AdminTagsPage() {
  const [namespaces, tags] = await Promise.all([listNamespaces(), listAllTags()]);
  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">태그</h1>
      <TagsManager namespaces={namespaces} tags={tags} />
    </div>
  );
}
