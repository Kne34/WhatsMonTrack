"use client";

import { useEffect, useState } from "react";
import { fetchAssetProfile, fetchPriceHistory } from "@/lib/api";
import type { AssetProfile, ChartInterval, PriceHistory } from "@/lib/portfolio";

export const INTRADAY: ChartInterval[] = ["5m", "15m", "1h", "4h"];

/**
 * One cache for the whole chart page: the chart, the statistics (daily bars) and the technical
 * analysis may ask for the same history; it is fetched once and shared.
 */
const histories = new Map<string, { data: PriceHistory; at: number }>();
const profiles = new Map<string, { data: AssetProfile; at: number }>();
const inflight = new Map<string, Promise<unknown>>();
const FRESH_MS = 20_000;

function once<T>(key: string, run: () => Promise<T>): Promise<T> {
  const running = inflight.get(key);
  if (running) return running as Promise<T>;
  const p = run().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

async function history(id: string, interval: ChartInterval) {
  const key = `${id}:${interval}`;
  const hit = histories.get(key);
  if (hit && Date.now() - hit.at < FRESH_MS) return hit.data;
  const data = await once(`h:${key}`, () => fetchPriceHistory(id, interval));
  histories.set(key, { data, at: Date.now() });
  return data;
}

async function profile(id: string) {
  const hit = profiles.get(id);
  if (hit && Date.now() - hit.at < FRESH_MS) return hit.data;
  const data = await once(`p:${id}`, () => fetchAssetProfile(id));
  profiles.set(id, { data, at: Date.now() });
  return data;
}

interface Loaded<T> { key: string; data: T | null; failed: boolean }

function usePolled<T>(key: string, load: () => Promise<T>, cached: () => T | null, every: number): Loaded<T> {
  const [state, setState] = useState<Loaded<T>>(() => ({ key, data: cached(), failed: false }));
  useEffect(() => {
    let cancelled = false;
    const hit = cached();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- show what is cached for the new key right away
    if (hit) setState({ key, data: hit, failed: false });
    const run = () =>
      load()
        .then((data) => { if (!cancelled) setState({ key, data, failed: false }); })
        .catch(() => { if (!cancelled) setState((s) => (s.key === key ? { ...s, failed: true } : { key, data: null, failed: true })); });
    run();
    const timer = setInterval(() => document.visibilityState === "visible" && run(), every);
    return () => { cancelled = true; clearInterval(timer); };
    // `key` identifies what load/cached fetch
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, every]);
  return state.key === key ? state : { key, data: cached(), failed: false };
}

/** Price history of a holding at one interval; intraday bars are refreshed every minute, others every 5 minutes */
export function useHistory(id: string, interval: ChartInterval) {
  const key = `${id}:${interval}`;
  return usePolled(key, () => history(id, interval), () => histories.get(key)?.data ?? null, INTRADAY.includes(interval) ? 60_000 : 5 * 60_000);
}

export function useProfile(id: string) {
  return usePolled(id, () => profile(id), () => profiles.get(id)?.data ?? null, 60_000);
}
