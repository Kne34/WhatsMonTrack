"use client";

import React from "react";
import { Select as BaseSelect } from "@base-ui/react/select";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Menus and pop-up buttons after Apple's (macOS/iOS) Human Interface Guidelines:
 * - the button shows the current choice with the up-and-down chevron of a pop-up button;
 * - the menu opens over the button with the chosen item lined up on it (as on a Mac), the
 *   chosen item marked with a checkmark in a column of its own;
 * - a translucent, blurred material with a soft shadow and rounded corners;
 * - the item under the pointer or the keyboard highlighted in the system blue, rows 44 px high
 *   on touch screens (Apple's minimum hit target);
 * - keyboard: arrows, Home/End, typing the first letters, Enter, Escape; a short fade and
 *   scale that is skipped with "reduce motion".
 */

/** The material of every menu and pop-up in the app */
export const menuSurface =
  "rounded-xl border border-black/[0.08] bg-popover/80 p-1 text-popover-foreground shadow-[0_16px_48px_-12px_rgba(0,0,0,0.32),0_4px_12px_-4px_rgba(0,0,0,0.12)] backdrop-blur-2xl backdrop-saturate-150 dark:border-white/10 dark:bg-popover/75 dark:shadow-[0_16px_48px_-12px_rgba(0,0,0,0.7)]";

/** One row of a menu; `data-highlighted` is set by the menu while the pointer or the keyboard is on it */
export const menuItem =
  "relative flex w-full cursor-default select-none items-center gap-2 rounded-md py-1.5 pl-7 pr-3 text-left text-sm text-popover-foreground outline-none [@media(pointer:coarse)]:min-h-11 data-[disabled]:opacity-40 data-[highlighted]:bg-[#007AFF] data-[highlighted]:text-white dark:data-[highlighted]:bg-[#0A84FF] [&[data-highlighted]_.menu-muted]:text-white/80";

/** The opening and closing motion (Base UI sets the starting and ending attributes) */
export const menuMotion =
  "origin-[var(--transform-origin)] transition-[transform,opacity] duration-150 ease-out data-[starting-style]:scale-[0.97] data-[starting-style]:opacity-0 data-[ending-style]:scale-[0.97] data-[ending-style]:opacity-0 data-[ending-style]:duration-100 motion-reduce:transition-none";

export interface SelectOption {
  value: string;
  label: React.ReactNode;
  description?: React.ReactNode;
  disabled?: boolean;
}

/** `<option>` children, as with a native select, turned into options */
function optionsFrom(children: React.ReactNode): SelectOption[] {
  const out: SelectOption[] = [];
  const walk = (node: React.ReactNode) => {
    React.Children.forEach(node, (child) => {
      if (!React.isValidElement(child)) return;
      const props = child.props as { value?: string | number; children?: React.ReactNode; disabled?: boolean };
      if (child.type === "option") out.push({ value: String(props.value ?? ""), label: props.children, disabled: props.disabled });
      else if (child.type === React.Fragment) walk(props.children);
    });
  };
  walk(children);
  return out;
}

const sizes = {
  sm: "h-8 rounded-lg px-2.5 text-sm",
  md: "h-9 rounded-lg px-3 text-sm",
  lg: "h-11 rounded-xl px-3.5 text-base sm:text-sm",
};

export interface SelectProps {
  value: string;
  onValueChange: (value: string) => void;
  /** The choices; or `<option>` children as with a native select */
  options?: SelectOption[];
  children?: React.ReactNode;
  "aria-label"?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  id?: string;
  disabled?: boolean;
  size?: keyof typeof sizes;
  className?: string;
  /** Shown while nothing is chosen and no option has the empty value */
  placeholder?: string;
}

/** A pop-up button: one choice out of a list */
export function Select({ value, onValueChange, options: given, children, id, disabled, size = "md", className, placeholder, ...aria }: SelectProps) {
  const options = given ?? optionsFrom(children);
  // The empty value ("all", "none") is Base UI's null item
  const toBase = (v: string) => (v === "" ? null : v);
  const items = options.map((o) => ({ value: toBase(o.value), label: o.label }));
  return (
    <BaseSelect.Root items={items} value={toBase(value)} onValueChange={(v) => onValueChange((v as string | null) ?? "")} disabled={disabled}>
      <BaseSelect.Trigger id={id} aria-label={aria["aria-label"]} aria-describedby={aria["aria-describedby"]} aria-invalid={aria["aria-invalid"]}
        className={cn(
          "group inline-flex w-full min-w-0 items-center justify-between gap-2 border border-border bg-card text-foreground shadow-[0_1px_1px_rgba(0,0,0,0.04)] transition-colors",
          "outline-none hover:bg-muted/50 focus-visible:border-[#007AFF] focus-visible:ring-[3px] focus-visible:ring-[#007AFF]/25 data-[popup-open]:bg-muted/60",
          "disabled:opacity-60 aria-[invalid=true]:border-destructive/60",
          sizes[size], className,
        )}>
        <BaseSelect.Value placeholder={placeholder} className="min-w-0 flex-1 truncate text-left data-[placeholder]:text-muted-foreground" />
        <BaseSelect.Icon className="flex shrink-0 text-muted-foreground">
          <ChevronsUpDown className="size-3.5" aria-hidden />
        </BaseSelect.Icon>
      </BaseSelect.Trigger>
      <BaseSelect.Portal>
        <BaseSelect.Positioner sideOffset={6} className="z-[100] outline-none" alignItemWithTrigger>
          <BaseSelect.Popup data-lenis-prevent className={cn(menuSurface, menuMotion, "max-h-[min(24rem,var(--available-height))] min-w-[var(--anchor-width)] overflow-y-auto overscroll-contain")}>
            <BaseSelect.List>
              {options.map((o) => (
                <BaseSelect.Item key={o.value} value={toBase(o.value)} disabled={o.disabled} className={menuItem}>
                  <BaseSelect.ItemIndicator className="absolute left-2 flex w-3.5 items-center justify-center">
                    <Check className="size-3.5" strokeWidth={2.5} aria-hidden />
                  </BaseSelect.ItemIndicator>
                  <span className="min-w-0">
                    <BaseSelect.ItemText className="block truncate">{o.label}</BaseSelect.ItemText>
                    {o.description && <span className="menu-muted block text-xs text-muted-foreground">{o.description}</span>}
                  </span>
                </BaseSelect.Item>
              ))}
            </BaseSelect.List>
          </BaseSelect.Popup>
        </BaseSelect.Positioner>
      </BaseSelect.Portal>
    </BaseSelect.Root>
  );
}
