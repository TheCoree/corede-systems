import type { Metadata } from "next";
import { SettingsLayout } from "@/core/settings/layout";

export const metadata: Metadata = { title: "Настройки" };

export default function Layout({ children }: LayoutProps<"/[workspace]/settings">) {
  return <SettingsLayout>{children}</SettingsLayout>;
}
