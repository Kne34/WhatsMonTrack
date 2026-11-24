"use client";

import React, { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { formatDayMonth } from "@/lib/format";
import { fetchTrades, type HoldingInput } from "@/lib/api";
import {
  ASSET_TYPE_LABEL, ASSET_TYPES, PLATFORM_SUGGESTIONS, avgAfterBuy, formatMoney, formatQuantity, formatSigned, parseDecimal,
  quantityUnit, unitsPerQuantity, type AssetType, type Currency, type Holding, type Trade, type TradeSide,
} from "@/lib/portfolio";
import { Alert, Button, SegmentedControl, Skeleton, TextField } from "../common/ui";
import { AppDialog, DialogActions, useSubmit } from "./dialogs";

import { tr } from "@/lib/i18n";
const currencyPrefix = (c: Currency) => (c === "USD" ? "$" : tr("Rp"));

/** "Harga per lembar" for stocks, "per koin" for crypto */
const priceLabel = (type: AssetType) => (type === "CRYPTO" ? tr("per koin") : tr("per lembar"));

/** Number input that accepts "0,025" as well as "0.025" (fractional shares and coins). */
function DecimalField({ label, value, onChange, error, hint, prefix, suffix, integer, autoFocus }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  hint?: React.ReactNode;
  prefix?: string;
  suffix?: string;
  integer?: boolean;
  autoFocus?: boolean;
}) {
  return (
    <TextField
      label={label}
      prefix={prefix}
      inputMode={integer ? "numeric" : "decimal"}
      autoComplete="off"
      autoFocus={autoFocus}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(integer ? /[^\d]/g : /[^\d.,]/g, ""))}
      placeholder="0"
      error={error}
      hint={hint}
      trailing={suffix ? <span className="pr-3 text-sm text-muted-foreground">{suffix}</span> : undefined}
    />
  );
}

/** Raw number -> text for an input, without thousand separators ("0.025" -> "0,025") */
const toInput = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? "" : String(Number(n.toFixed(10))).replace(".", ","));

// ---------- Add / edit a holding ----------

