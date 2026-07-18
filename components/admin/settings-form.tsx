"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { updateSiteSettings } from "@/lib/actions/settings";
import { FONT_OPTIONS } from "@/lib/site-fonts";
import { SOCIAL_PLATFORMS, type SocialKey } from "@/components/social-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

const GISCUS_FIELDS = [
  { key: "repo", label: "저장소 (owner/repo)", placeholder: "9um4-web/blog" },
  { key: "repoId", label: "Repository ID", placeholder: "R_kgDO…" },
  { key: "category", label: "카테고리", placeholder: "Announcements" },
  { key: "categoryId", label: "Category ID", placeholder: "DIC_kwDO…" },
] as const;

type GiscusFieldKey = (typeof GISCUS_FIELDS)[number]["key"];

export function SettingsForm({
  siteName,
  siteEmail,
  showSummary,
  social,
  giscus,
  siteFont,
}: {
  siteName: string;
  siteEmail: string | null;
  showSummary: boolean;
  social: Record<SocialKey, string | null>;
  giscus: Record<GiscusFieldKey, string> | null;
  siteFont: string;
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
  const [giscusValues, setGiscusValues] = useState<Record<GiscusFieldKey, string>>({
    repo: giscus?.repo ?? "",
    repoId: giscus?.repoId ?? "",
    category: giscus?.category ?? "",
    categoryId: giscus?.categoryId ?? "",
  });
  const [font, setFont] = useState(siteFont);
  const [pending, startTransition] = useTransition();

  const onSave = () => {
    startTransition(async () => {
      const result = await updateSiteSettings({
        siteName: name,
        siteEmail: email,
        showSummary: summaryOn,
        social: socialUrls,
        giscus: giscusValues,
        siteFont: font,
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
      <div className="space-y-2">
        <Label>사이트 글꼴</Label>
        <Select value={font} onValueChange={setFont}>
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FONT_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          사이트 전체에 적용됩니다. 한글 글꼴(Pretendard 등)은 셀프호스팅되어 외부
          요청이 없습니다.
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

      <div className="space-y-3 rounded-lg border p-3">
        <div className="space-y-0.5">
          <p className="text-sm font-medium">댓글 (Giscus)</p>
          <p className="text-xs text-muted-foreground">
            giscus.app에서 저장소를 설정하고 발급된 값을 붙여넣으세요. 네 값이 모두
            채워져야 포스트 하단 댓글과 방명록이 활성화됩니다.
          </p>
        </div>
        {GISCUS_FIELDS.map(({ key, label, placeholder }) => (
          <div key={key} className="flex items-center gap-2">
            <Label htmlFor={`giscus-${key}`} className="w-40 shrink-0 text-sm">
              {label}
            </Label>
            <Input
              id={`giscus-${key}`}
              value={giscusValues[key]}
              onChange={(e) =>
                setGiscusValues((prev) => ({ ...prev, [key]: e.target.value }))
              }
              placeholder={placeholder}
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
