/**
 * Canonical phone format used everywhere (DB, JWT, bot): digits only with the
 * Indonesian country code and no leading 0 or +, e.g. "6281234567890".
 */
export function normalizePhone(raw: string | null | undefined): string {
  let digits = String(raw ?? '').replace(/\D/g, '');
  if (digits.startsWith('0')) digits = '62' + digits.slice(1);
  else if (digits.startsWith('8')) digits = '62' + digits;
  return digits;
}

/**
 * Extracts the phone number from a WhatsApp phone JID ("62812...:12@s.whatsapp.net").
 * Returns null for LID / group / other JIDs, which do not contain a phone number.
 */
export function phoneFromJid(jid: string | null | undefined): string | null {
  if (!jid || !jid.endsWith('@s.whatsapp.net')) return null;
  const user = jid.split('@')[0].split(':')[0];
  return user ? normalizePhone(user) : null;
}

export function jidFromPhone(phone: string): string {
  return `${normalizePhone(phone)}@s.whatsapp.net`;
}
