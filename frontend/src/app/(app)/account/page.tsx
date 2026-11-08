import type { Metadata } from "next";
import { AppPage } from "@/components/shell/app-page";
import { AccountPage } from "@/core/account-page";

export const metadata: Metadata = { title: "Аккаунт" };

export default function Page() {
  return (
    <AppPage>
      <AccountPage />
    </AppPage>
  );
}
