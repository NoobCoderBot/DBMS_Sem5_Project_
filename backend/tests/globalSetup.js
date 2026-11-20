const fs = require('fs');
const path = require('path');
const { MongoMemoryReplSet } = require('mongodb-memory-server');

const DEFAULT_WIN_BINARY = 'C:/Program Files/MongoDB/Server/8.0/bin/mongod.exe';

module.exports = async () => {
  // Prefer a locally installed mongod (no download); otherwise mongodb-memory-server downloads one.
  if (!process.env.MONGOMS_SYSTEM_BINARY && fs.existsSync(DEFAULT_WIN_BINARY)) {
    process.env.MONGOMS_SYSTEM_BINARY = DEFAULT_WIN_BINARY;
    process.env.MONGOMS_VERSION = '8.0.0';
    process.env.MONGOMS_SYSTEM_BINARY_VERSION_CHECK = 'false';
  }
  // Transactions require a replica set, so tests run against an in-memory single-node replica set.
  const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  process.env.TEST_MONGO_URI = replSet.getUri();
  global.__REPLSET__ = replSet;
  fs.writeFileSync(path.join(__dirname, '.uri'), replSet.getUri());
};
