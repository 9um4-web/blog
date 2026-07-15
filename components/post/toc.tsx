"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import type { HeadingNode } from "@/lib/domain/markdown";
import { cn } from "@/lib/utils";

interface TocProps {
  tree: HeadingNode[];
  onNavigate: (id: string) => void;
}

/**
 * 좌측 목차 (스펙 4.1 / 확정 3):
 * heading_tree JSON을 그대로 렌더하고, 목차 자체의 접기 상태는
 * 본문 섹션 접기 상태와 독립적으로 관리한다.
 */
export function Toc({ tree, onNavigate }: TocProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const renderNodes = (nodes: HeadingNode[], depth: number) => (
    <ul className={cn("space-y-0.5", depth > 0 && "ml-3 border-l pl-2")}>
      {nodes.map((node) => {
        const isCollapsed = collapsed.has(node.id);
        return (
          <li key={node.id}>
            <div className="flex items-start gap-0.5">
              {node.children.length > 0 ? (
                <button
                  type="button"
                  aria-label={isCollapsed ? "펼치기" : "접기"}
                  onClick={() => toggle(node.id)}
                  className="mt-0.5 shrink-0 rounded p-0.5 text-muted-foreground hover:bg-accent"
                >
                  {isCollapsed ? (
                    <ChevronRight className="size-3.5" />
                  ) : (
                    <ChevronDown className="size-3.5" />
                  )}
                </button>
              ) : (
                <span className="w-[1.125rem] shrink-0" />
              )}
              <button
                type="button"
                onClick={() => onNavigate(node.id)}
                className="min-w-0 flex-1 truncate rounded px-1 py-0.5 text-left text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
                title={node.text}
              >
                {node.text}
              </button>
            </div>
            {node.children.length > 0 && !isCollapsed && renderNodes(node.children, depth + 1)}
          </li>
        );
      })}
    </ul>
  );

  return (
    <nav aria-label="목차">
      <p className="mb-2 px-1 text-xs font-semibold tracking-wide text-muted-foreground">목차</p>
      {renderNodes(tree, 0)}
    </nav>
  );
}
