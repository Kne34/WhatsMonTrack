"use client";

import React, { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Loader2 } from "lucide-react";
import { fetchPhoneStatus, startPhoneLink, unlinkPhone, type PhoneLinkInfo, type PhoneStatus } from "@/lib/api";
import { formatPhone, formatTime } from "@/lib/format";
import { Alert, Button, TextField, buttonClass } from "../../common/ui";
import { AppDialog } from "../dialogs";

import { tr } from "@/lib/i18n";
interface LinkWhatsAppModalProps {
  isOpen: boolean;
  onClose: () => void;
  status: PhoneStatus | null;
  /** Called after the number was linked or unlinked, so the dashboard can refresh. */
  onChanged: () => void;
}

function apiError(err: unknown, fallback: string): string {
  const msg = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
  if (Array.isArray(msg)) return msg.join(". ");
  return msg || fallback;
}

/**
 * Links the user's WhatsApp number: the user scans a wa.me QR code (or opens the link on their phone),
 * which opens a chat with the bot pre-filled with "VERIFIKASI <code>", and presses Send.
 * The bot sees the real sender number, which proves ownership. Entering the number first is optional.
 * Mounted only while open (see Dashboard), so state always starts fresh.
 */
export default function LinkWhatsAppModal({ isOpen, onClose, status, onChanged }: LinkWhatsAppModalProps) {
  const [phoneInput, setPhoneInput] = useState("");
  const [link, setLink] = useState<PhoneLinkInfo | null>(status?.pending ?? null);
  const [linkedPhone, setLinkedPhone] = useState<string | null>(null); // set when linking just succeeded
  const [changing, setChanging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // While a code is shown, poll until the bot confirms it. The code disappearing *before* it expires
  // means it was used; after expiry it just lapsed (important when changing an already linked number).
  useEffect(() => {
    if (!isOpen || !link) return;
    const expiresAt = new Date(link.expiresAt).getTime();
    const interval = setInterval(async () => {
      if (Date.now() >= expiresAt) {
        setLink(null);
        setError(tr("Kode sudah kedaluwarsa. Buat QR baru."));
        return;
      }
      try {
        const s = await fetchPhoneStatus();
        if (!s.pending && s.phoneNumber) {
          setLinkedPhone(s.phoneNumber);
          setLink(null);
          onChanged();
        }
      } catch {
        // transient errors: keep polling
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [isOpen, link, onChanged]);

  const handleStart = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setBusy(true);
    setError("");
    try {
      setLink(await startPhoneLink(phoneInput.trim() || undefined));
    } catch (err) {
      setError(apiError(err, tr("Gagal membuat kode. Coba lagi.")));
    } finally {
      setBusy(false);
    }
  };

  const handleUnlink = async () => {
    setBusy(true);
    setError("");
    try {
      await unlinkPhone();
      onChanged();
      onClose();
    } catch (err) {
      setError(apiError(err, tr("Gagal memutuskan nomor. Coba lagi.")));
    } finally {
      setBusy(false);
    }
  };

  const currentPhone = linkedPhone ?? status?.phoneNumber ?? null;
  const showForm = !link && !linkedPhone && (!currentPhone || changing);

  return (
    <AppDialog open={isOpen} onClose={onClose} title={tr("Hubungkan WhatsApp")}
      description={tr("Catat transaksi cukup dengan chat ke bot WhatsMonTrack dari nomor ini.")}>
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}

        {/* Just linked */}
        {linkedPhone && (
          <>
            <Alert tone="info">{tr("Berhasil. Nomor")} <span className="font-medium">{formatPhone(linkedPhone)}</span> {tr("sudah terhubung.")}</Alert>
            <Button className="w-full" size="lg" onClick={onClose}>{tr("Selesai")}</Button>
          </>
        )}

        {/* Already linked */}
        {!linkedPhone && !link && currentPhone && !changing && (
          <>
            <div className="rounded-xl border border-border px-3.5 py-3">
              <p className="text-xs text-muted-foreground">{tr("Nomor terhubung")}</p>
              <p className="mt-0.5 text-sm font-medium text-foreground">{formatPhone(currentPhone)}</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={() => setChanging(true)} disabled={busy}>{tr("Ganti nomor")}</Button>
              <Button variant="danger" onClick={handleUnlink} loading={busy}>{tr("Putuskan")}</Button>
            </div>
          </>
        )}

        {/* Step 1: optional number, then create the QR */}
        {showForm && status && !status.botConnected && (
          <>
            <Alert tone="info">
              {tr("Bot WhatsApp sedang offline, jadi nomor belum bisa dihubungkan. Hubungi admin untuk menghubungkan bot terlebih dahulu. Sementara itu, catat transaksi lewat tab Chat di web.")}
            </Alert>
            <Button variant="secondary" className="w-full" onClick={onClose}>{tr("Tutup")}</Button>
          </>
        )}

        {showForm && (!status || status.botConnected) && (
          <form onSubmit={handleStart} className="space-y-4">
            <TextField
              label={tr("Nomor WhatsApp (opsional)")}
              type="tel"
              autoComplete="tel"
              inputMode="tel"
              value={phoneInput}
              onChange={(e) => setPhoneInput(e.target.value)}
              placeholder="0812 3456 7890"
              hint={tr("Isi agar kode hanya bisa dipakai dari nomor ini. Boleh dikosongkan.")}
            />
            <Button type="submit" size="lg" className="w-full" loading={busy}>{tr("Buat QR")}</Button>
            {changing && (
              <Button variant="ghost" className="w-full" onClick={() => setChanging(false)}>{tr("Batal")}</Button>
            )}
          </form>
        )}

        {/* Step 2: scan and send */}
        {link && (
          <>
            <div className="flex justify-center">
              <div className="rounded-2xl border border-border bg-white p-4">
                <QRCodeSVG value={link.waLink} size={200} />
              </div>
            </div>
            <ol className="list-decimal space-y-1.5 pl-5 text-sm text-foreground">
              <li>{tr("Scan QR dengan kamera HP")}{link.pendingPhone ? tr(" bernomor {pendingPhone}", { pendingPhone: formatPhone(link.pendingPhone) }) : ""}.</li>
              <li>{tr("WhatsApp terbuka dengan pesan yang sudah terisi.")}</li>
              <li>{tr("Tekan")} <span className="font-medium">{tr("Kirim")}</span>.</li>
            </ol>
            <p className="text-xs text-muted-foreground">
              {tr("Atau kirim pesan")} <span className="font-medium text-foreground">{link.message}</span> {tr("ke")}{" "}
              <span className="font-medium text-foreground">{formatPhone(link.botPhone)}</span>{tr(". Berlaku sampai")} {formatTime(link.expiresAt)}.
            </p>
            {/* For users already on their phone, where scanning their own screen isn't possible */}
            <a href={link.waLink} target="_blank" rel="noopener noreferrer" className={buttonClass("secondary", "lg", "w-full")}>
              {tr("Buka WhatsApp")}
            </a>
            <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground" role="status">
              <Loader2 className="size-3.5 animate-spin" aria-hidden /> {tr("Menunggu pesan dari WhatsApp")}
            </p>
            <Button variant="ghost" className="w-full" onClick={() => setLink(null)}>{tr("Ganti nomor atau buat kode baru")}</Button>
          </>
        )}
      </div>
    </AppDialog>
  );
}
