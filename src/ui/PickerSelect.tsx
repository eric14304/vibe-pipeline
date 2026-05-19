import { useEffect, useRef, type ReactNode } from "react";
import { CheckIconSm } from "./icons";

export type PickerOption = {
  id: string;
  label: string;
  hint?: string;
  mono?: boolean;
};

export function PickerSelect({
  open,
  setOpen,
  value,
  onChange,
  options,
  icon,
}: {
  open: boolean;
  setOpen: (v: boolean | ((o: boolean) => boolean)) => void;
  value: string;
  onChange: (id: string) => void;
  options: PickerOption[];
  icon?: ReactNode;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open, setOpen]);

  const current = options.find((o) => o.id === value);

  return (
    <div className="picker" ref={wrapRef}>
      <button type="button" className={"picker-trigger" + (open ? " is-open" : "")} onClick={() => setOpen((o) => !o)}>
        {icon}
        <span className={current?.mono ? "mono" : ""}>{current?.label}</span>
        {current?.hint && <span className="picker-hint mono">({current.hint})</span>}
        <span style={{ flex: 1 }} />
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div className="picker-menu fade-up">
          {options.map((o) => (
            <button
              key={o.id}
              type="button"
              className={"picker-item" + (o.id === value ? " is-active" : "")}
              onClick={() => {
                onChange(o.id);
                setOpen(false);
              }}
            >
              {icon && <span className="picker-item-icon">{icon}</span>}
              <span className={o.mono ? "mono" : ""}>{o.label}</span>
              {o.hint && <span className="picker-item-hint mono">{o.hint}</span>}
              {o.id === value && (
                <span className="picker-item-check">
                  <CheckIconSm />
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
