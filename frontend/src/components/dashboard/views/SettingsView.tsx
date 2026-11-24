"use client";

import React, { useState } from "react";
import { ChartCandlestick, ChevronRight, EyeOff, Globe, LogOut, MessageCircle, Moon, PanelLeft, Smartphone, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatPhone } from "@/lib/format";
import { LANGS, setLang, tr, useLang, type Lang } from "@/lib/i18n";
import { focusRing, SegmentedControl } from "../../common/ui";
import { ThemeSwitcher } from "../../theme";
import { PRIVACY_SECTIONS } from "../shared/privacy";
import { setSidebarCollapsed, useSidebarCollapsed } from "../shared/Navigation";

export interface SettingsViewProps {
  email: string;
  phoneNumber: string | null;
  isAdmin: boolean;
  botConnected: boolean | null;
  botStopped?: boolean;
  onPhoneClick: () => void;
  onBotClick: () => void;
  onLogout: () => void;
  notify: (message: string) => void;
}

/**
 * Pengaturan, laid out like iOS Settings: grouped rows on inset cards, a colored icon tile per row,
 * a chevron where the row opens something, the control itself where it changes a setting in place.
 */
export default function SettingsView(props: SettingsViewProps) {
  const lang = useLang();
  const sidebarCollapsed = useSidebarCollapsed("normal");
  const [resetDone, setResetDone] = useState(false);

  const hideAll = () => {
    try {
      for (const s of Object.values(PRIVACY_SECTIONS)) localStorage.setItem(s.key, "1");
    } catch { /* storage unavailable */ }
    props.notify(tr("Semua angka disembunyikan. Ketuk ikon mata di tiap bagian untuk menampilkannya lagi."));
  };

  const resetChart = () => {
    try {
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith("wmt-chart-") && key !== "wmt-chart-last") localStorage.removeItem(key);
      }
    } catch { /* storage unavailable */ }
    setResetDone(true);
    props.notify(tr("Tata letak chart dikembalikan ke awal"));
  };

  const botValue = props.botStopped
    ? tr("Dicabut")
    : props.botConnected ? tr("Online") : props.botConnected === false ? tr("Offline") : tr("Memeriksa…");

  return (
    <div className="max-w-2xl space-y-8">
      <Group title={tr("Tampilan")}>
        <Row icon={Moon} tint="bg-[#5856D6]" label={tr("Tema")} stack>
          <ThemeSwitcher className="w-full sm:w-72" />
        </Row>
        <Row icon={Globe} tint="bg-[#007AFF]" label={tr("Bahasa")} hint={tr("Bahasa tampilan web ini. Balasan bot WhatsApp tetap berbahasa Indonesia.")} stack>
          <SegmentedControl<Lang>
            label={tr("Bahasa")}
            value={lang}
            onChange={setLang}
            options={LANGS.map((l) => ({ value: l.value, label: l.label }))}
            className="w-full sm:w-72"
          />
        </Row>
        <Row icon={PanelLeft} tint="bg-[#8E8E93]" label={tr("Sidebar ringkas")} hint={tr("Hanya ikon, untuk layar laptop dan tablet. Bisa juga lewat tombol di atas sidebar.")} className="max-md:hidden">
          <Switch label={tr("Sidebar ringkas")} checked={sidebarCollapsed} onChange={(v) => setSidebarCollapsed("normal", v)} />
        </Row>
      </Group>

      <Group title="WhatsApp">
        <Row icon={Smartphone} tint="bg-[#34C759]" label={tr("Nomor WhatsApp")} onClick={props.onPhoneClick}
          value={props.phoneNumber ? formatPhone(props.phoneNumber) : tr("Belum ada")} />
        {props.isAdmin && (
          <Row icon={MessageCircle} tint="bg-[#30B0C7]" label={tr("Bot WhatsApp")} onClick={props.onBotClick}
            value={
              <span className="inline-flex items-center gap-2">
                <span aria-hidden className={cn("size-2 rounded-full", props.botConnected && !props.botStopped ? "bg-income" : props.botConnected === false || props.botStopped ? "bg-destructive" : "bg-muted-foreground/40")} />
                {botValue}
              </span>
            } />
        )}
      </Group>

      <Group title={tr("Privasi")} footer={tr("Angka yang disembunyikan tampil sebagai Rp ••••••. Menampilkannya lagi meminta password akun.")}>
        <Row icon={EyeOff} tint="bg-[#FF9500]" label={tr("Sembunyikan semua angka")} onClick={hideAll} />
      </Group>

      <Group title="Chart">
        <Row icon={ChartCandlestick} tint="bg-[#FF2D55]" label={tr("Kembalikan tata letak chart")}
          hint={tr("Interval, indikator, panel dan ukuran kembali ke awal. Gambar di chart tetap ada.")}
          onClick={resetChart} value={resetDone ? tr("Selesai") : undefined} />
      </Group>

      <Group title={tr("Akun")}>
        <Row icon={User} tint="bg-[#8E8E93]" label={tr("Email")} value={<span className="block truncate" title={props.email}>{props.email}</span>} />
        <Row icon={LogOut} tint="bg-[#FF3B30]" label={tr("Keluar")} onClick={props.onLogout} danger />
      </Group>
    </div>
  );
}

