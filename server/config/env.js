const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const REQUIRED_ENV = [
  'DATABASE_NAME',
  'DATABASE_USER',
  'DATABASE_PASSWORD',
  'DATABASE_HOST',
  'DATABASE_PORT',
  'SECRET_KEY',
];

const getMissingEnv = () =>
  REQUIRED_ENV.filter((name) => !process.env[name] || process.env[name].trim() === '');

const ensureRequiredEnv = () => {
  const missing = getMissingEnv();

  if (missing.length > 0) {
    console.error(
      [
        'Configuration error:',
        `Missing required environment variables: ${missing.join(', ')}`,
        'Create server/.env from server/.env.example and fill in your local values.',
      ].join('\n')
    );
    process.exit(1);
  }
};

const getPort = () => Number(process.env.PORT || 5000);

module.exports = {
  ensureRequiredEnv,
  getPort,
};
