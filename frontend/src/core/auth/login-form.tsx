"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { mutate } from "swr";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { api, ApiError } from "@/lib/api";
import type { Me } from "@/lib/types";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const me = await api<Me>("/auth/login", { method: "POST", body: { email, password } });
      await mutate("/auth/me", me, { revalidate: false });
      const next = params.get("next");
      router.replace(next && next.startsWith("/") && !next.startsWith("//") ? next : "/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось войти");
      setLoading(false);
    }
  }

  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight">Вход</h1>
      <p className="mt-1 text-sm text-fg-muted">Войдите, чтобы открыть панель.</p>
      <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
        <Field label="Email" htmlFor="email">
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
          />
        </Field>
        <Field label="Пароль" htmlFor="password">
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        {error && (
          <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-[13px] text-danger">{error}</div>
        )}
        <Button type="submit" variant="primary" loading={loading} className="w-full justify-center">
          Войти
        </Button>
      </form>
      <p className="mt-6 text-center text-[13px] text-fg-muted">
        Нет аккаунта?{" "}
        <Link href="/register" className="font-medium text-fg hover:underline">
          Запросить доступ
        </Link>
      </p>
    </div>
  );
}
