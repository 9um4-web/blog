import Link from "next/link";
import { listRootTags, listTagsByRoot } from "@/lib/db/queries";
import { buildTagTree, type TagTreeNode, type TagRow } from "@/lib/domain/tag-tree";

export const metadata = { title: "태그" };

function TagTreeList({ nodes }: { nodes: TagTreeNode<TagRow>[] }) {
  return (
    <ul className="space-y-1">
      {nodes.map((node) => (
        <li key={node.tag.id}>
          <Link
            href={`/tag/${node.tag.slug}`}
            className="text-sm text-muted-foreground hover:text-foreground hover:underline"
          >
            {node.tag.name}
          </Link>
          {node.children.length > 0 && (
            <div className="ml-4 mt-1 border-l pl-3">
              <TagTreeList nodes={node.children} />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

export default async function TagsPage() {
  const rootTags = await listRootTags();

  return (
    <div className="mx-auto w-full max-w-3xl px-4">
      <h1 className="mb-6 text-2xl font-bold">태그</h1>
      {rootTags.length === 0 && (
        <p className="text-sm text-muted-foreground">아직 태그가 없습니다.</p>
      )}
      <div className="space-y-8">
        {rootTags.map(async (root) => {
          const childRows = await listTagsByRoot(root.id);
          const tree = buildTagTree(childRows);
          return (
            <section key={root.id}>
              <h2 className="mb-3 text-lg font-semibold">{root.name}</h2>
              {tree.length > 0 ? (
                <TagTreeList nodes={tree} />
              ) : (
                <p className="text-sm text-muted-foreground">비어 있음</p>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
