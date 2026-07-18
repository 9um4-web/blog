import { Comments } from "@/components/comments";
import { getSiteSettings } from "@/lib/db/queries";

export const metadata = { title: "방명록" };

/** 방명록: 포스트와 무관한 고정 스레드 하나에 붙는 Giscus (specific 매핑) */
export default async function GuestbookPage() {
  const { giscus } = await getSiteSettings();

  return (
    <div className="mx-auto w-full max-w-3xl px-4">
      <h1 className="mb-2 text-2xl font-bold">방명록</h1>
      <p className="mb-8 text-sm text-muted-foreground">
        GitHub 계정으로 로그인해서 자유롭게 인사를 남겨주세요.
      </p>
      {giscus ? (
        <Comments config={giscus} mapping={{ type: "specific", term: "guestbook" }} />
      ) : (
        <p className="text-sm text-muted-foreground">
          아직 방명록이 설정되지 않았습니다.
        </p>
      )}
    </div>
  );
}
