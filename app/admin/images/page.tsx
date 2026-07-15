import { ImagesManager } from "@/components/admin/images-manager";
import { listImagesForAdmin } from "@/lib/db/queries";

export const metadata = { title: "이미지 관리" };

export default async function AdminImagesPage() {
  const images = await listImagesForAdmin();
  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">이미지</h1>
      <ImagesManager images={images} />
    </div>
  );
}