function Group({ title, footer, children }: { title: string; footer?: string; children: React.ReactNode }) {
  return (
    <section aria-label={title}>
      <h2 className="mb-1.5 px-4 text-[13px] font-normal uppercase tracking-wide text-muted-foreground">{title}</h2>
      {/* Separators start where the text starts (16 + 29 + 12 px), as in iOS */}
      <div className="overflow-hidden rounded-xl bg-card shadow-[0_1px_2px_rgba(0,0,0,0.04)] [&>*]:relative [&>*+*]:before:pointer-events-none [&>*+*]:before:absolute [&>*+*]:before:top-0 [&>*+*]:before:right-0 [&>*+*]:before:left-[57px] [&>*+*]:before:h-px [&>*+*]:before:bg-border [&>*+*]:before:content-['']">
        {children}
      </div>
      {footer && <p className="mt-1.5 px-4 text-[13px] text-muted-foreground">{footer}</p>}
    </section>
  );
}

function Row({ icon: Icon, tint, label, hint, value, onClick, stack, danger, className, children }: {
  icon: React.ElementType;
  /** Background of the icon tile, an Apple system color */
  tint: string;
  label: string;
  hint?: string;
  value?: React.ReactNode;
  onClick?: () => void;
  /** The control goes under the label on phones */
  stack?: boolean;
  /** Red label, no chevron (Keluar) */
  danger?: boolean;
  className?: string;
  children?: React.ReactNode;
}) {
  const body = (
    <>
      <span className={cn("flex size-[29px] shrink-0 items-center justify-center rounded-[7px] text-white", tint)} aria-hidden>
        <Icon className="size-[17px]" strokeWidth={2} />
      </span>
      {/* With a value beside it the label keeps one line; the value gives way (truncates) */}
      <span className={cn("min-w-0", value !== undefined && !hint ? "shrink-0" : "flex-1")}>
        <span className={cn("block text-[15px]", value !== undefined && !hint && "whitespace-nowrap", danger ? "text-destructive" : "text-foreground")}>{label}</span>
        {hint && <span className="mt-0.5 block text-[13px] leading-snug text-muted-foreground">{hint}</span>}
      </span>
    </>
  );
  if (onClick) {
    return (
      <button type="button" onClick={onClick}
        className={cn("flex min-h-11 w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-black/[0.03] active:bg-black/[0.06] dark:hover:bg-white/[0.04] dark:active:bg-white/[0.08]", focusRing, className)}>
        {body}
        {value !== undefined && <span className="min-w-0 flex-1 truncate text-right text-[15px] text-muted-foreground">{value}</span>}
        {!danger && <ChevronRight className="size-4 shrink-0 text-[#C7C7CC] dark:text-[#5A5A5E]" aria-hidden />}
      </button>
    );
  }
  return (
    <div className={cn("flex min-h-11 gap-3 px-4 py-2.5", stack ? "flex-wrap items-center sm:flex-nowrap" : "items-center", className)}>
      <div className={cn("flex min-w-0 flex-1 basis-48 items-center gap-3", stack && hint && "max-sm:items-start")}>{body}</div>
      {value !== undefined && <span className="min-w-0 max-w-[60%] text-right text-[15px] text-muted-foreground">{value}</span>}
      {children && <div className={cn("shrink-0", stack && "max-sm:w-full max-sm:pl-[41px]")}>{children}</div>}
    </div>
  );
}

/** iOS switch: green when on */
function Switch({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}
      className={cn("relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors duration-200", focusRing,
        checked ? "bg-[#34C759] dark:bg-[#30D158]" : "bg-[#E9E9EA] dark:bg-[#39393D]")}>
      <span aria-hidden className={cn("absolute top-[2px] left-[2px] size-[27px] rounded-full bg-white shadow-[0_3px_8px_rgba(0,0,0,0.15),0_3px_1px_rgba(0,0,0,0.06)] transition-transform duration-200 motion-reduce:transition-none",
        checked && "translate-x-5")} />
    </button>
  );
}
