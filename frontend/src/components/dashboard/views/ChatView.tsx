"use client";

import React, { useEffect, useRef, useState } from "react";
import { isAxiosError } from "axios";
import { MessagesSquare, SendHorizontal, Trash2 } from "lucide-react";
import { clearChat, fetchChat, sendChat, type ChatMessage } from "@/lib/api";
import { formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Alert, Card, IconButton, focusRing } from "../../common/ui";
import { ChatSkeleton } from "../skeletons";

const MAX_LENGTH = 500;

const SUGGESTIONS = [
  "Makan siang 25rb pakai BCA",
  "Gaji 5jt masuk ke BCA",
  "Transfer 100rb dari BCA ke GoPay",
  "/rekap",
];

/** WhatsApp-style formatting used by the bot: *bold* and _italic_. */
function BotText({ text }: { text: string }) {
  const parts = text.split(/(\*[^*\n]+\*|_[^_\n]+_)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (/^\*[^*\n]+\*$/.test(part)) return <strong key={i} className="font-semibold">{part.slice(1, -1)}</strong>;
        if (/^_[^_\n]+_$/.test(part)) return <em key={i}>{part.slice(1, -1)}</em>;
        return <React.Fragment key={i}>{part}</React.Fragment>;
      })}
    </>
  );
}

function Bubble({ message, pending }: { message: Pick<ChatMessage, "fromBot" | "text" | "createdAt">; pending?: boolean }) {
  const mine = !message.fromBot;
  return (
    <li className={cn("flex", mine ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed whitespace-pre-wrap break-words sm:max-w-[70%]",
          mine ? "rounded-br-md bg-foreground text-background" : "rounded-bl-md bg-muted text-foreground",
          pending && "opacity-70",
        )}
      >
        <span className="sr-only">{mine ? "Anda: " : "Bot: "}</span>
        {mine ? message.text : <BotText text={message.text} />}
        <span className={cn("mt-1 block text-right text-[11px] tabular-nums", mine ? "text-background/60" : "text-muted-foreground")}>
          {pending ? "Mengirim…" : formatTime(message.createdAt)}
        </span>
      </div>
    </li>
  );
}

function Typing() {
  return (
    <li className="flex justify-start">
      <div className="flex items-center gap-1 rounded-2xl rounded-bl-md bg-muted px-3.5 py-3" role="status" aria-label="Bot sedang membalas">
        {[0, 1, 2].map((i) => (
          <span key={i} className="size-1.5 rounded-full bg-muted-foreground/60 motion-safe:animate-bounce" style={{ animationDelay: `${i * 150}ms` }} aria-hidden />
        ))}
      </div>
    </li>
  );
}

/**
 * Chat with the bot on the web. Same conversation as on WhatsApp (record transactions, /rekap),
 * so it works without a bot number or a linked phone.
 */
