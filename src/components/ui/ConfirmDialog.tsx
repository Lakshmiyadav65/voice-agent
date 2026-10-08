"use client";

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from "react";

export type ConfirmOptions = {
  title: string;
  message?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** "danger" for actions that remove or stop something; Cancel then gets the focus. */
  tone?: "default" | "danger";
};

type Ask = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<Ask | null>(null);

/** An in-app replacement for window.confirm: `if (!(await confirm({ title }))) return;` */
export function useConfirm(): Ask {
  const ask = useContext(ConfirmContext);
  if (!ask) throw new Error("useConfirm must be used inside ConfirmProvider");
  return ask;
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const ids = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const resolver = useRef<((confirmed: boolean) => void) | null>(null);
  // Where the last press began, so a drag out of the panel onto the backdrop doesn't count as a backdrop click.
  const pressedBackdrop = useRef(false);
  const [options, setOptions] = useState<ConfirmOptions | null>(null);

  const ask = useCallback<Ask>((next) => {
    resolver.current?.(false);
    setOptions(next);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  useEffect(() => {
    const element = dialog.current;
    if (!options || !element || element.open) return;
    element.showModal();
    element.querySelector<HTMLElement>("[data-autofocus]")?.focus();
  }, [options]);

  function settle(confirmed: boolean) {
    resolver.current?.(confirmed);
    resolver.current = null;
    dialog.current?.close();
  }

  const danger = options?.tone === "danger";

  return (
    <ConfirmContext.Provider value={ask}>
      {children}
      <dialog
        ref={dialog}
        aria-labelledby={`${ids}-title`}
        aria-describedby={options?.message ? `${ids}-message` : undefined}
        // Escape and close() both land here; anything not yet answered counts as Cancel.
        onClose={() => {
          resolver.current?.(false);
          resolver.current = null;
          setOptions(null);
        }}
        onPointerDown={(e) => {
          pressedBackdrop.current = e.target === e.currentTarget;
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget && pressedBackdrop.current) settle(false);
        }}
        // Tailwind's reset zeroes the margin that centres a modal dialog, so it is restored here.
        className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-border bg-surface p-0 text-ink shadow-2xl backdrop:bg-ink/45"
      >
        {options ? (
          <div className="p-6">
            <div className="flex items-start gap-4">
              <span
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${danger ? "bg-warn/10 text-warn" : "bg-accent-soft text-accent"}`}
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  {danger ? (
                    <>
                      <path d="M12 3 2.5 20h19z" />
                      <path d="M12 10v4M12 17v.01" />
                    </>
                  ) : (
                    <>
                      <circle cx="12" cy="12" r="9" />
                      <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.3M12 16.5v.01" />
                    </>
                  )}
                </svg>
              </span>
              <div className="min-w-0 pt-1.5">
                <h2 id={`${ids}-title`} className="font-display text-lg font-semibold leading-snug text-ink">
                  {options.title}
                </h2>
                {options.message ? (
                  <div id={`${ids}-message`} className="mt-1.5 text-sm leading-relaxed text-muted">
                    {options.message}
                  </div>
                ) : null}
              </div>
            </div>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                data-autofocus={danger || undefined}
                onClick={() => settle(false)}
                className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-semibold text-ink transition hover:bg-background"
              >
                {options.cancelLabel ?? "Cancel"}
              </button>
              <button
                type="button"
                data-autofocus={danger ? undefined : true}
                onClick={() => settle(true)}
                className={`rounded-lg px-4 py-2 text-sm font-semibold text-white transition ${danger ? "bg-warn hover:bg-warn/90" : "bg-accent hover:bg-accent/90"}`}
              >
                {options.confirmLabel ?? "Confirm"}
              </button>
            </div>
          </div>
        ) : null}
      </dialog>
    </ConfirmContext.Provider>
  );
}
