import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "@/core/auth/login-form";

export const metadata: Metadata = { title: "Вход" };

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
