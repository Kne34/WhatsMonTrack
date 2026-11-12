"use client";

/**
 * Small, consistent building blocks for the whole app (auth screens, dashboard, dialogs).
 * Black-and-white theme via the shared tokens in globals.css (background, card, foreground,
 * muted-foreground, border, primary, destructive).
 */
import React, { useEffect, useId, useRef, useState } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

// ---------- Buttons ----------

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

const buttonVariants: Record<ButtonVariant, string> = {
  primary: "bg-primary text-primary-foreground hover:bg-primary/90",
  secondary: "border border-border bg-card text-foreground hover:bg-muted",
  ghost: "text-muted-foreground hover:bg-muted hover:text-foreground",
  danger: "border border-destructive/30 bg-card text-destructive hover:bg-destructive/5",
};

const buttonSizes: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-sm gap-1.5 rounded-lg",
  md: "h-10 px-4 text-sm gap-2 rounded-xl",
  lg: "h-11 px-5 text-sm gap-2 rounded-xl",
};

export const focusRing =
  "outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:ring-offset-2 focus-visible:ring-offset-background";

export function buttonClass(variant: ButtonVariant = "primary", size: ButtonSize = "md", className?: string) {
  return cn(
    "inline-flex items-center justify-center font-medium transition-colors disabled:pointer-events-none disabled:opacity-50",
    focusRing,
    buttonVariants[variant],
    buttonSizes[size],
    className,
  );
}

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Keeps the label visible and adds a spinner, so the button never turns into an empty box. */
  loading?: boolean;
}

export function Button({ variant = "primary", size = "md", loading, className, children, disabled, type = "button", ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClass(variant, size, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

/** Icon-only button: always has an accessible name (also shown as tooltip). */
export function IconButton({ label, className, children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40 disabled:pointer-events-none",
        focusRing,
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

// ---------- Form fields ----------

// min-w-0: date/time inputs have a wide built-in minimum width. text-base below sm: iOS zooms into fields under 16px.
export const inputBase =
  "h-11 w-full min-w-0 rounded-xl border bg-card px-3.5 text-base sm:text-sm text-foreground placeholder:text-muted-foreground/60 transition-colors outline-none focus:border-foreground/40 focus:ring-2 focus:ring-foreground/5 disabled:opacity-60";

interface FieldShellProps {
  id: string;
  label: string;
  hint?: React.ReactNode;
  error?: string;
  children: React.ReactNode;
}

function FieldShell({ id, label, hint, error, children }: FieldShellProps) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-foreground">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-xs text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

interface TextFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: React.ReactNode;
  error?: string;
  /** Fixed text before the value, e.g. "Rp" */
  prefix?: string;
  /** Element inside the right edge of the input, e.g. a show-password toggle */
  trailing?: React.ReactNode;
}

export function TextField({ label, hint, error, prefix, trailing, className, id: idProp, ...props }: TextFieldProps) {
  const autoId = useId();
  const id = idProp ?? autoId;
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <FieldShell id={id} label={label} hint={hint} error={error}>
      <div className="relative">
        {prefix && (
          <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-sm text-muted-foreground">
            {prefix}
          </span>
        )}
        <input
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(
            inputBase,
            error ? "border-destructive/60" : "border-border",
            prefix && "pl-10",
            trailing && "pr-11",
            className,
          )}
          {...props}
        />
        {trailing && <div className="absolute inset-y-0 right-1 flex items-center">{trailing}</div>}
      </div>
    </FieldShell>
  );
}

/** Password input with a show/hide toggle (web.dev sign-in form best practice). */
export function PasswordField(props: Omit<TextFieldProps, "type" | "trailing">) {
  const [visible, setVisible] = useState(false);
  return (
    <TextField
      {...props}
      type={visible ? "text" : "password"}
      trailing={
        <IconButton
          label={visible ? "Sembunyikan password" : "Tampilkan password"}
          aria-pressed={visible}
          onClick={() => setVisible((v) => !v)}
        >
          {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </IconButton>
      }
    />
  );
}

interface SelectFieldProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  hint?: React.ReactNode;
  error?: string;
}

export function SelectField({ label, hint, error, className, children, id: idProp, ...props }: SelectFieldProps) {
  const autoId = useId();
  const id = idProp ?? autoId;
  return (
    <FieldShell id={id} label={label} hint={hint} error={error}>
      <select
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        className={cn(inputBase, error ? "border-destructive/60" : "border-border", "pr-8", className)}
        {...props}
      >
        {children}
      </select>
    </FieldShell>
  );
}

// ---------- Feedback ----------

export function Alert({ tone = "error", children, className }: { tone?: "error" | "info"; children: React.ReactNode; className?: string }) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "rounded-xl border px-3.5 py-2.5 text-sm",
        tone === "error" ? "border-destructive/20 bg-destructive/5 text-destructive" : "border-border bg-muted text-foreground",
        className,
      )}
    >
      {children}
    </div>
  );
}

