"use client";

import { Clock } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, buttonClass } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { api, ApiError } from "@/lib/api";

export function RegisterForm() {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", email: "", password: "", note: "" });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api<{ status: string }>("/auth/register", {
        method: "POST",
        body: { ...form, note: form.note || null },
      });
      if (res.status === "active") {
        router.replace("/");
        return;
      }
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось отправить заявку");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div>
        <div className="mb-5 flex size-10 items-center justify-center rounded-lg border border-border bg-surface">
          <Clock className="size-5 text-warning" />
        </div>
        <h1 className="text-xl font-semibold tracking-tight">Заявка отправлена</h1>
        <p className="mt-2 text-sm text-fg-muted">
          Администратор проверит её и откроет доступ. После одобрения войдите с указанным email и паролем.
        </p>
        <Link href="/login" className={buttonClass("secondary", "md", "mt-6 w-full justify-center")}>
          Ко входу
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight">Запрос доступа</h1>
      <p className="mt-1 text-sm text-fg-muted">Аккаунт заработает после подтверждения администратором.</p>
      <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
        <Field label="Имя" htmlFor="name">
          <Input id="name" required autoFocus autoComplete="name" value={form.name} onChange={set("name")} />
        </Field>
        <Field label="Email" htmlFor="email">
          <Input id="email" type="email" required autoComplete="email" value={form.email} onChange={set("email")} />
        </Field>
        <Field label="Пароль" htmlFor="password" hint="Минимум 8 символов">
          <Input
            id="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={form.password}
            onChange={set("password")}
          />
        </Field>
        <Field label="Комментарий" htmlFor="note" hint="Необязательно — кто вы и зачем нужен доступ">
          <Textarea id="note" rows={2} value={form.note} onChange={set("note")} className="min-h-16" />
        </Field>
        {error && (
          <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-[13px] text-danger">{error}</div>
        )}
        <Button type="submit" variant="primary" loading={loading} className="w-full justify-center">
          Отправить заявку
        </Button>
      </form>
      <p className="mt-6 text-center text-[13px] text-fg-muted">
        Уже есть аккаунт?{" "}
        <Link href="/login" className="font-medium text-fg hover:underline">
          Войти
        </Link>
      </p>
    </div>
  );
}
