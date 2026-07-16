import { SettingsForm } from "@/components/admin/settings-form";
import { getSiteName } from "@/lib/db/queries";

export const metadata = { title: "설정" };

export default async function AdminSettingsPage() {
  const siteName = await getSiteName();
  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">설정</h1>
      <SettingsForm siteName={siteName} />
    </div>
  );
}
