"use client";

import { type ReactNode, useCallback, useRef, useState } from "react";
import { Button } from "./button";
import { Dialog } from "./dialog";
import { Input } from "./input";

type Options = {
  title: ReactNode;
  description?: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  /** потребовать ввести эту строку для подтверждения */
  typeToConfirm?: string;
};

/** const [confirm, dialog] = useConfirm(); if (await confirm({...})) ... ; {dialog} в разметке */
export function useConfirm() {
  const [opts, setOpts] = useState<Options | null>(null);
  const [typed, setTyped] = useState("");
  const resolver = useRef<((v: boolean) => void) | null>(null);

  const confirm = useCallback((o: Options) => {
    setTyped("");
    setOpts(o);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const close = (v: boolean) => {
    resolver.current?.(v);
    resolver.current = null;
    setOpts(null);
  };

  const blocked = !!opts?.typeToConfirm && typed !== opts.typeToConfirm;

  const dialog = (
    <Dialog
      open={!!opts}
      onOpenChange={(o) => !o && close(false)}
      title={opts?.title ?? ""}
      description={opts?.description}
      className="max-w-[420px]"
      footer={
        <>
          <Button onClick={() => close(false)}>Отмена</Button>
          <Button variant={opts?.danger ? "danger" : "primary"} disabled={blocked} onClick={() => close(true)}>
            {opts?.confirmLabel ?? "Подтвердить"}
          </Button>
        </>
      }
    >
      {opts?.typeToConfirm ? (
        <div className="flex flex-col gap-2">
          <p className="text-[13px] text-fg-muted">
            Введите <span className="font-mono font-medium text-fg">{opts.typeToConfirm}</span> для подтверждения
          </p>
          <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
        </div>
      ) : (
        <p className="text-[13px] text-fg-muted">Это действие нельзя отменить.</p>
      )}
    </Dialog>
  );

  return [confirm, dialog] as const;
}
