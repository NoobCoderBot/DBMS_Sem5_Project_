const path = require('path');

// Always load backend/.env regardless of the directory the process was started from.
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 5000,
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27018/stockflow?replicaSet=rs0',
  requireReplicaSet: process.env.REQUIRE_REPLICA_SET !== 'false',
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS, 10) || 10,
};

env.isProd = env.nodeEnv === 'production';
env.isTest = env.nodeEnv === 'test';

if (env.isTest && !env.jwtSecret) env.jwtSecret = 'test-secret-not-for-production';

if (!env.jwtSecret || env.jwtSecret === 'change-me') {
  throw new Error('JWT_SECRET is not configured. Copy .env.example to .env and set a strong secret.');
}

module.exports = env;
