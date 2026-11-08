import type { Metadata } from "next";
import { AppPage } from "@/components/shell/app-page";
import { AdminPage } from "@/core/admin-page";

export const metadata: Metadata = { title: "Администрирование" };

export default function Page() {
  return (
    <AppPage>
      <AdminPage />
    </AppPage>
  );
}
