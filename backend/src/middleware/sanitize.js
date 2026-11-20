const { sanitizeValue } = require('../utils/helpers');

/** Strips Mongo operator keys ($…, a.b) from body, query and params to block NoSQL injection. */
module.exports = function sanitize(req, _res, next) {
  if (req.body) req.body = sanitizeValue(req.body);
  if (req.query) {
    const clean = sanitizeValue(req.query);
    Object.keys(req.query).forEach((k) => delete req.query[k]);
    Object.assign(req.query, clean);
  }
  if (req.params) req.params = sanitizeValue(req.params);
  next();
};
