import type { Metadata } from "next";
import { AppPage } from "@/components/shell/app-page";
import { MonitorsPage } from "@/modules/monitoring/monitors-page";

export const metadata: Metadata = { title: "Мониторы" };

export default function Page() {
  return (
    <AppPage>
      <MonitorsPage />
    </AppPage>
  );
}
