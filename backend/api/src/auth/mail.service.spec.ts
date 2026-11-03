import { MailService, parseAddress } from './mail.service';

describe('parseAddress', () => {
  it('reads "Name <email>" and a bare email', () => {
    expect(parseAddress('"WhatsMonTrack" <me@gmail.com>')).toEqual({ name: 'WhatsMonTrack', email: 'me@gmail.com' });
    expect(parseAddress('WhatsMonTrack <me@gmail.com>')).toEqual({ name: 'WhatsMonTrack', email: 'me@gmail.com' });
    expect(parseAddress(' me@gmail.com ')).toEqual({ email: 'me@gmail.com' });
  });
});

describe('MailService with BREVO_API_KEY', () => {
  const env = { ...process.env };
  let fetchMock: jest.Mock;

  beforeEach(() => {
    process.env.BREVO_API_KEY = 'test-key';
    process.env.MAIL_FROM = '"WhatsMonTrack" <me@gmail.com>';
    fetchMock = jest.fn(async () => new Response('{"messageId":"x"}', { status: 201 }));
    global.fetch = fetchMock as unknown as typeof fetch;
  });
  afterEach(() => {
    process.env = { ...env };
  });

  it('sends the OTP over the Brevo HTTPS API, not SMTP', async () => {
    await new MailService().sendOtp('user@example.com', '123456', 15);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.brevo.com/v3/smtp/email');
    expect(init.headers['api-key']).toBe('test-key');
    const body = JSON.parse(init.body);
    expect(body.sender).toEqual({ name: 'WhatsMonTrack', email: 'me@gmail.com' });
    expect(body.to).toEqual([{ email: 'user@example.com' }]);
    expect(body.htmlContent).toContain('123456');
    expect(body.textContent).toContain('123456');
  });

  it('fails loudly when Brevo rejects the email', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{"message":"sender not valid"}', { status: 400 }));
    await expect(new MailService().sendOtp('user@example.com', '123456', 15)).rejects.toThrow(/400.*sender not valid/);
  });
});
