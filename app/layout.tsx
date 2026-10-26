import type { Metadata } from "next";
import { ThemeProvider } from "@/components/theme-provider";
import Link from "next/link";
import { fontVariableClasses } from "@/app/fonts";
import { HeaderNav } from "@/components/header-nav";
import { MobileNav } from "@/components/mobile-nav";
import { SOCIAL_PLATFORMS } from "@/components/social-icons";
import { ThemeToggle } from "@/components/theme-toggle";
import { Toaster } from "@/components/ui/sonner";
import { getNavItems, getSiteName, getSiteSettings } from "@/lib/db/queries";
import { SITE_URL } from "@/lib/seo";
import "./globals.css";

// DB 기반 콘텐츠라 빌드 시점 프리렌더 대신 요청 시점 렌더링 사용
// (Docker 빌드 단계에 DB가 없어도 되도록)
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const siteName = await getSiteName();
  return {
    metadataBase: new URL(SITE_URL),
    title: {
      default: siteName,
      template: `%s | ${siteName}`,
    },
    description: "개인 블로그",
    openGraph: {
      type: "website",
      siteName,
      locale: "ko_KR",
    },
    twitter: {
      card: "summary",
    },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [{ siteName, siteEmail, social, siteFont }, navItems] = await Promise.all([
    getSiteSettings(),
    getNavItems(),
  ]);
  const socialLinks = SOCIAL_PLATFORMS.filter(({ key }) => social[key]);
  const enabledNavItems = navItems.filter((item) => item.enabled);

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
            <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-6 px-4">
              <Link
                href="/"
                className="flex items-center gap-0.5 font-mono text-[15px] font-bold"
              >
                <span className="text-primary">~/</span>
                {siteName}
                <span
                  aria-hidden="true"
                  className="cursor-blink ml-1.5 inline-block h-4 w-2 bg-primary"
                />
              </Link>
              {/* md 미만에서는 MobileNav의 드롭다운으로 대체 */}
              <HeaderNav items={enabledNavItems} />
              <div className="ml-auto flex items-center gap-2">
                <form action="/search" className="hidden md:block">
                  <label className="flex h-8 w-40 items-center gap-2 rounded-md border bg-card px-2.5 font-mono text-xs focus-within:ring-2 focus-within:ring-ring">
                    <span aria-hidden="true" className="text-primary">
                      $
                    </span>
                    <input
                      type="search"
                      name="q"
                      aria-label="검색"
                      placeholder="검색"
                      className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
                    />
                  </label>
                </form>
                <ThemeToggle />
                <Link
                  href="/admin"
                  className="hidden font-mono text-[13px] text-muted-foreground hover:text-foreground md:inline"
                >
                  관리
                </Link>
                <MobileNav items={enabledNavItems} />
              </div>
            </div>
          </header>
          <main className="flex-1 py-8">{children}</main>
          <footer className="border-t">
            <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 px-4 py-5 font-mono text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
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
