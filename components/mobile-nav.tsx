"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

interface NavLinkItem {
  id: string;
  label: string;
  href: string;
}

/** md 미만 너비에서 헤더 우측 메뉴(nav/검색/관리)를 대체하는 햄버거 드롭다운 */
export function MobileNav({ items }: { items: NavLinkItem[] }) {
  const pathname = usePathname();
  // 경로가 바뀌면 컴포넌트를 새로 마운트해 open 상태를 초기화한다
  // (이펙트에서 setState 하는 대신 key remount로 "렌더 중 상태 조정")
  return <MobileNavPanel key={pathname} items={items} />;
}

function MobileNavPanel({ items }: { items: NavLinkItem[] }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <div className="md:hidden">
      <Button
        variant="ghost"
        size="icon"
        aria-label={open ? "메뉴 닫기" : "메뉴 열기"}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <X className="size-4" /> : <Menu className="size-4" />}
      </Button>

      {open && (
        <div className="absolute inset-x-0 top-full border-b bg-background shadow-sm">
          <nav className="mx-auto flex w-full max-w-5xl flex-col gap-1 px-4 py-3 text-sm">
            {items.map((item) => (
              <Link
                key={item.id}
                href={item.href}
                className="rounded-md px-2 py-2 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                {item.label}
              </Link>
            ))}
            <Link
              href="/search"
              className="rounded-md px-2 py-2 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              검색
            </Link>
            <Link
              href="/admin"
              className="rounded-md px-2 py-2 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              관리
            </Link>
          </nav>
        </div>
      )}
    </div>
  );
}
