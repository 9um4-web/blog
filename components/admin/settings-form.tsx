"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { updateSiteSettings } from "@/lib/actions/settings";
import { SOCIAL_PLATFORMS, type SocialKey } from "@/components/social-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export function SettingsForm({
  siteName,
  siteEmail,
  showSummary,
  social,
}: {
  siteName: string;
  siteEmail: string | null;
  showSummary: boolean;
  social: Record<SocialKey, string | null>;
}) {
  const router = useRouter();
  const [name, setName] = useState(siteName);
  const [email, setEmail] = useState(siteEmail ?? "");
  const [summaryOn, setSummaryOn] = useState(showSummary);
  const [socialUrls, setSocialUrls] = useState<Record<SocialKey, string>>({
    github: social.github ?? "",
    x: social.x ?? "",
    soundcloud: social.soundcloud ?? "",
    youtube: social.youtube ?? "",
  });
  const [pending, startTransition] = useTransition();

  const onSave = () => {
    startTransition(async () => {
      const result = await updateSiteSettings({
        siteName: name,
        siteEmail: email,
        showSummary: summaryOn,
        social: socialUrls,
      });
      if (result.ok) {
        toast.success("저장했습니다.");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  return (
    <div className="max-w-md space-y-4">
      <div className="space-y-2">
        <Label htmlFor="site-name">블로그 이름</Label>
        <Input
          id="site-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Blog"
        />
        <p className="text-xs text-muted-foreground">
          헤더, 푸터, 브라우저 탭 제목, RSS 피드에 사용됩니다.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="site-email">연락 이메일 (선택)</Label>
        <Input
          id="site-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="me@example.com"
        />
        <p className="text-xs text-muted-foreground">
          푸터에 표시됩니다. 비워두면 표시하지 않습니다.
        </p>
      </div>
      <div className="flex items-center justify-between rounded-lg border p-3">
        <div className="space-y-0.5">
          <Label htmlFor="show-summary">포스트에 요약 표시</Label>
          <p className="text-xs text-muted-foreground">
            요약이 있는 글은 제목 아래에 요약을 보여줍니다.
          </p>
        </div>
        <Switch id="show-summary" checked={summaryOn} onCheckedChange={setSummaryOn} />
      </div>

      <div className="space-y-3 rounded-lg border p-3">
        <div className="space-y-0.5">
          <p className="text-sm font-medium">SNS 링크</p>
          <p className="text-xs text-muted-foreground">
            프로필 전체 URL을 입력하면 푸터에 아이콘으로 표시됩니다. 비워두면 숨김.
          </p>
        </div>
        {SOCIAL_PLATFORMS.map(({ key, label, Icon }) => (
          <div key={key} className="flex items-center gap-2">
            <Icon className="size-4 shrink-0 text-muted-foreground" />
            <Label htmlFor={`social-${key}`} className="w-24 shrink-0 text-sm">
              {label}
            </Label>
            <Input
              id={`social-${key}`}
              type="url"
              value={socialUrls[key]}
              onChange={(e) => setSocialUrls((prev) => ({ ...prev, [key]: e.target.value }))}
              placeholder="https://…"
            />
          </div>
        ))}
      </div>

      <Button onClick={onSave} disabled={pending || name.trim() === ""}>
        {pending ? "저장 중…" : "저장"}
      </Button>
    </div>
  );
}
