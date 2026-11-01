import { renderOtpEmail } from './otp-email';

describe('renderOtpEmail', () => {
  const verify = renderOtpEmail({ code: '482913', ttlMinutes: 15, purpose: 'verify' });
  const reset = renderOtpEmail({ code: '482913', ttlMinutes: 15, purpose: 'reset' });

  it('puts the code in the subject, the HTML and the plain-text version', () => {
    for (const mail of [verify, reset]) {
      expect(mail.subject).toContain('482913');
      expect(mail.html).toContain('>482913<');
      expect(mail.text).toContain('Kode: 482913');
      expect(mail.text).toContain('15 menit');
    }
  });

  it('uses different wording for verification and password reset', () => {
    expect(verify.html).toContain('Verifikasi email Anda');
    expect(reset.html).toContain('Buat password baru');
    expect(verify.subject).not.toBe(reset.subject);
  });

  it('is email-client safe: inline styles, no external resources or scripts', () => {
    expect(verify.html).not.toMatch(/<link\b|<script\b|<img\b|@import|url\(/i);
    // The base look is fully inline; the <style> block only adds dark-mode overrides
    expect(verify.html).toMatch(/<td class="wmt-card"[^>]*style="background-color:#FFFFFF;/);
    expect(verify.html).toContain('role="presentation"');
    expect(verify.html).toContain('lang="id"');
  });

  it('supports dark mode in clients that honour prefers-color-scheme', () => {
    expect(verify.html).toContain('<meta name="color-scheme" content="light dark">');
    expect(verify.html).toMatch(/@media \(prefers-color-scheme: dark\)[\s\S]*\.wmt-card \{ background-color: #141414 !important;/);
  });

  it('escapes HTML in the code', () => {
    const mail = renderOtpEmail({ code: '<b>1</b>', ttlMinutes: 15, purpose: 'verify' });
    expect(mail.html).not.toContain('<b>1</b>');
    expect(mail.html).toContain('&lt;b&gt;1&lt;/b&gt;');
  });
});
