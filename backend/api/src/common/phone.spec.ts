import { jidFromPhone, normalizePhone, phoneFromJid } from './phone';

describe('normalizePhone', () => {
  it.each([
    ['081234567890', '6281234567890'],
    ['6281234567890', '6281234567890'],
    ['+62 812-3456-7890', '6281234567890'],
    ['81234567890', '6281234567890'],
    ['(0812) 3456 7890', '6281234567890'],
  ])('%s -> %s', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it('returns empty string for empty input', () => {
    expect(normalizePhone(undefined)).toBe('');
    expect(normalizePhone('')).toBe('');
  });
});

describe('phoneFromJid', () => {
  it('reads phone JIDs, including device suffix', () => {
    expect(phoneFromJid('6281234567890@s.whatsapp.net')).toBe('6281234567890');
    expect(phoneFromJid('6281234567890:12@s.whatsapp.net')).toBe('6281234567890');
  });

  it('rejects LID, group and empty JIDs (they carry no phone number)', () => {
    expect(phoneFromJid('123456789012345@lid')).toBeNull();
    expect(phoneFromJid('120363000000000000@g.us')).toBeNull();
    expect(phoneFromJid(undefined)).toBeNull();
  });
});

describe('jidFromPhone', () => {
  it('builds a normalised phone JID', () => {
    expect(jidFromPhone('0812-3456-7890')).toBe('6281234567890@s.whatsapp.net');
  });
});
