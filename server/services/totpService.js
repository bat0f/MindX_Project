const crypto = require('crypto');

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STEP_SECONDS = 30;
const DIGITS = 6;
const WINDOW = 1;

class TotpService {
  getEncryptionKey() {
    return crypto.createHash('sha256').update(String(process.env.SECRET_KEY || 'mindx-dev-secret')).digest();
  }

  generateSecret() {
    return this.toBase32(crypto.randomBytes(20));
  }

  toBase32(buffer) {
    let bits = '';
    let output = '';

    for (const byte of buffer) {
      bits += byte.toString(2).padStart(8, '0');
    }

    for (let index = 0; index < bits.length; index += 5) {
      const chunk = bits.slice(index, index + 5).padEnd(5, '0');
      output += BASE32_ALPHABET[parseInt(chunk, 2)];
    }

    return output;
  }

  fromBase32(secret) {
    const cleanSecret = String(secret || '').replace(/\s+/g, '').toUpperCase();
    let bits = '';
    const bytes = [];

    for (const char of cleanSecret) {
      const value = BASE32_ALPHABET.indexOf(char);
      if (value === -1) {
        throw new Error('Некорректный TOTP-секрет.');
      }
      bits += value.toString(2).padStart(5, '0');
    }

    for (let index = 0; index + 8 <= bits.length; index += 8) {
      bytes.push(parseInt(bits.slice(index, index + 8), 2));
    }

    return Buffer.from(bytes);
  }

  encryptSecret(secret) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.getEncryptionKey(), iv);
    const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    return [
      'v1',
      iv.toString('base64url'),
      tag.toString('base64url'),
      encrypted.toString('base64url'),
    ].join(':');
  }

  decryptSecret(payload) {
    const [version, ivValue, tagValue, encryptedValue] = String(payload || '').split(':');
    if (version !== 'v1' || !ivValue || !tagValue || !encryptedValue) {
      throw new Error('TOTP-секрет повреждён.');
    }

    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      this.getEncryptionKey(),
      Buffer.from(ivValue, 'base64url')
    );
    decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));

    return Buffer.concat([
      decipher.update(Buffer.from(encryptedValue, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }

  getCode(secret, timeStep = Math.floor(Date.now() / 1000 / STEP_SECONDS)) {
    const counter = Buffer.alloc(8);
    counter.writeBigUInt64BE(BigInt(timeStep));

    const hmac = crypto.createHmac('sha1', this.fromBase32(secret)).update(counter).digest();
    const offset = hmac[hmac.length - 1] & 0xf;
    const binary =
      ((hmac[offset] & 0x7f) << 24) |
      ((hmac[offset + 1] & 0xff) << 16) |
      ((hmac[offset + 2] & 0xff) << 8) |
      (hmac[offset + 3] & 0xff);

    return String(binary % 10 ** DIGITS).padStart(DIGITS, '0');
  }

  verifyCode(secret, code) {
    const normalizedCode = String(code || '').replace(/\s+/g, '');
    if (!/^\d{6}$/.test(normalizedCode)) {
      return false;
    }

    const currentStep = Math.floor(Date.now() / 1000 / STEP_SECONDS);
    for (let offset = -WINDOW; offset <= WINDOW; offset += 1) {
      if (this.getCode(secret, currentStep + offset) === normalizedCode) {
        return true;
      }
    }

    return false;
  }

  buildOtpAuthUrl({ secret, username, issuer = 'MindX' }) {
    const accountName = String(username || 'user')
      .replace(/[^\w.@-]+/g, '')
      .slice(0, 24) || 'user';
    const label = `${issuer}:${accountName}`;
    const params = new URLSearchParams({
      secret,
      issuer,
    });

    return `otpauth://totp/${encodeURIComponent(label)}?${params.toString()}`;
  }
}

module.exports = new TotpService();
