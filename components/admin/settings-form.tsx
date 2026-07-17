"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { updateSiteSettings } from "@/lib/actions/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function SettingsForm({
  siteName,
  siteEmail,
}: {
  siteName: string;
  siteEmail: string | null;
}) {
  const router = useRouter();
  const [name, setName] = useState(siteName);
  const [email, setEmail] = useState(siteEmail ?? "");
  const [pending, startTransition] = useTransition();

  const onSave = () => {
    startTransition(async () => {
      const result = await updateSiteSettings(name, email);
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
      <Button onClick={onSave} disabled={pending || name.trim() === ""}>
        {pending ? "저장 중…" : "저장"}
      </Button>
    </div>
  );
}