// ---------- Layout ----------

export function Card({ className, children, ...props }: React.HTMLAttributes<HTMLElement>) {
  return (
    <section className={cn("rounded-2xl border border-border/70 bg-card p-5 shadow-sm", className)} {...props}>
      {children}
    </section>
  );
}

export function CardHeader({ title, description, action }: { title: string; description?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/** Explains why an area is empty and what to do next (one per dashboard widget). */
export function EmptyState({ icon, title, description, action, className }: {
  icon?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-4 py-8 text-center", className)}>
      {icon && <div className="mb-3 flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">{icon}</div>}
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description && <p className="mt-1 max-w-xs text-xs text-muted-foreground">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("rounded-xl bg-muted motion-safe:animate-pulse", className)} aria-hidden />;
}

// ---------- Choice controls ----------

export function SegmentedControl<T extends string>({ label, value, onChange, options, className }: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
  className?: string;
}) {
  return (
    <div role="group" aria-label={label} className={cn("inline-flex rounded-lg bg-muted p-0.5", className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "flex-1 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              focusRing,
              active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ---------- Dropdown menu ----------

export interface MenuItem {
  label: string;
  description?: string;
  icon?: React.ReactNode;
  onSelect: () => void;
  danger?: boolean;
}

/** Minimal accessible dropdown: closes on outside click, Escape, or selection. */
export function Menu({ trigger, items, align = "end", header, footer, className }: {
  /** Render the trigger button and spread `triggerProps` onto it (onClick + ARIA state). */
  trigger: (props: { open: boolean; triggerProps: { onClick: () => void; "aria-expanded": boolean; "aria-haspopup": "menu" } }) => React.ReactNode;
  items: MenuItem[];
  align?: "start" | "end";
  header?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className={cn("relative", className)}>
      {trigger({ open, triggerProps: { onClick: () => setOpen((o) => !o), "aria-expanded": open, "aria-haspopup": "menu" } })}
      {open && (
        <div
          role="menu"
          className={cn(
            "absolute z-50 mt-2 w-max min-w-56 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-border bg-card p-1 shadow-lg",
            align === "end" ? "right-0" : "left-0",
          )}
        >
          {header && <div className="border-b border-border px-3 py-2.5">{header}</div>}
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
              className={cn(
                "flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-muted",
                focusRing,
                item.danger ? "text-destructive" : "text-foreground",
              )}
            >
              {item.icon && <span className="mt-0.5 shrink-0 text-muted-foreground">{item.icon}</span>}
              <span className="min-w-0">
                <span className="block">{item.label}</span>
                {item.description && <span className="block truncate text-xs text-muted-foreground">{item.description}</span>}
              </span>
            </button>
          ))}
          {footer && <div className="mt-1 border-t border-border px-3 py-2.5">{footer}</div>}
        </div>
      )}
    </div>
  );
}
