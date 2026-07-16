"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { updateSiteName } from "@/lib/actions/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function SettingsForm({ siteName }: { siteName: string }) {
  const router = useRouter();
  const [name, setName] = useState(siteName);
  const [pending, startTransition] = useTransition();

  const onSave = () => {
    startTransition(async () => {
      const result = await updateSiteName(name);
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
          헤더, 브라우저 탭 제목, RSS 피드에 사용됩니다.
        </p>
      </div>
      <Button onClick={onSave} disabled={pending || name.trim() === ""}>
        {pending ? "저장 중…" : "저장"}
      </Button>
    </div>
  );
}
