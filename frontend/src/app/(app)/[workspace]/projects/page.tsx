import type { Metadata } from "next";
import { AppPage } from "@/components/shell/app-page";
import { ProjectsPage } from "@/core/projects-page";

export const metadata: Metadata = { title: "Проекты" };

export default function Page() {
  return (
    <AppPage>
      <ProjectsPage />
    </AppPage>
  );
}
