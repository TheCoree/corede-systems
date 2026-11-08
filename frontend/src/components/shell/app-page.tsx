import { type ReactNode, Suspense } from "react";
import { Skeleton } from "@/components/ui/misc";
import { PageGate } from "./page-gate";

export function PageSkeleton() {
  return (
    <div className="space-y-6" aria-busy>
      <div className="space-y-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[76px]" />
        ))}
      </div>
      <Skeleton className="h-72" />
    </div>
  );
}

/**
 * Обёртка каждой страницы приложения. Своя граница Suspense внутри сегмента
 * страницы: при навигации сразу виден скелетон (instant navigation в Next 16),
 * а клиентские хуки маршрута (useParams и т.п.) догружаются внутри.
 */
export function AppPage({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <PageGate>{children}</PageGate>
    </Suspense>
  );
}
