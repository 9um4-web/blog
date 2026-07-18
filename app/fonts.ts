import { Geist, Geist_Mono, Nanum_Gothic, Noto_Sans_KR } from "next/font/google";
import localFont from "next/font/local";

/**
 * 사이트 글꼴 후보. 전부 CSS 변수로만 선언하고(preload 없음),
 * 실제 다운로드는 [data-font=…]가 해당 변수를 참조할 때만 일어난다.
 * 선택은 setting 테이블의 site_font 값 → <html data-font=…> → globals.css 매핑.
 */

export const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const pretendard = localFont({
  src: "../node_modules/pretendard/dist/web/variable/woff2/PretendardVariable.woff2",
  variable: "--font-pretendard",
  weight: "45 920",
  preload: false,
});

export const notoSansKr = Noto_Sans_KR({
  variable: "--font-noto-sans-kr",
  subsets: ["latin"],
  preload: false,
});

export const nanumGothic = Nanum_Gothic({
  variable: "--font-nanum-gothic",
  weight: ["400", "700", "800"],
  subsets: ["latin"],
  preload: false,
});

/** html에 항상 붙이는 변수 클래스 묶음 */
export const fontVariableClasses = [
  geistSans.variable,
  geistMono.variable,
  pretendard.variable,
  notoSansKr.variable,
  nanumGothic.variable,
].join(" ");
