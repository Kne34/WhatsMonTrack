"use client";

import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { forgotPassword, getProfile, login, register, resetPassword, verifyOtp } from '@/lib/api';
import Dashboard from './Dashboard';
import { Alert, Button, PasswordField, TextField } from './common/ui';
import { AppShellSkeleton } from './dashboard/skeletons';
import { ALL_TABS, type Tab } from './dashboard/shared/Navigation';
import { ThemeSwitcher } from './theme';

import { setLang, tr, useLang } from "@/lib/i18n";
export interface SessionUser {
  id: string;
  email: string;
  phoneNumber: string | null;
  isAdmin: boolean;
}

type Mode = 'LOGIN' | 'REGISTER' | 'VERIFY' | 'FORGOT' | 'RESET';

const RESEND_COOLDOWN_SECONDS = 60;

/** The user's IANA zone (e.g. Asia/Jakarta): the server uses it for day/month boundaries. */
function browserTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** API errors may carry a string or (from validation) an array of strings. */
function errorMessage(err: unknown): string {
  const msg = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
  if (Array.isArray(msg)) return msg.join('. ');
  return msg || tr("Tidak dapat terhubung ke server. Periksa koneksi Anda.");
}

const COPY: Record<Mode, { title: string; subtitle: string }> = {
  LOGIN: { get title() { return tr("Masuk"); }, get subtitle() { return tr("Lanjutkan mencatat keuangan Anda."); } },
  REGISTER: { get title() { return tr("Buat akun"); }, get subtitle() { return tr("Catat pemasukan dan pengeluaran cukup lewat chat WhatsApp."); } },
  VERIFY: { get title() { return tr("Verifikasi email"); }, subtitle: '' },
  FORGOT: { get title() { return tr("Lupa password"); }, get subtitle() { return tr("Masukkan email akun Anda. Kami akan mengirim kode untuk membuat password baru."); } },
  RESET: { get title() { return tr("Buat password baru"); }, subtitle: '' },
};

