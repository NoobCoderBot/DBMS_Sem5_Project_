// Vercel entrypoint: the API app, with the DB connection opened on first request and reused while warm.
const express = require('express');
const app = require('./app');
const { connectDB } = require('./config/db');

let db;
const server = express();

server.use(async (_req, _res, next) => {
  try {
    db ??= connectDB().catch((err) => {
      db = null;
      throw err;
    });
    await db;
    next();
  } catch (err) {
    next(err);
  }
});
server.use(app);

module.exports = server;
