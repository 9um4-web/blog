import { SettingsForm } from "@/components/admin/settings-form";
import { getSiteSettings } from "@/lib/db/queries";

export const metadata = { title: "설정" };

export default async function AdminSettingsPage() {
  const { siteName, siteEmail, showSummaryOnPost, social, giscus, siteFont, timeZone } =
    await getSiteSettings();
  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">설정</h1>
      <SettingsForm
        siteName={siteName}
        siteEmail={siteEmail}
        showSummary={showSummaryOnPost}
        social={social}
        giscus={giscus}
        siteFont={siteFont}
        timeZone={timeZone}
      />
    </div>
  );
}
