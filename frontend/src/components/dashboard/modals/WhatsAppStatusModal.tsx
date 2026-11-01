"use client";

import React, { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Loader2 } from "lucide-react";
import { fetchWhatsAppStatus, resetWhatsAppSession } from "@/lib/api";
import { Alert, Button } from "../../common/ui";
import { AppDialog } from "../dialogs";

type WaStatus = { connected: boolean; qr: string; canManage?: boolean };

/** Shared bot connection. Admins scan the QR here; everyone else only sees the status. */
export default function WhatsAppStatusModal({ status, onClose, onChanged }: {
  status: WaStatus | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [live, setLive] = useState<WaStatus | null>(status);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState("");

  // While waiting for a scan, refresh often: the QR code rotates about every 20 seconds
  useEffect(() => {
    if (live?.connected) return;
    const interval = setInterval(async () => {
      try {
        const next = await fetchWhatsAppStatus();
        setLive(next);
        if (next.connected) onChanged();
      } catch { /* keep polling */ }
    }, 2000);
    return () => clearInterval(interval);
  }, [live?.connected, onChanged]);

  const handleReset = async () => {
    setResetting(true);
    setError("");
    try {
      await resetWhatsAppSession();
      setLive({ connected: false, qr: "", canManage: live?.canManage });
      setConfirmReset(false);
      onChanged();
    } catch {
      setError("Gagal mereset sesi. Coba lagi.");
    } finally {
      setResetting(false);
    }
  };

  const canManage = live?.canManage ?? false;

  return (
    <AppDialog open onClose={onClose} title="Bot WhatsApp"
      description={live?.connected ? "Bot terhubung dan siap menerima pesan." : "Bot sedang tidak terhubung ke WhatsApp."}>
      {error && <Alert>{error}</Alert>}

      {!canManage && !live?.connected && (
        <Alert tone="info">Hubungi admin untuk menghubungkan bot kembali.</Alert>
      )}

      {canManage && !live?.connected && (
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
                  <Loader2 className="size-4 animate-spin" aria-hidden /> Menyiapkan QR…
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {canManage && (
        <div className="border-t border-border/70 pt-4">
          {confirmReset ? (
            <div className="space-y-3">
              <p className="text-sm text-foreground">
                Sesi bot akan diputus dan QR baru dibuat. Bot tidak menerima pesan sampai QR di-scan lagi.
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="secondary" size="sm" onClick={() => setConfirmReset(false)} disabled={resetting}>Batal</Button>
                <Button variant="danger" size="sm" onClick={handleReset} loading={resetting}>Putuskan & reset</Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">QR tidak muncul, atau ingin ganti nomor bot?</p>
              <Button variant="secondary" size="sm" onClick={() => setConfirmReset(true)}>Reset sesi</Button>
            </div>
          )}
        </div>
      )}
    </AppDialog>
  );
}
