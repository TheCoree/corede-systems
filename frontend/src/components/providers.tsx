"use client";

import { ThemeProvider, useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { Toaster } from "sonner";
import { SWRConfig } from "swr";
import { ApiError } from "@/lib/api";
import { TooltipProvider } from "./ui/misc";

function ThemedToaster() {
  const { resolvedTheme } = useTheme();
  return (
    <Toaster
      theme={(resolvedTheme as "light" | "dark") ?? "dark"}
      position="bottom-right"
      toastOptions={{
        className: "!rounded-lg !border !border-border !bg-surface !text-fg !shadow-pop !text-sm",
      }}
    />
  );
}

export function Providers({ children }: { children: ReactNode }) {
  const router = useRouter();
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
      <SWRConfig
        value={{
          revalidateOnFocus: true,
          shouldRetryOnError: (err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500),
          onError: (err) => {
            if (err instanceof ApiError && err.status === 401 && !location.pathname.startsWith("/login")) {
              const next = encodeURIComponent(location.pathname + location.search);
              router.replace(`/login?next=${next}`);
            }
          },
        }}
      >
        <TooltipProvider delayDuration={250}>{children}</TooltipProvider>
        <ThemedToaster />
      </SWRConfig>
    </ThemeProvider>
  );
}
