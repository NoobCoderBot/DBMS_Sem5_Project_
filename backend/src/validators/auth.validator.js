const { Joi, email, password } = require('./common');

const register = Joi.object({
  name: Joi.string().trim().min(2).max(100).required(),
  email: email.required(),
  password: password.required(),
});

const login = Joi.object({
  email: email.required(),
  password: Joi.string().required(),
});

const updateProfile = Joi.object({
  name: Joi.string().trim().min(2).max(100),
  email,
}).min(1);

const changePassword = Joi.object({
  currentPassword: Joi.string().required(),
  newPassword: password.required(),
});

module.exports = { register, login, updateProfile, changePassword };
