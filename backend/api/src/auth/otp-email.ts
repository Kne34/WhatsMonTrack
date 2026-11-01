/**
 * OTP email in the same minimalist black-and-white style as the web UI
 * (page #F8FAFC, white card with hairline border, ink #0B101E, muted #64748B).
 *
 * Built for email clients, not browsers: table layout, inline styles, no web fonts,
 * images or external CSS, ~520px wide, hidden preheader, and a plain-text alternative.
 * Dark mode: clients that honour prefers-color-scheme (Apple Mail, iOS Mail, Outlook for Mac)
 * use the <style> overrides below; the rest (e.g. Gmail) show the light version or apply
 * their own automatic inversion, which this neutral palette survives.
 */

export type OtpPurpose = 'verify' | 'reset';

const COLORS = {
  page: '#F8FAFC',
  card: '#FFFFFF',
  border: '#E2E8F0',
  ink: '#0B101E',
  muted: '#64748B',
  codeBg: '#F1F5F9',
};

// Same neutral dark palette as the web app
const DARK = {
  page: '#0A0A0A',
  card: '#141414',
  border: '#2A2A2A',
  ink: '#FAFAFA',
  muted: '#A3A3A3',
  codeBg: '#1F1F1F',
};

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

const COPY: Record<OtpPurpose, { subject: (code: string) => string; title: string; intro: string; ignore: string }> = {
  verify: {
    subject: (code) => `${code} adalah kode verifikasi WhatsMonTrack Anda`,
    title: 'Verifikasi email Anda',
    intro: 'Masukkan kode berikut di halaman verifikasi untuk menyelesaikan pendaftaran.',
    ignore: 'Jika Anda tidak mendaftar di WhatsMonTrack, abaikan email ini. Tidak ada akun yang aktif tanpa kode ini.',
  },
  reset: {
    subject: (code) => `${code} adalah kode reset password WhatsMonTrack Anda`,
    title: 'Buat password baru',
    intro: 'Masukkan kode berikut untuk membuat password baru akun Anda.',
    ignore: 'Jika Anda tidak meminta reset password, abaikan email ini. Password Anda tidak berubah.',
  },
};

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function renderOtpEmail({ code, ttlMinutes, purpose }: { code: string; ttlMinutes: number; purpose: OtpPurpose }) {
  const copy = COPY[purpose];
  const safeCode = escapeHtml(code);
  const subject = copy.subject(code);
  const preheader = `Kode Anda: ${code}. Berlaku ${ttlMinutes} menit.`;

  const text = [
    'WhatsMonTrack',
    '',
    copy.title,
    copy.intro,
    '',
    `Kode: ${code}`,
    `Berlaku ${ttlMinutes} menit. Jangan berikan kode ini kepada siapa pun.`,
    '',
    copy.ignore,
  ].join('\n');

  const html = `<!DOCTYPE html>
<html lang="id" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="format-detection" content="telephone=no, date=no, address=no, email=no">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${escapeHtml(subject)}</title>
<style>
  :root { color-scheme: light dark; supported-color-schemes: light dark; }
  @media (prefers-color-scheme: dark) {
    .wmt-page { background-color: ${DARK.page} !important; }
    .wmt-card { background-color: ${DARK.card} !important; border-color: ${DARK.border} !important; }
    .wmt-ink { color: ${DARK.ink} !important; }
    .wmt-muted { color: ${DARK.muted} !important; }
    .wmt-code { background-color: ${DARK.codeBg} !important; }
  }
</style>
</head>
<body class="wmt-page" style="margin:0;padding:0;background-color:${COLORS.page};-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${escapeHtml(preheader)}</div>
<table class="wmt-page" role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${COLORS.page};">
  <tr>
    <td align="center" style="padding:40px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;">
        <tr>
          <td class="wmt-ink" style="padding:0 4px 24px 4px;font-family:${FONT};font-size:18px;font-weight:600;letter-spacing:-0.2px;color:${COLORS.ink};">
            WhatsMonTrack
          </td>
        </tr>
        <tr>
          <td class="wmt-card" style="background-color:${COLORS.card};border:1px solid ${COLORS.border};border-radius:16px;padding:32px;">
            <h1 class="wmt-ink" style="margin:0 0 8px 0;font-family:${FONT};font-size:22px;line-height:28px;font-weight:600;letter-spacing:-0.3px;color:${COLORS.ink};">
              ${escapeHtml(copy.title)}
            </h1>
            <p class="wmt-muted" style="margin:0 0 24px 0;font-family:${FONT};font-size:14px;line-height:22px;color:${COLORS.muted};">
              ${escapeHtml(copy.intro)}
            </p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td class="wmt-code" align="center" style="background-color:${COLORS.codeBg};border-radius:12px;padding:20px 12px;">
                  <span class="wmt-ink" style="font-family:'SFMono-Regular',Menlo,Consolas,'Courier New',monospace;font-size:32px;line-height:40px;font-weight:700;letter-spacing:10px;color:${COLORS.ink};">${safeCode}</span>
                </td>
              </tr>
            </table>
            <p class="wmt-muted" style="margin:16px 0 0 0;font-family:${FONT};font-size:13px;line-height:20px;color:${COLORS.muted};">
              Berlaku ${ttlMinutes} menit. Jangan berikan kode ini kepada siapa pun, termasuk yang mengaku dari WhatsMonTrack.
            </p>
          </td>
        </tr>
        <tr>
          <td class="wmt-muted" style="padding:20px 4px 0 4px;font-family:${FONT};font-size:12px;line-height:18px;color:${COLORS.muted};">
            ${escapeHtml(copy.ignore)}
          </td>
        </tr>
        <tr>
          <td class="wmt-muted" style="padding:16px 4px 0 4px;font-family:${FONT};font-size:12px;line-height:18px;color:${COLORS.muted};">
            WhatsMonTrack &middot; Catat keuangan lewat WhatsApp
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;

  return { subject, html, text };
}
