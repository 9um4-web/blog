"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { updateSiteSettings } from "@/lib/actions/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export function SettingsForm({
  siteName,
  siteEmail,
  showSummary,
}: {
  siteName: string;
  siteEmail: string | null;
  showSummary: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState(siteName);
  const [email, setEmail] = useState(siteEmail ?? "");
  const [summaryOn, setSummaryOn] = useState(showSummary);
  const [pending, startTransition] = useTransition();

  const onSave = () => {
    startTransition(async () => {
      const result = await updateSiteSettings({
        siteName: name,
        siteEmail: email,
        showSummary: summaryOn,
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
      <Button onClick={onSave} disabled={pending || name.trim() === ""}>
        {pending ? "저장 중…" : "저장"}
      </Button>
    </div>
  );
}
