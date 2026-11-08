import { type ReactNode, Suspense } from "react";
import { PageHeader } from "@/components/shell/page-header";
import { SettingsTabs } from "./tabs";

// Серверный layout: заголовок статичен, вкладки (зависят от URL) — в своей границе Suspense.
export function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <PageHeader title="Настройки" className="mb-4" />
      <Suspense fallback={<div className="mb-6 h-10 border-b border-border" />}>
        <SettingsTabs />
      </Suspense>
      <div className="max-w-3xl">{children}</div>
    </>
  );
}
