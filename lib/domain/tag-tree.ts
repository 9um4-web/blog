/** 태그 행(parent_tag_id 기반)을 화면용 트리로 조립하는 순수 함수 */

export interface TagRow {
  id: number;
  parentTagId: number | null;
  name: string;
}

export interface TagTreeNode<T extends TagRow = TagRow> {
  tag: T;
  children: TagTreeNode<T>[];
}

export function buildTagTree<T extends TagRow>(rows: T[]): TagTreeNode<T>[] {
  const nodes = new Map<number, TagTreeNode<T>>();
  for (const row of rows) nodes.set(row.id, { tag: row, children: [] });

  const roots: TagTreeNode<T>[] = [];
  for (const node of nodes.values()) {
    const parent = node.tag.parentTagId !== null ? nodes.get(node.tag.parentTagId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  const byName = (a: TagTreeNode<T>, b: TagTreeNode<T>) =>
    a.tag.name.localeCompare(b.tag.name, "ko");
  const sortRec = (list: TagTreeNode<T>[]) => {
    list.sort(byName);
    for (const n of list) sortRec(n.children);
  };
  sortRec(roots);
  return roots;
}
