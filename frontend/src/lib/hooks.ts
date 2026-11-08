"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

import { useApi } from "./api";
import type { Me } from "./types";

export function useMe() {
  return useApi<Me>("/auth/me", { revalidateOnFocus: true, dedupingInterval: 5000 });
}

const LAST_WS_KEY = "cds:last-workspace";

export function rememberWorkspace(slug: string) {
  try {
    localStorage.setItem(LAST_WS_KEY, slug);
  } catch {}
}

export function lastWorkspace(): string | null {
  try {
    return localStorage.getItem(LAST_WS_KEY);
  } catch {
    return null;
  }
}

/** Текущее пространство: из URL, иначе последнее открытое, иначе первое. */
export function useWorkspace() {
  const params = useParams<{ workspace?: string }>();
  const { data: me } = useMe();
  const fromUrl = params?.workspace;
  const stored = typeof window !== "undefined" ? lastWorkspace() : null;
  const list = me?.workspaces ?? [];
  const slug =
    fromUrl ?? (stored && list.some((w) => w.slug === stored) ? stored : undefined) ?? list[0]?.slug ?? "";
  const workspace = list.find((w) => w.slug === slug);

  useEffect(() => {
    if (fromUrl) rememberWorkspace(fromUrl);
  }, [fromUrl]);

  return {
    slug,
    workspace,
    /** путь в API пространства: /w/<slug>/... */
    api: (path = "") => `/w/${slug}${path}`,
    /** путь страницы: /<slug>/... */
    href: (path = "") => `/${slug}${path}`,
  };
}

const storageListeners = new Set<() => void>();

function subscribeStorage(cb: () => void) {
  storageListeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    storageListeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Состояние с сохранением в localStorage (настройки вида, фильтры). */
export function useLocalState<T extends object | string | number | boolean>(key: string, initial: T) {
  const raw = useSyncExternalStore(
    subscribeStorage,
    () => readStorage(key),
    () => null,
  );

  let value = initial;
  if (raw != null) {
    try {
      const parsed = JSON.parse(raw) as T;
      value =
        typeof initial === "object" && initial && typeof parsed === "object"
          ? ({ ...(initial as object), ...(parsed as object) } as T)
          : parsed;
    } catch {}
  }

  const update = useCallback(
    (next: T | ((prev: T) => T)) => {
      const prevRaw = readStorage(key);
      let prev = initial;
      try {
        if (prevRaw != null) prev = JSON.parse(prevRaw) as T;
      } catch {}
      const v = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
      try {
        localStorage.setItem(key, JSON.stringify(v));
      } catch {}
      storageListeners.forEach((l) => l());
    },
    // initial — литерал по умолчанию, не влияет на подписку
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );

  return [value, update] as const;
}

/** Текущее время, обновляется раз в `ms` — для «5 мин назад». */
export function useNow(ms = 15000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

const noopSubscribe = () => () => {};

/** window.location.origin без расхождения гидрации ("" на сервере). */
export function useOrigin() {
  return useSyncExternalStore(
    noopSubscribe,
    () => window.location.origin,
    () => "",
  );
}
/** true только на клиенте после гидрации */
export function useMounted() {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}
