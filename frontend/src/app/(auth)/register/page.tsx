import type { Metadata } from "next";
import { Suspense } from "react";
import { RegisterForm } from "@/core/auth/register-form";

export const metadata: Metadata = { title: "Запрос доступа" };

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterForm />
    </Suspense>
  );
}