export default function ChatView({ onRecorded, onAskClear }: {
  /** Called after every bot reply, so balances and the review badge refresh. */
  onRecorded: () => void;
  /** Asks for confirmation, then runs `clear`. */
  onAskClear: (clear: () => Promise<void>) => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [text, setText] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetchChat()
      .then((list) => { if (!cancelled) setMessages(list); })
      .catch(() => { if (!cancelled) setLoadError(true); });
    return () => { cancelled = true; };
  }, []);

  // Keep the newest message in view
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, pending]);

  // ...also when the list gets shorter, e.g. the phone keyboard opens
  useEffect(() => {
    const el = listRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let lastHeight = el.clientHeight;
    const observer = new ResizeObserver(() => {
      if (el.clientHeight < lastHeight) el.scrollTop = el.scrollHeight;
      lastHeight = el.clientHeight;
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [messages === null]); // eslint-disable-line react-hooks/exhaustive-deps -- attach once the list exists

  // Grow the input with its content (up to about 5 lines)
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [text]);

  const send = async (raw: string) => {
    const value = raw.trim();
    if (!value || pending) return;
    setPending(value);
    setText("");
    setError("");
    try {
      const { message, reply } = await sendChat(value);
      setMessages((prev) => [...(prev ?? []), message, reply]);
      onRecorded();
    } catch (err) {
      setText(value); // nothing is lost: the text goes back into the input
      setError(
        isAxiosError(err) && err.response?.status === 429
          ? "Terlalu banyak pesan dalam satu menit. Tunggu sebentar, lalu kirim lagi."
          : "Pesan gagal terkirim. Periksa koneksi, lalu coba lagi.",
      );
    } finally {
      setPending(null);
      inputRef.current?.focus();
    }
  };

  const clear = async () => {
    await clearChat();
    setMessages([]);
  };

  if (!messages && !loadError) return <ChatSkeleton />;

  const empty = messages?.length === 0 && !pending;
  const tooLong = text.length > MAX_LENGTH;

  return (
    // Phones: full screen between the top bar (3rem) and the bottom tabs (4rem), like a messaging app;
    // while the keyboard is open the tabs hide and the chat reaches down to the keyboard.
    <Card
      className={cn(
        "fixed inset-x-0 top-12 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-20 flex flex-col overflow-hidden rounded-none border-0 p-0 shadow-none",
        "[html[data-keyboard=open]_&]:bottom-0",
        "md:static md:z-auto md:h-[calc(100dvh-11rem)] md:min-h-[420px] md:rounded-2xl md:border md:shadow-sm",
      )}
    >
      <div className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-2.5 md:items-start md:px-5 md:py-3.5">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">Chat dengan bot</h2>
          <p className="mt-0.5 hidden text-xs text-muted-foreground sm:block">
            Sama seperti chat ke bot WhatsApp: catat transaksi, atau ketik <span className="font-medium text-foreground">/rekap</span>.
          </p>
        </div>
        {messages && messages.length > 0 && (
          <IconButton label="Hapus riwayat chat" onClick={() => onAskClear(clear)} disabled={!!pending}>
            <Trash2 className="size-4" />
          </IconButton>
        )}
      </div>

      <div ref={listRef} className="flex-1 overflow-y-auto overscroll-contain px-3 py-4 sm:px-5" aria-live="polite">
        {loadError && <Alert>Gagal memuat riwayat chat. Muat ulang halaman untuk mencoba lagi.</Alert>}
        {empty && (
          <div className="flex h-full flex-col items-center justify-center px-2 text-center">
            <div className="mb-3 flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <MessagesSquare className="size-5" aria-hidden />
            </div>
            <p className="text-sm font-medium text-foreground">Catat keuangan cukup dengan chat</p>
            <p className="mt-1 max-w-sm text-xs text-muted-foreground">
              Tulis seperti biasa, bot yang mengisi jumlah, kategori, dan rekeningnya. Coba salah satu:
            </p>
            <div className="mt-4 flex max-w-md flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" onClick={() => send(s)}
                  className={cn("rounded-full border border-border px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-muted", focusRing)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {!empty && (
          <ul className="space-y-2.5">
            {messages?.map((m) => <Bubble key={m.id} message={m} />)}
            {pending && (
              <>
                <Bubble message={{ fromBot: false, text: pending, createdAt: new Date().toISOString() }} pending />
                <Typing />
              </>
            )}
          </ul>
        )}
      </div>

      <form
        className="border-t border-border/70 bg-card p-2.5 md:p-3"
        onSubmit={(e) => { e.preventDefault(); if (!tooLong) send(text); }}
      >
        {error && <Alert className="mb-2">{error}</Alert>}
        <div className="flex items-end gap-2">
          <label htmlFor="chat-input" className="sr-only">Pesan untuk bot</label>
          <textarea
            id="chat-input"
            ref={inputRef}
            rows={1}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              // Enter sends, Shift+Enter adds a line (not while composing with an IME)
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                if (!tooLong) send(text);
              }
            }}
            placeholder="Contoh: kopi 18rb pakai GoPay"
            aria-invalid={tooLong || undefined}
            aria-describedby={tooLong ? "chat-too-long" : undefined}
            className={cn(
              // 16px on phones: smaller text makes iOS zoom in on focus
              "min-h-10 flex-1 resize-none rounded-xl border border-border bg-background px-3.5 py-2 text-base text-foreground placeholder:text-muted-foreground md:text-sm",
              focusRing,
              tooLong && "border-destructive",
            )}
          />
          <IconButton
            label="Kirim"
            type="submit"
            disabled={!text.trim() || !!pending || tooLong}
            // Keep the focus (and the phone keyboard) in the input when tapping send
            onPointerDown={(e) => e.preventDefault()}
            className="size-10 shrink-0 rounded-xl bg-foreground text-background hover:bg-foreground/90 disabled:opacity-40"
          >
            <SendHorizontal className="size-4" />
          </IconButton>
        </div>
        {tooLong && (
          <p id="chat-too-long" className="mt-1.5 text-xs text-destructive">
            Maksimal {MAX_LENGTH} karakter ({text.length}/{MAX_LENGTH}).
          </p>
        )}
      </form>
    </Card>
  );
}
