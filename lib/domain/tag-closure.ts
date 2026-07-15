/**
 * TagClosure 순수 검증/계산 로직 (스펙 5장).
 * SQL 실행은 lib/actions 쪽에서 담당하고, 여기는 규칙 판정만 한다.
 */

export interface ClosureRow {
  ancestorId: number;
  descendantId: number;
  depth: number;
}

/** 신규 태그 삽입 시 추가할 closure 행: self(depth 0) + 부모의 조상 체인 각각 +1. */
export function closureRowsForNewTag(
  tagId: number,
  parentAncestors: ReadonlyArray<{ ancestorId: number; depth: number }>,
): ClosureRow[] {
  return [
    { ancestorId: tagId, descendantId: tagId, depth: 0 },
    ...parentAncestors.map((a) => ({
      ancestorId: a.ancestorId,
      descendantId: tagId,
      depth: a.depth + 1,
    })),
  ];
}

/**
 * 재부모화 순환 검사 (스펙 5장): 새 parent가 자기 자신이거나 자신의 자손이면 순환.
 * descendantIds에는 TagClosure에서 조회한 tagId의 자손 집합(자신 제외)을 넘긴다.
 */
export function wouldCreateCycle(
  tagId: number,
  newParentId: number | null,
  descendantIds: ReadonlySet<number>,
): boolean {
  if (newParentId === null) return false;
  return newParentId === tagId || descendantIds.has(newParentId);
}

/** 태그 삭제 가능 여부 (스펙 5장): depth=1 자식이 하나라도 있으면 삭제 금지. */
export function canDeleteTag(childCount: number): boolean {
  return childCount === 0;
}

/**
 * 서브트리 이동 시 새로 만들 closure 행:
 * (새 부모의 조상 체인 + 새 부모 자신) × (서브트리의 각 노드) 조합.
 * subtreeRows는 이동 대상 태그를 ancestor로 하는 closure 행들(self 포함).
 */
export function closureRowsForReparent(
  newParentAncestors: ReadonlyArray<{ ancestorId: number; depth: number }>,
  subtreeRows: ReadonlyArray<{ descendantId: number; depth: number }>,
): ClosureRow[] {
  const rows: ClosureRow[] = [];
  for (const anc of newParentAncestors) {
    for (const sub of subtreeRows) {
      rows.push({
        ancestorId: anc.ancestorId,
        descendantId: sub.descendantId,
        depth: anc.depth + 1 + sub.depth,
      });
    }
  }
  return rows;
}