export function InvestmentDialog({ holding, platforms, onClose, onSave, onDelete }: {
  holding: Holding | null;
  /** Platforms the user already uses, suggested first */
  platforms: string[];
  onClose: () => void;
  onSave: (input: HoldingInput) => Promise<void>;
  onDelete?: () => void;
}) {
  const editing = !!holding;
  const [type, setType] = useState<AssetType>(holding?.assetType ?? "IDX_STOCK");
  const [symbol, setSymbol] = useState(holding?.symbol ?? "");
  const [name, setName] = useState(holding?.name ?? "");
  const [platform, setPlatform] = useState(holding?.platform ?? platforms[0] ?? "");
  const [currency, setCurrency] = useState<Currency>(holding?.currency ?? "USD");
  const [quantity, setQuantity] = useState(toInput(holding?.quantity));
  const [avgPrice, setAvgPrice] = useState(toInput(holding?.avgPrice));
  const [coingeckoId, setCoingeckoId] = useState(holding?.coingeckoId ?? "");
  const [note, setNote] = useState(holding?.note ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { busy, error, submit } = useSubmit();

  const idx = type === "IDX_STOCK";
  const cur: Currency = idx ? "IDR" : currency;
  const q = parseDecimal(quantity);
  const p = parseDecimal(avgPrice);
  const cost = q > 0 && p >= 0 ? q * unitsPerQuantity(type) * p : null;
  const suggestions = [...new Set([...platforms, ...PLATFORM_SUGGESTIONS])];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!symbol.trim()) errs.symbol = tr("Isi ticker-nya, misalnya BBCA, AAPL, atau BTC.");
    if (!platform.trim()) errs.platform = tr("Isi platformnya, misalnya Stockbit atau Pluang.");
    if (!(q > 0)) errs.quantity = tr("Masukkan jumlah lebih dari 0.");
    else if (idx && !Number.isInteger(q)) errs.quantity = tr("Saham Indonesia dihitung dalam lot (bilangan bulat).");
    if (!(p >= 0)) errs.avgPrice = tr("Masukkan harga beli rata-rata.");
    if (coingeckoId && !/^[a-z0-9-]+$/.test(coingeckoId.trim())) errs.coingeckoId = tr("Hanya huruf kecil, angka, dan tanda minus.");
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const ok = await submit(() =>
      onSave({
        assetType: type,
        symbol: symbol.trim(),
        name: name.trim(),
        platform: platform.trim(),
        currency: cur,
        quantity: q,
        avgPrice: p,
        coingeckoId: type === "CRYPTO" && coingeckoId.trim() ? coingeckoId.trim() : undefined,
        note: note.trim(),
      }),
    );
    if (ok) onClose();
  };

  return (
    <AppDialog open onClose={onClose} title={editing ? tr("Ubah {symbol}", { symbol: holding.symbol }) : tr("Tambah aset investasi")}
      description={editing ? tr("Koreksi langsung. Untuk beli atau jual, pakai tombol Beli/Jual agar tercatat di riwayat.") : tr("Saldo rekening tidak berubah.")}>
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        {error && <Alert>{error}</Alert>}
        {!editing && (
          <SegmentedControl<AssetType> label={tr("Jenis aset")} value={type} onChange={setType} className="flex w-full"
            options={ASSET_TYPES.map((t) => ({ value: t, label: ASSET_TYPE_LABEL[t] }))} />
        )}
        <div className="grid grid-cols-2 gap-3">
          <TextField label={tr("Ticker")} value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} maxLength={20}
            placeholder={idx ? "BBCA" : type === "US_STOCK" ? "NVDA" : "BTC"} autoComplete="off" autoCapitalize="characters"
            disabled={editing} error={errors.symbol} autoFocus={!editing} />
          <TextField label={tr("Platform")} value={platform} onChange={(e) => setPlatform(e.target.value)} maxLength={40}
            placeholder={tr("Stockbit")} list="wmt-platforms" autoComplete="off" error={errors.platform} />
          <datalist id="wmt-platforms">{suggestions.map((s) => <option key={s} value={s} />)}</datalist>
        </div>
        <TextField label={tr("Nama (opsional)")} value={name} onChange={(e) => setName(e.target.value)} maxLength={100}
          placeholder={idx ? tr("Bank Central Asia") : type === "US_STOCK" ? "NVIDIA" : tr("Bitcoin")}
          hint={editing ? undefined : tr("Kosongkan, nanti diisi otomatis dari data pasar.")} />
        {!idx && (
          <SegmentedControl<Currency> label={tr("Mata uang harga beli")} value={currency} onChange={setCurrency} className="flex w-full"
            options={[{ value: "USD", label: tr("Dibeli dalam USD") }, { value: "IDR", label: tr("Dibeli dalam Rupiah") }]} />
        )}
        <div className="grid grid-cols-2 gap-3">
          <DecimalField label={tr("Jumlah")} value={quantity} onChange={setQuantity} integer={idx} suffix={quantityUnit(type)} error={errors.quantity}
            hint={idx ? "1 lot = 100 lembar" : tr("Boleh desimal, misal 0,025")} />
          <DecimalField label={tr("Harga rata-rata {type}", { type: priceLabel(type) })} value={avgPrice} onChange={setAvgPrice} prefix={currencyPrefix(cur)}
            error={errors.avgPrice} />
        </div>
        {type === "CRYPTO" && (
          <TextField label={tr("ID CoinGecko (opsional)")} value={coingeckoId} onChange={(e) => setCoingeckoId(e.target.value.toLowerCase())}
            maxLength={100} placeholder="bitcoin" autoComplete="off" error={errors.coingeckoId}
            hint={tr("Biasanya otomatis. Isi kalau ticker-nya dipakai beberapa koin (lihat URL di coingecko.com).")} />
        )}
        <TextField label={tr("Catatan (opsional)")} value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />
        {cost != null && (
          <p className="rounded-xl bg-muted px-3.5 py-2.5 text-sm text-muted-foreground">
            {tr("Modal:")} <span className="font-medium text-foreground tabular-nums">{formatMoney(cost, cur)}</span>
            {idx && <> ({formatQuantity(q * 100)} {tr("lembar)")}</>}
          </p>
        )}
        <DialogActions>
          {editing && onDelete && <Button variant="danger" onClick={onDelete} className="sm:mr-auto" disabled={busy}>{tr("Hapus")}</Button>}
          <Button variant="secondary" onClick={onClose} disabled={busy}>{tr("Batal")}</Button>
          <Button type="submit" loading={busy}>{editing ? tr("Simpan") : tr("Tambah aset")}</Button>
        </DialogActions>
      </form>
    </AppDialog>
  );
}

// ---------- Buy / sell, with the history ----------

