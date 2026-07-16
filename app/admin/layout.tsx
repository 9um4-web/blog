import Link from "next/link";
import { logout } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";

const NAV = [
  { href: "/admin/posts", label: "포스트" },
  { href: "/admin/tags", label: "태그" },
  { href: "/admin/series", label: "시리즈" },
  { href: "/admin/special-pages", label: "특수 페이지" },
  { href: "/admin/images", label: "이미지" },
  { href: "/admin/settings", label: "설정" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-6xl gap-8 px-4">
      <aside className="w-40 shrink-0">
        <nav className="sticky top-20 flex flex-col gap-1">
          <p className="mb-1 px-2 text-xs font-semibold text-muted-foreground">관리</p>
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded px-2 py-1.5 text-sm hover:bg-accent"
            >
              {item.label}
            </Link>
          ))}
          <form action={logout} className="mt-4 px-2">
            <Button type="submit" variant="outline" size="sm" className="w-full">
              로그아웃
            </Button>
          </form>
        </nav>
      </aside>
      <div className="min-w-0 flex-1 pb-24">{children}</div>
    </div>
  );
}
