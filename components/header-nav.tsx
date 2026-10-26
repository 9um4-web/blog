"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

interface HeaderNavItem {
  id: string;
  label: string;
  href: string;
}

/** 헤더 평평한 링크 나열. 현재 경로와 일치하는(하위 경로 포함) 항목은 칩으로 강조 */
export function HeaderNav({ items }: { items: HeaderNavItem[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="주 메뉴" className="hidden items-center gap-1 font-mono text-[13px] md:flex">
      {items.map((item) => {
        const active =
          item.href === "/" ? pathname === "/" : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.id}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-1.5 transition-colors",
              active
                ? "bg-card text-foreground ring-1 ring-border"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
