import { AppShell } from "@/components/shell/app-shell";

// Каркас статичен и попадает в static shell; страницы сами оборачиваются в <AppPage>.
export default function AppLayout({ children }: LayoutProps<"/">) {
  return <AppShell>{children}</AppShell>;
}