export default function AuthWrapper() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  // True while a saved session is being restored: only then is the dashboard frame shown as a placeholder
  const [restoring, setRestoring] = useState(false);
  const tabParam = useSearchParams().get('tab');
  const tab: Tab = ALL_TABS.find((id) => id === tabParam) ?? 'dashboard';
  const [mode, setMode] = useState<Mode>('LOGIN');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string; code?: string }>({});
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [needsVerification, setNeedsVerification] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  const checkAuth = useCallback(async () => {
    try {
      if (localStorage.getItem('token')) {
        setRestoring(true);
        setUser(await getProfile());
      }
    } catch {
      localStorage.removeItem('token');
    } finally {
      setLoading(false);
      setRestoring(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time session restore from localStorage (browser-only)
    checkAuth();
  }, [checkAuth]);

  // Countdown for "Kirim ulang kode"
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const go = (next: Mode) => {
    setMode(next);
    setError('');
    setNotice('');
    setFieldErrors({});
    setNeedsVerification(false);
    if (next === 'VERIFY' || next === 'RESET') setCode('');
  };

  const signedIn = async (token: string) => {
    localStorage.setItem('token', token);
    setLoading(true);
    await checkAuth();
  };

  /** Client-side checks so obvious mistakes are shown next to the field, before a round trip. */
  const validate = (fields: { email?: boolean; password?: 'any' | 'new'; code?: boolean }) => {
    const errs: typeof fieldErrors = {};
    if (fields.email && !EMAIL_RE.test(email.trim())) errs.email = tr("Masukkan alamat email yang valid.");
    if (fields.password === 'any' && !password) errs.password = tr("Masukkan password Anda.");
    if (fields.password === 'new' && password.length < 8) errs.password = tr("Password minimal 8 karakter.");
    if (fields.code && !/^\d{6}$/.test(code)) errs.code = tr("Masukkan 6 digit kode.");
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const run = async (action: () => Promise<void>) => {
    setIsSubmitting(true);
    setError('');
    try {
      await action();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate({ email: true, password: 'any' })) return;
    setNeedsVerification(false);
    run(async () => {
      const res = await login({ email: email.trim(), password, timeZone: browserTimeZone() });
      if (res.success) return signedIn(res.token);
      setError(res.message || tr("Email atau password salah."));
      setNeedsVerification(res.reason === 'EMAIL_NOT_VERIFIED');
    });
  };

  const sendVerificationCode = () =>
    run(async () => {
      const res = await register({ email: email.trim(), password, timeZone: browserTimeZone() });
      if (!res.success) return setError(res.message || tr("Gagal mengirim kode."));
      setMode('VERIFY');
      setFieldErrors({});
      setNeedsVerification(false);
      setCode('');
      setNotice(tr("Kode dikirim ke {email}. Cek juga folder Spam.", { email: email.trim() }));
      setResendIn(RESEND_COOLDOWN_SECONDS);
    });

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate({ email: true, password: 'new' })) return;
    sendVerificationCode();
  };

  const submitVerify = (value: string) =>
    run(async () => {
      const res = await verifyOtp({ email: email.trim(), otpCode: value });
      if (res.success) return signedIn(res.token);
      setError(res.message || tr("Kode salah."));
    });

  const handleVerify = (e: React.FormEvent) => {
    e.preventDefault();
    if (validate({ code: true })) submitVerify(code);
  };

  const sendResetCode = () =>
    run(async () => {
      const res = await forgotPassword(email.trim());
      if (!res.success) return setError(res.message || tr("Gagal mengirim kode."));
      setMode('RESET');
      setFieldErrors({});
      setCode('');
      setPassword('');
      setNotice(res.message || tr("Jika email terdaftar, kode reset telah dikirim."));
      setResendIn(RESEND_COOLDOWN_SECONDS);
    });

  const handleForgot = (e: React.FormEvent) => {
    e.preventDefault();
    if (validate({ email: true })) sendResetCode();
  };

  const handleReset = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate({ code: true, password: 'new' })) return;
    run(async () => {
      const res = await resetPassword({ email: email.trim(), otpCode: code, password });
      if (res.success) return signedIn(res.token);
      setError(res.message || tr("Kode salah."));
    });
  };

  const logout = () => {
    localStorage.removeItem('token');
    setUser(null);
    setPassword('');
    go('LOGIN');
  };

  if (loading) {
    // Without a saved session the login form follows immediately, so don't flash a dashboard frame
    return restoring ? <AppShellSkeleton tab={tab} /> : <div className="min-h-screen bg-background" aria-busy="true" />;
  }

  if (user) {
    return <Dashboard user={user} onLogout={logout} />;
  }

  const codeField = (onComplete?: (value: string) => void) => (
    <TextField
      label={tr("Kode verifikasi")}
      name="one-time-code"
      inputMode="numeric"
      autoComplete="one-time-code"
      autoFocus
      maxLength={6}
      value={code}
      error={fieldErrors.code}
      hint={tr("Kode 6 digit yang dikirim ke {email}", { email: email.trim() })}
      onChange={(e) => {
        const value = e.target.value.replace(/\D/g, '').slice(0, 6);
        setCode(value);
        if (value.length === 6 && onComplete && !isSubmitting) onComplete(value);
      }}
      placeholder="000000"
      className="tracking-[0.3em]"
    />
  );

  const resendButton = (onResend: () => void) => (
    <Button variant="ghost" size="sm" onClick={onResend} disabled={resendIn > 0 || isSubmitting}>
      {resendIn > 0 ? tr("Kirim ulang dalam {resendIn} dtk", { resendIn: resendIn }) : tr("Kirim ulang kode")}
    </Button>
  );

  const { title, subtitle } = COPY[mode];
  const linkClass = 'font-medium text-foreground underline-offset-4 hover:underline';

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Content sits near the top (not vertically centered) so mobile keyboards don't cover the button */}
      <div className="mx-auto w-full max-w-sm px-4 pt-14 pb-12 sm:pt-24">
        <div className="mb-8 flex items-center justify-between gap-4">
          <p className="font-heading text-lg font-semibold tracking-tight">{tr("WhatsMonTrack")}</p>
          <div className="flex items-center gap-2">
            <LanguageToggle />
            <ThemeSwitcher compact />
          </div>
        </div>

        <h1 className="font-heading text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>}

        <div className="mt-6 rounded-2xl border border-border/70 bg-card p-6 shadow-sm">
          {error && <Alert className="mb-4">{error}</Alert>}
          {notice && !error && <Alert tone="info" className="mb-4">{notice}</Alert>}

          {mode === 'LOGIN' && (
            <form onSubmit={handleLogin} noValidate className="space-y-4">
              {needsVerification && (
                <div className="-mt-1 flex flex-wrap gap-2">
                  <Button variant="secondary" size="sm" onClick={sendVerificationCode} loading={isSubmitting}>
                    {tr("Kirim kode verifikasi")}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => go('VERIFY')}>
                    {tr("Sudah punya kode")}
                  </Button>
                </div>
              )}
              <TextField label={tr("Email")} type="email" name="email" autoComplete="username" required
                value={email} onChange={(e) => setEmail(e.target.value)} error={fieldErrors.email} />
              <div>
                <PasswordField label={tr("Password")} name="password" autoComplete="current-password" required
                  value={password} onChange={(e) => setPassword(e.target.value)} error={fieldErrors.password} />
                <div className="mt-2 text-right">
                  <button type="button" onClick={() => go('FORGOT')} className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
                    {tr("Lupa password?")}
                  </button>
                </div>
              </div>
              <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>{tr("Masuk")}</Button>
            </form>
          )}

          {mode === 'REGISTER' && (
            <form onSubmit={handleRegister} noValidate className="space-y-4">
              <TextField label={tr("Email")} type="email" name="email" autoComplete="username" required
                value={email} onChange={(e) => setEmail(e.target.value)} error={fieldErrors.email}
                hint={tr("Kami kirim kode verifikasi ke email ini.")} />
              <PasswordField label={tr("Password")} name="new-password" autoComplete="new-password" required minLength={8}
                value={password} onChange={(e) => setPassword(e.target.value)} error={fieldErrors.password}
                hint={tr("Minimal 8 karakter.")} />
              <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>{tr("Buat akun")}</Button>
              <p className="text-xs text-muted-foreground">
                {tr("Nomor WhatsApp dihubungkan setelah masuk, dari dashboard.")}
              </p>
            </form>
          )}

          {mode === 'VERIFY' && (
            <form onSubmit={handleVerify} noValidate className="space-y-4">
              {codeField(submitVerify)}
              <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>{tr("Verifikasi")}</Button>
              <div className="flex items-center justify-between">
                {resendButton(sendVerificationCode)}
                <Button variant="ghost" size="sm" onClick={() => go('REGISTER')}>{tr("Ganti email")}</Button>
              </div>
            </form>
          )}

          {mode === 'FORGOT' && (
            <form onSubmit={handleForgot} noValidate className="space-y-4">
              <TextField label={tr("Email")} type="email" name="email" autoComplete="username" required autoFocus
                value={email} onChange={(e) => setEmail(e.target.value)} error={fieldErrors.email} />
              <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>{tr("Kirim kode")}</Button>
            </form>
          )}

          {mode === 'RESET' && (
            <form onSubmit={handleReset} noValidate className="space-y-4">
              {/* Lets password managers save the new password under the right account (web.dev) */}
              <input type="email" name="email" autoComplete="username" value={email} readOnly hidden />
              {codeField()}
              <PasswordField label={tr("Password baru")} name="new-password" autoComplete="new-password" required minLength={8}
                value={password} onChange={(e) => setPassword(e.target.value)} error={fieldErrors.password}
                hint={tr("Minimal 8 karakter.")} />
              <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>{tr("Simpan password baru")}</Button>
              <div className="flex items-center justify-between">
                {resendButton(sendResetCode)}
                <Button variant="ghost" size="sm" onClick={() => go('FORGOT')}>{tr("Ganti email")}</Button>
              </div>
            </form>
          )}
        </div>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          {mode === 'LOGIN' && (
            <>{tr("Belum punya akun?")} <button type="button" onClick={() => go('REGISTER')} className={linkClass}>{tr("Buat akun")}</button></>
          )}
          {mode === 'REGISTER' && (
            <>{tr("Sudah punya akun?")} <button type="button" onClick={() => go('LOGIN')} className={linkClass}>{tr("Masuk")}</button></>
          )}
          {(mode === 'VERIFY' || mode === 'FORGOT' || mode === 'RESET') && (
            <button type="button" onClick={() => go('LOGIN')} className={linkClass}>{tr("Kembali ke halaman masuk")}</button>
          )}
        </p>
      </div>
    </div>
  );
}

/** Before signing in, the language can be switched here too (afterwards: Pengaturan) */
function LanguageToggle() {
  const lang = useLang();
  const next = lang === "en" ? "id" : "en";
  return (
    <button type="button" onClick={() => setLang(next)}
      aria-label={next === "en" ? "Switch to English" : "Ganti ke Bahasa Indonesia"} lang={next}
      className="h-8 rounded-lg bg-muted px-2.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[#0071E3]/45">
      {next === "en" ? "EN" : "ID"}
    </button>
  );
}
