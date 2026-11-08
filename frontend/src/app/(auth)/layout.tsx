import { Logo } from "@/components/brand/logo";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh flex-col items-center px-4">
      <div className="flex w-full max-w-[360px] flex-1 flex-col justify-center py-12">
        <Logo className="mb-8 text-[15px]" />
        {children}
      </div>
      <p className="pb-6 text-xs text-fg-subtle">corede Systems</p>
    </div>
  );
}
