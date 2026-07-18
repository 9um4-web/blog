import { NavManager } from "@/components/admin/nav-manager";
import { getNavItems } from "@/lib/db/queries";

export const metadata = { title: "메뉴 관리" };

export default async function AdminNavigationPage() {
  const items = await getNavItems();
  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold">헤더 메뉴</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        기본 페이지(글 목록/태그/시리즈/방명록)와 시리즈를 한 목록에서 켜고 끄고
        순서를 정할 수 있습니다. 여기서 켠 항목만 헤더에 평범한 링크로 나란히
        표시됩니다.
      </p>
      <NavManager items={items} />
    </div>
  );
}
