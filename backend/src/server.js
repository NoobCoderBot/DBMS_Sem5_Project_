const app = require('./app');
const env = require('./config/env');
const { connectDB } = require('./config/db');

async function start() {
  try {
    await connectDB();
    console.log('MongoDB connected (replica set verified, transactions enabled)');
    app.listen(env.port, () => console.log(`StockFlow API listening on http://localhost:${env.port}`));
  } catch (err) {
    console.error('\nFailed to start StockFlow API:\n' + err.message);
    process.exit(1);
  }
}

start();
