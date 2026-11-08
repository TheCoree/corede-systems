"use client";

import { Menu as MenuIcon } from "lucide-react";
import { Dialog as D } from "radix-ui";
import { type ReactNode, Suspense, useState } from "react";
import { LogoMark } from "@/components/brand/logo";
import { Skeleton } from "@/components/ui/misc";
import { CommandPalette } from "./command-palette";
import { Sidebar } from "./sidebar";

function SidebarSkeleton() {
  return (
    <div className="flex h-full flex-col gap-4 p-2">
      <Skeleton className="h-10" />
      <Skeleton className="h-8" />
      <div className="space-y-2 pt-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-7" />
        ))}
      </div>
    </div>
  );
}

/**
 * Каркас приложения. Сам по себе статичен — всё, что зависит от URL
 * (сайдбар, палитра), обёрнуто в собственные границы Suspense,
 * а страницы оборачиваются в <AppPage>.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 border-r border-border bg-bg md:block">
        <Suspense fallback={<SidebarSkeleton />}>
          <Sidebar />
        </Suspense>
      </aside>

      <D.Root open={mobileOpen} onOpenChange={setMobileOpen}>
        <D.Portal>
          <D.Overlay className="fixed inset-0 z-50 bg-[var(--overlay)] data-[state=open]:animate-fade-in md:hidden" />
          <D.Content className="fixed inset-y-0 left-0 z-50 w-[272px] border-r border-border bg-bg shadow-pop data-[state=open]:animate-slide-in md:hidden">
            <D.Title className="sr-only">Навигация</D.Title>
            <D.Description className="sr-only">Меню разделов</D.Description>
            <Suspense fallback={<SidebarSkeleton />}>
              <Sidebar onNavigate={() => setMobileOpen(false)} />
            </Suspense>
          </D.Content>
        </D.Portal>
      </D.Root>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-12 items-center gap-2 border-b border-border bg-bg/80 px-3 backdrop-blur md:hidden">
          <button
            onClick={() => setMobileOpen(true)}
            className="flex size-8 items-center justify-center rounded-md text-fg-muted hover:bg-muted hover:text-fg"
            aria-label="Меню"
          >
            <MenuIcon className="size-4" />
          </button>
          <LogoMark className="size-5" />
          <span className="text-sm font-semibold">corede</span>
        </header>
        <main className="mx-auto w-full max-w-[1200px] flex-1 px-4 pb-24 pt-6 md:px-8 md:pt-8">{children}</main>
      </div>
      <Suspense fallback={null}>
        <CommandPalette />
      </Suspense>
    </div>
  );
}
