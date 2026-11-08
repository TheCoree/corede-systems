import type { Metadata } from "next";
import { AppPage } from "@/components/shell/app-page";
import { IncidentsPage } from "@/modules/monitoring/incidents-page";

export const metadata: Metadata = { title: "Инциденты" };

export default function Page() {
  return (
    <AppPage>
      <IncidentsPage />
    </AppPage>
  );
}
