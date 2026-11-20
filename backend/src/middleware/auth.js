const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const { asyncHandler } = require('../utils/helpers');
const { verifyToken } = require('../utils/jwt');

/** Verifies the Bearer token and loads the (active) user onto req.user. */
const protect = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw ApiError.unauthorized('Authentication token missing');

  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    throw ApiError.unauthorized('Invalid or expired token');
  }

  const user = await User.findById(payload.sub);
  if (!user) throw ApiError.unauthorized('User no longer exists');
  if (user.status !== 'Active') throw ApiError.forbidden('Your account has been deactivated');

  req.user = user;
  next();
});

/** Role-based access control: allow only the listed roles. */
const authorize =
  (...roles) =>
  (req, _res, next) => {
    if (!req.user) return next(ApiError.unauthorized());
    if (!roles.includes(req.user.role)) {
      return next(ApiError.forbidden(`Role "${req.user.role}" is not allowed to perform this action`));
    }
    next();
  };

module.exports = { protect, authorize };
