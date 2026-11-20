const mongoose = require('mongoose');

/**
 * Runs `work(session)` inside a MongoDB multi-document transaction.
 * - Transient errors (write conflicts) are retried automatically by `withTransaction`.
 * - Any thrown error aborts the whole transaction (full rollback) and is re-thrown.
 * - There is intentionally NO fallback for standalone MongoDB: stock safety must never be bypassed.
 */
async function runInTransaction(work) {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(
      async () => {
        result = await work(session);
      },
      {
        readConcern: { level: 'snapshot' },
        writeConcern: { w: 'majority' },
      }
    );
    return result;
  } finally {
    await session.endSession();
  }
}

module.exports = { runInTransaction };
