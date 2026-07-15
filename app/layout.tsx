import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// DB 기반 콘텐츠라 빌드 시점 프리렌더 대신 요청 시점 렌더링 사용
// (Docker 빌드 단계에 DB가 없어도 되도록)
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: {
    default: "Blog",
    template: "%s | Blog",
  },
  description: "개인 블로그",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
          <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-6 px-4">
            <Link href="/" className="font-semibold">
              Blog
            </Link>
            <nav className="flex items-center gap-4 text-sm text-muted-foreground">
              <Link href="/posts" className="hover:text-foreground">
                글 목록
              </Link>
              <Link href="/tags" className="hover:text-foreground">
                태그
              </Link>
              <Link href="/series" className="hover:text-foreground">
                시리즈
              </Link>
            </nav>
            <div className="ml-auto flex items-center gap-4">
              <form action="/search" className="hidden sm:block">
                <input
                  type="search"
                  name="q"
                  placeholder="검색"
                  className="h-8 w-36 rounded-md border bg-transparent px-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
              </form>
              <Link
                href="/search"
                className="text-sm text-muted-foreground hover:text-foreground sm:hidden"
              >
                검색
              </Link>
              <Link
                href="/admin"
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                관리
              </Link>
            </div>
          </div>
        </header>
        <main className="flex-1 py-8">{children}</main>
        <Toaster />
      </body>
    </html>
  );
}
