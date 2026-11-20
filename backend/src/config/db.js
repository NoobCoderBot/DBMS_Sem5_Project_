const mongoose = require('mongoose');
const env = require('./env');

const REPLICA_SET_HELP = [
  'MongoDB is running in standalone mode, but StockFlow needs multi-document transactions.',
  'Transactions are only supported on a replica set. Do NOT disable this check.',
  'Quick fix (local dev): run `npm run db:replset` in /backend, then set',
  'MONGODB_URI=mongodb://127.0.0.1:27018/stockflow?replicaSet=rs0 in backend/.env.',
  'Or add `replication: { replSetName: rs0 }` to mongod.cfg, restart mongod and run rs.initiate().',
].join('\n');

async function assertReplicaSet(connection) {
  const info = await connection.db.admin().command({ hello: 1 });
  if (!info.setName) {
    const err = new Error(REPLICA_SET_HELP);
    err.code = 'STANDALONE_MONGO';
    throw err;
  }
}

async function connectDB(uri = env.mongoUri) {
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
  if (env.requireReplicaSet) await assertReplicaSet(mongoose.connection);
  return mongoose.connection;
}

module.exports = { connectDB, assertReplicaSet, REPLICA_SET_HELP };
