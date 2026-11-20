const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const { asyncHandler, ok, created } = require('../utils/helpers');
const { signToken } = require('../utils/jwt');
const { ROLES } = require('../utils/constants');

const authPayload = (user) => ({ token: signToken(user._id), user: user.toJSON() });

// Public self-registration always creates a Staff account; elevated roles are granted by an Admin.
const register = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;
  if (await User.exists({ email })) throw ApiError.conflict('An account with this email already exists');
  const user = await User.create({ name, email, password, role: ROLES.STAFF });
  return created(res, authPayload(user), 'Registration successful');
});

const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email }).select('+password');
  // Same message for unknown email and wrong password: do not reveal which accounts exist.
  if (!user || !(await user.comparePassword(password))) throw ApiError.unauthorized('Invalid email or password');
  if (user.status !== 'Active') throw ApiError.forbidden('Your account has been deactivated');
  return ok(res, authPayload(user), 'Login successful');
});

const me = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).populate('assignedWarehouse', 'warehouseName warehouseCode');
  return ok(res, user.toJSON());
});

const updateProfile = asyncHandler(async (req, res) => {
  const { name, email } = req.body;
  if (email && email !== req.user.email && (await User.exists({ email, _id: { $ne: req.user._id } }))) {
    throw ApiError.conflict('Email is already in use');
  }
  if (name !== undefined) req.user.name = name;
  if (email !== undefined) req.user.email = email;
  await req.user.save();
  return ok(res, req.user.toJSON(), 'Profile updated');
});

const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const user = await User.findById(req.user._id).select('+password');
  if (!(await user.comparePassword(currentPassword))) throw ApiError.badRequest('Current password is incorrect');
  if (currentPassword === newPassword) throw ApiError.badRequest('New password must differ from the current password');
  user.password = newPassword;
  await user.save();
  return ok(res, null, 'Password changed successfully');
});

module.exports = { register, login, me, updateProfile, changePassword };
