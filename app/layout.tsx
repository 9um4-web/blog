import type { Metadata } from "next";
import { ThemeProvider } from "next-themes";
import Link from "next/link";
import { fontVariableClasses } from "@/app/fonts";
import { SOCIAL_PLATFORMS } from "@/components/social-icons";
import { ThemeToggle } from "@/components/theme-toggle";
import { Toaster } from "@/components/ui/sonner";
import { getSiteName, getSiteSettings } from "@/lib/db/queries";
import "./globals.css";

// DB 기반 콘텐츠라 빌드 시점 프리렌더 대신 요청 시점 렌더링 사용
// (Docker 빌드 단계에 DB가 없어도 되도록)
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const siteName = await getSiteName();
  return {
    title: {
      default: siteName,
      template: `%s | ${siteName}`,
    },
    description: "개인 블로그",
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { siteName, siteEmail, social, siteFont } = await getSiteSettings();
  const socialLinks = SOCIAL_PLATFORMS.filter(({ key }) => social[key]);

  return (
    <html
      lang="ko"
      suppressHydrationWarning
      data-font={siteFont}
      className={`${fontVariableClasses} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
            <div className="mx-auto flex h-14 w-full max-w-7xl items-center gap-6 px-4">
              <Link href="/" className="font-semibold">
                {siteName}
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
                <Link href="/guestbook" className="hover:text-foreground">
                  방명록
                </Link>
              </nav>
              <div className="ml-auto flex items-center gap-2">
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
                <ThemeToggle />
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
          <footer className="border-t">
            <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-4 py-4 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
              <p className="flex items-center gap-3">
                <span>
                  © {new Date().getFullYear()} {siteName}
                </span>
                {siteEmail && (
                  <a href={`mailto:${siteEmail}`} className="hover:text-foreground">
                    {siteEmail}
                  </a>
                )}
              </p>
              <div className="flex items-center gap-4 sm:justify-end">
                <nav className="flex items-center gap-4">
                  <a href="/rss.xml" className="hover:text-foreground">
                    RSS
                  </a>
                  <Link href="/tags" className="hover:text-foreground">
                    태그
                  </Link>
                  <Link href="/series" className="hover:text-foreground">
                    시리즈
                  </Link>
                </nav>
                {socialLinks.length > 0 && (
                  <div className="flex items-center gap-3">
                    {socialLinks.map(({ key, label, Icon }) => (
                      <a
                        key={key}
                        href={social[key] as string}
                        target="_blank"
                        rel="noreferrer noopener"
                        aria-label={label}
                        className="text-muted-foreground transition-colors hover:text-foreground"
                      >
                        <Icon className="size-5" />
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </footer>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
