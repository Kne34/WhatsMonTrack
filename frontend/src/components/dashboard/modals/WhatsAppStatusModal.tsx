"use client";

import React, { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Loader2 } from "lucide-react";
import {
  fetchWhatsAppStatus, resetWhatsAppSession, startWhatsAppBot, stopWhatsAppBot, type WhatsAppStatus,
} from "@/lib/api";
import { formatPhone } from "@/lib/format";
import { Alert, Button } from "../../common/ui";
import { AppDialog } from "../dialogs";

type Action = "change" | "stop";

const DESCRIPTION: Record<WhatsAppStatus["state"], string> = {
  connected: "Bot terhubung dan siap menerima pesan.",
  waiting_qr: "Bot belum terhubung ke WhatsApp.",
  connecting: "Menghubungkan bot ke WhatsApp…",
  stopped: "Nomor bot dicabut. Bot tidak menerima pesan.",
};

const CONFIRM: Record<Action, { text: string; button: string; fallback: string }> = {
  change: {
    text: "Bot dikeluarkan dari nomor ini (hilang dari Perangkat tertaut di HP tersebut), lalu QR baru dibuat untuk menautkan nomor lain. Bot tidak menerima pesan sampai QR di-scan.",
    button: "Keluarkan & buat QR",
    fallback: "Gagal mengganti nomor bot. Coba lagi.",
  },
  stop: {
    text: "Bot dikeluarkan dari nomor ini dan dimatikan, juga setelah server restart. Selama itu pengguna tidak bisa mencatat lewat WhatsApp. Data tidak terhapus.",
    button: "Cabut nomor bot",
    fallback: "Gagal mencabut nomor bot. Coba lagi.",
  },
};

/** Shared bot connection. Admins link, change or unlink the bot number here; everyone else only sees the status. */
export default function WhatsAppStatusModal({ status, onClose, onChanged }: {
  status: WhatsAppStatus | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [live, setLive] = useState<WhatsAppStatus | null>(status);
  const [confirm, setConfirm] = useState<Action | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const state = live?.state ?? (live?.connected ? "connected" : "connecting");
  const canManage = live?.canManage ?? false;

  // While connecting or waiting for a scan, refresh often: the QR code rotates about every 20 seconds
  useEffect(() => {
    if (state === "connected" || state === "stopped") return;
    const interval = setInterval(async () => {
      try {
        const next = await fetchWhatsAppStatus();
        setLive(next);
        if (next.connected) onChanged();
      } catch { /* keep polling */ }
    }, 2000);
    return () => clearInterval(interval);
  }, [state, onChanged]);

  const run = async (action: () => Promise<unknown>, fallback: string) => {
    setBusy(true);
    setError("");
    try {
      await action();
      setLive(await fetchWhatsAppStatus());
      setConfirm(null);
      onChanged();
    } catch {
      setError(fallback);
    } finally {
      setBusy(false);
    }
  };

  const confirmAction = (action: Action) =>
    run(action === "stop" ? stopWhatsAppBot : resetWhatsAppSession, CONFIRM[action].fallback);

  return (
    <AppDialog open onClose={onClose} title="Bot WhatsApp" description={DESCRIPTION[state]}>
      {error && <Alert>{error}</Alert>}

      {!canManage && state !== "connected" && (
        <Alert tone="info">Hubungi admin untuk menghubungkan bot kembali.</Alert>
      )}

      {/* Linked: show the number, offer to change or unlink it */}
      {canManage && state === "connected" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-border px-3.5 py-3">
            <p className="text-xs text-muted-foreground">Nomor bot</p>
            <p className="mt-0.5 text-sm font-medium text-foreground">
              {live?.botPhone ? formatPhone(live.botPhone) : "Terhubung"}
            </p>
          </div>
          {!confirm && (
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={() => setConfirm("change")}>Ganti nomor bot</Button>
              <Button variant="danger" onClick={() => setConfirm("stop")}>Cabut nomor bot</Button>
            </div>
          )}
        </div>
      )}

      {/* Not linked yet: scan the QR */}
      {canManage && (state === "waiting_qr" || state === "connecting") && (
        <div className="space-y-4">
          <ol className="list-decimal space-y-1 pl-5 text-sm text-foreground">
            <li>Buka WhatsApp di HP nomor bot.</li>
            <li>Masuk ke <span className="font-medium">Perangkat tertaut</span>, lalu <span className="font-medium">Tautkan perangkat</span>.</li>
            <li>Scan QR di bawah. QR diperbarui otomatis.</li>
          </ol>
          <div className="flex justify-center">
            <div className="flex size-60 items-center justify-center rounded-2xl border border-border bg-white p-4">
              {live?.qr ? (
                <QRCodeSVG value={live.qr} size={208} />
              ) : (
                <span className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> Menyiapkan QR…
                </span>
              )}
            </div>
          </div>
          {!confirm && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/70 pt-4">
              <p className="text-xs text-muted-foreground">QR tidak muncul, atau bot tidak dipakai dulu?</p>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => setConfirm("stop")}>Matikan bot</Button>
                <Button variant="secondary" size="sm" onClick={() => setConfirm("change")}>Reset sesi</Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Unlinked on purpose */}
      {canManage && state === "stopped" && (
        <div className="space-y-4">
          <Alert tone="info">
            Pengguna tidak bisa mencatat lewat WhatsApp sampai bot dihubungkan lagi. Data tetap aman.
          </Alert>
          <Button className="w-full" size="lg" loading={busy} onClick={() => run(startWhatsAppBot, "Gagal menghubungkan bot. Coba lagi.")}>
            Hubungkan bot
          </Button>
        </div>
      )}

      {/* Confirmation for change / unlink */}
      {canManage && confirm && (
        <div className="space-y-3 border-t border-border/70 pt-4">
          <p className="text-sm text-foreground">{CONFIRM[confirm].text}</p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setConfirm(null)} disabled={busy}>Batal</Button>
            <Button variant="danger" size="sm" onClick={() => confirmAction(confirm)} loading={busy}>
              {CONFIRM[confirm].button}
            </Button>
          </div>
        </div>
      )}
    </AppDialog>
  );
}
