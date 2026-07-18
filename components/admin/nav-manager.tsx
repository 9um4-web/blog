"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { moveNavItemAction, setNavItemEnabled } from "@/lib/actions/nav";
import type { ActionResult } from "@/lib/actions/tags";
import type { NavItem } from "@/lib/nav-items";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";

export function NavManager({ items }: { items: NavItem[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const run = (action: () => Promise<ActionResult>) => {
    startTransition(async () => {
      const result = await action();
      if (result.ok) router.refresh();
      else toast.error(result.error);
    });
  };

  return (
    <div className="max-w-lg space-y-1 rounded-lg border p-2">
      {items.map((item, i) => (
        <div
          key={item.id}
          className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-accent/50"
        >
          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon"
              className="size-6"
              disabled={pending || i === 0}
              onClick={() => run(() => moveNavItemAction(item.id, "up"))}
            >
              <ArrowUp className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-6"
              disabled={pending || i === items.length - 1}
              onClick={() => run(() => moveNavItemAction(item.id, "down"))}
            >
              <ArrowDown className="size-3.5" />
            </Button>
          </div>
          <span className="min-w-0 flex-1 truncate text-sm">{item.label}</span>
          <span className="shrink-0 text-xs text-muted-foreground">{item.href}</span>
          <Switch
            checked={item.enabled}
            disabled={pending}
            onCheckedChange={(v) => run(() => setNavItemEnabled(item.id, v))}
          />
        </div>
      ))}
      {items.length === 0 && (
        <p className="p-2 text-sm text-muted-foreground">표시할 메뉴 항목이 없습니다.</p>
      )}
    </div>
  );
}
