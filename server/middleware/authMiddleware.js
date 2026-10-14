const jwt = require("jsonwebtoken");

const User = require("../models/User");
const { env } = require("../config/env");
const { can } = require("../config/permissions");
const { unauthorized, forbidden } = require("../utils/httpError");

const SESSION_MESSAGE = "Your session is invalid or has expired. Please sign in again.";

const signToken = (user) =>
  jwt.sign(
    { userId: String(user._id), tv: user.tokenVersion || 0 },
    env.JWT_SECRET,
    { algorithm: "HS256", expiresIn: env.JWT_EXPIRES_IN }
  );

// Authenticates the bearer token and loads the account fresh from the
// database. The role always comes from the stored account, never from the
// token or the request.
const protect = async (req, res, next) => {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");

  if (scheme !== "Bearer" || !token) {
    return next(unauthorized("Please sign in to continue."));
  }

  let decoded;
  try {
    decoded = jwt.verify(token, env.JWT_SECRET, { algorithms: ["HS256"] });
  } catch {
    return next(unauthorized(SESSION_MESSAGE));
  }

  if (typeof decoded?.userId !== "string" || !/^[a-f\d]{24}$/i.test(decoded.userId)) {
    return next(unauthorized(SESSION_MESSAGE));
  }

  const user = await User.findById(decoded.userId);

  // Deactivated accounts and tokens issued before a password change or
  // sign-out are rejected the same way as an expired token.
  if (!user || user.isActive === false || (decoded.tv || 0) !== (user.tokenVersion || 0)) {
    return next(unauthorized(SESSION_MESSAGE));
  }

  req.user = user;
  return next();
};

// Deny by default: the route must name a permission the user's role holds.
const requirePermission = (...permissions) => (req, res, next) => {
  if (!req.user) return next(unauthorized());

  const allowed = permissions.some((permission) => can(req.user.role, permission));
  if (!allowed) return next(forbidden());

  return next();
};

module.exports = {
  protect,
  requirePermission,
  signToken,
};