const todayInput = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export function TradeDialog({ holding, livePrice, initialSide = "BUY", onClose, onSave }: {
  holding: Holding;
  /** Current price in the holding's currency, to prefill the price */
  livePrice: number | null;
  initialSide?: TradeSide;
  onClose: () => void;
  onSave: (input: { side: TradeSide; quantity: number; price: number; tradedAt?: string; note?: string }) => Promise<void>;
}) {
  const [side, setSide] = useState<TradeSide>(holding.quantity > 0 ? initialSide : "BUY");
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState(toInput(livePrice != null ? Number(livePrice.toPrecision(8)) : null));
  const [date, setDate] = useState(todayInput());
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [history, setHistory] = useState<Trade[] | null>(null);
  const { busy, error, submit } = useSubmit();

  useEffect(() => {
    let alive = true;
    fetchTrades(holding.id).then((t) => alive && setHistory(t)).catch(() => alive && setHistory([]));
    return () => { alive = false; };
  }, [holding.id]);

  const type = holding.assetType;
  const idx = type === "IDX_STOCK";
  const cur = holding.currency;
  const q = parseDecimal(quantity);
  const p = parseDecimal(price);
  const valid = q > 0 && p >= 0;
  const units = unitsPerQuantity(type);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!(q > 0)) errs.quantity = tr("Masukkan jumlah lebih dari 0.");
    else if (idx && !Number.isInteger(q)) errs.quantity = tr("Dalam lot (bilangan bulat).");
    else if (side === "SELL" && q > holding.quantity + 1e-9) errs.quantity = tr("Maksimal {quantity} {type}.", { quantity: formatQuantity(holding.quantity), type: quantityUnit(type) });
    if (!(p >= 0)) errs.price = tr("Masukkan harganya.");
    setErrors(errs);
    if (Object.keys(errs).length) return;
    // Noon local time, so the date stays the same in every time zone
    const tradedAt = date ? new Date(`${date}T12:00:00`).toISOString() : undefined;
    if (await submit(() => onSave({ side, quantity: q, price: p, tradedAt, note: note.trim() }))) onClose();
  };

  return (
    <AppDialog open onClose={onClose} title={tr("{symbol} di {platform}", { symbol: holding.symbol, platform: holding.platform })}
      description={tr("Punya {quantity} {type}, rata-rata {avgPrice} {type2}.", { quantity: formatQuantity(holding.quantity), type: quantityUnit(type), avgPrice: formatMoney(holding.avgPrice, cur), type2: priceLabel(type) })}>
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <SegmentedControl<TradeSide> label={tr("Beli atau jual")} value={side} onChange={setSide} className="flex w-full"
          options={[{ value: "BUY", label: tr("Beli") }, ...(holding.quantity > 0 ? [{ value: "SELL" as const, label: tr("Jual") }] : [])]} />
        <div className="grid grid-cols-2 gap-3">
          <DecimalField label={tr("Jumlah")} value={quantity} onChange={setQuantity} integer={idx} suffix={quantityUnit(type)}
            error={errors.quantity} autoFocus />
          <DecimalField label={tr("Harga {type}", { type: priceLabel(type) })} value={price} onChange={setPrice} prefix={currencyPrefix(cur)} error={errors.price}
            hint={livePrice != null ? tr("Terisi harga pasar saat ini") : undefined} />
        </div>
        {/* Stacked on phones: a date input needs its full width */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <TextField label={tr("Tanggal")} type="date" value={date} onChange={(e) => setDate(e.target.value)} max={todayInput()} />
          <TextField label={tr("Catatan (opsional)")} value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />
        </div>
        {valid && (
          <p className="rounded-xl bg-muted px-3.5 py-2.5 text-sm text-muted-foreground">
            {side === "BUY" ? (
              <>{tr("Total")} {formatMoney(q * units * p, cur)}{tr(", rata-rata baru")}{" "}
                <span className="font-medium text-foreground tabular-nums">{formatMoney(avgAfterBuy(holding.quantity, holding.avgPrice, q, p), cur)}</span></>
            ) : (
              <>{tr("Total")} {formatMoney(q * units * p, cur)}{tr(", untung/rugi")}{" "}
                <span className={cn("font-medium tabular-nums", p >= holding.avgPrice ? "text-income" : "text-expense")}>
                  {formatSigned((p - holding.avgPrice) * q * units, cur)}
                </span></>
            )}
          </p>
        )}
        <DialogActions>
          <Button variant="secondary" onClick={onClose} disabled={busy}>{tr("Batal")}</Button>
          <Button type="submit" loading={busy}>{side === "BUY" ? tr("Catat pembelian") : tr("Catat penjualan")}</Button>
        </DialogActions>
      </form>

      <div className="border-t border-border/70 pt-4">
        <h3 className="text-sm font-semibold text-foreground">{tr("Riwayat")}</h3>
        {history == null ? (
          <div className="mt-3 space-y-2"><Skeleton className="h-4 rounded-md" /><Skeleton className="h-4 w-2/3 rounded-md" /></div>
        ) : history.length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">{tr("Belum ada riwayat.")}</p>
        ) : (
          <ul className="mt-2 divide-y divide-border/70">
            {history.map((t) => (
              <li key={t.id} className="flex items-start justify-between gap-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="text-foreground">
                    <span className={cn("font-medium", t.side === "BUY" ? "text-foreground" : "text-expense")}>{t.side === "BUY" ? tr("Beli") : tr("Jual")}</span>{" "}
                    {formatQuantity(t.quantity)} {quantityUnit(type)} @ {formatMoney(t.price, cur)}
                  </p>
                  <p className="text-xs text-muted-foreground">{formatDayMonth(t.tradedAt)} {new Date(t.tradedAt).getFullYear()}{t.note ? `, ${t.note}` : ""}</p>
                </div>
                {t.realizedPnl != null && (
                  <span className={cn("shrink-0 text-xs font-medium tabular-nums", t.realizedPnl >= 0 ? "text-income" : "text-expense")}>
                    {formatSigned(t.realizedPnl, cur)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppDialog>
  );
}
