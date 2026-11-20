const mongoose = require('mongoose');

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const ok = (res, data, message, status = 200, extra = {}) =>
  res.status(status).json({ success: true, ...(message && { message }), data, ...extra });

const created = (res, data, message = 'Created successfully') => ok(res, data, message, 201);

const escapeRegex = (s = '') => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

const isObjectId = (v) => mongoose.Types.ObjectId.isValid(v) && String(new mongoose.Types.ObjectId(v)) === String(v);

const toObjectId = (v) => new mongoose.Types.ObjectId(String(v));

/** Parse ?page & ?limit into safe numbers. */
function parsePagination(query, defaultLimit = 10, maxLimit = 100) {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || defaultLimit, 1), maxLimit);
  return { page, limit, skip: (page - 1) * limit };
}

const buildPagination = (total, page, limit) => ({
  total,
  page,
  limit,
  totalPages: Math.max(Math.ceil(total / limit), 1),
  hasNext: page * limit < total,
  hasPrev: page > 1,
});

/**
 * Build a sort object from ?sortBy & ?order, restricted to a whitelist of fields.
 * Always appends _id for deterministic pagination.
 */
function parseSort(query, allowed, fallback = { createdAt: -1 }) {
  const field = query.sortBy;
  if (!field || !allowed.includes(field)) return { ...fallback, _id: -1 };
  const dir = String(query.order).toLowerCase() === 'asc' ? 1 : -1;
  return { [field]: dir, _id: dir };
}

/** Build a { $gte, $lte } date range from ?from & ?to (to is inclusive of the whole day). */
function parseDateRange(query, fromKey = 'from', toKey = 'to') {
  const range = {};
  if (query[fromKey]) {
    const d = new Date(query[fromKey]);
    if (!Number.isNaN(d.getTime())) range.$gte = d;
  }
  if (query[toKey]) {
    const d = new Date(query[toKey]);
    if (!Number.isNaN(d.getTime())) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(String(query[toKey]))) d.setUTCHours(23, 59, 59, 999);
      range.$lte = d;
    }
  }
  return Object.keys(range).length ? range : null;
}

/** Remove Mongo operator injection ($ keys / dotted keys) from untrusted input, in place. */
function sanitizeValue(value) {
  if (Array.isArray(value)) return value.map(sanitizeValue);
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const clean = {};
    for (const [k, v] of Object.entries(value)) {
      if (k.startsWith('$') || k.includes('.')) continue;
      clean[k] = sanitizeValue(v);
    }
    return clean;
  }
  return value;
}

module.exports = {
  asyncHandler,
  ok,
  created,
  escapeRegex,
  round2,
  isObjectId,
  toObjectId,
  parsePagination,
  buildPagination,
  parseSort,
  parseDateRange,
  sanitizeValue,
};
