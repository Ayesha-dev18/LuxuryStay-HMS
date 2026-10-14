const express = require("express");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const User = require("../models/User");
const { env } = require("../config/env");
const { permissionsFor } = require("../config/permissions");
const { protect, signToken } = require("../middleware/authMiddleware");
const { validate } = require("../middleware/validate");
const mailer = require("../utils/mailer");
const logger = require("../utils/logger");
const { HttpError, conflict, badRequest, unauthorized, forbidden } = require("../utils/httpError");
const { z, accountName, email, optionalPhone, password } = require("../utils/schemas");

const BCRYPT_ROUNDS = 12;
const MAX_FAILED_LOGINS = 8;
const LOCK_MINUTES = 15;
const RESET_RESEND_SECONDS = 120;

const INVALID_LOGIN = "Invalid email or password.";
const RESET_SENT =
  "If an account exists for that email address, a password reset link has been sent.";
const RESET_INVALID = "This password reset link is invalid or has expired.";

// Compared against when no account matches, so a wrong email costs the same
// time as a wrong password.
const DUMMY_HASH = bcrypt.hashSync(crypto.randomBytes(16).toString("hex"), BCRYPT_ROUNDS);

const hashToken = (value) => crypto.createHash("sha256").update(value).digest("hex");

const hashPassword = (value) => bcrypt.hash(value, BCRYPT_ROUNDS);

const sessionPayload = (user) => ({
  user: user.toSafeObject(),
  permissions: permissionsFor(user.role),
});

const registerSchema = z.strictObject({
  name: accountName,
  email,
  phone: optionalPhone,
  password,
});

const loginSchema = z.strictObject({
  email,
  password: z.string({ error: "Password is required." }).min(1, "Password is required.").max(200),
});

const profileSchema = z.strictObject({
  name: accountName,
  email,
  phone: optionalPhone,
});

const changePasswordSchema = z
  .strictObject({
    currentPassword: z.string({ error: "Current password is required." }).min(1).max(200),
    newPassword: password,
    confirmPassword: z.string({ error: "Please confirm your new password." }),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

const forgotSchema = z.strictObject({ email });

const resetToken = z
  .string({ error: RESET_INVALID })
  .regex(/^[a-f0-9]{64}$/, RESET_INVALID);

const validateTokenSchema = z.strictObject({ token: resetToken });

const resetSchema = z
  .strictObject({
    token: resetToken,
    newPassword: password,
    confirmPassword: z.string({ error: "Please confirm your new password." }),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

const createAuthRouter = (limiters) => {
  const router = express.Router();

  // Self-registration always creates a guest. The schema has no role field,
  // so a role sent by the client is rejected outright.
  router.post(
    "/register",
    limiters.register,
    validate({ body: registerSchema }),
    async (req, res) => {
      const { name, email: address, phone, password: plain } = req.valid.body;

      if (await User.exists({ email: address })) {
        throw conflict("An account with this email already exists.");
      }

      const user = await User.create({
        name,
        email: address,
        phone,
        password: await hashPassword(plain),
        role: "guest",
      });

      res.status(201).json({
        success: true,
        message: "Account created successfully. Please sign in.",
        user: user.toSafeObject(),
      });
    }
  );

  router.post("/login", limiters.login, validate({ body: loginSchema }), async (req, res) => {
    const { email: address, password: plain } = req.valid.body;

    const user = await User.findOne({ email: address }).select(
      "+password +failedLoginCount +lockUntil"
    );

    if (user?.lockUntil && user.lockUntil.getTime() > Date.now()) {
      throw new HttpError(
        429,
        "Too many failed sign-in attempts. Please try again in a few minutes."
      );
    }

    const matches = await bcrypt.compare(plain, user?.password || DUMMY_HASH);

    if (!user || !matches) {
      if (user) {
        const failed = (user.failedLoginCount || 0) + 1;
        await User.updateOne(
          { _id: user._id },
          failed >= MAX_FAILED_LOGINS
            ? {
                $set: {
                  failedLoginCount: 0,
                  lockUntil: new Date(Date.now() + LOCK_MINUTES * 60 * 1000),
                },
              }
            : { $set: { failedLoginCount: failed } }
        );
      }
      throw unauthorized(INVALID_LOGIN);
    }

    // Only revealed after the correct password, so it cannot be used to probe
    // which accounts exist.
    if (user.isActive === false) {
      throw forbidden("This account has been deactivated. Please contact the hotel.");
    }

    user.failedLoginCount = 0;
    user.lockUntil = null;
    user.lastLoginAt = new Date();
    await user.save();

    res.json({
      success: true,
      message: "Signed in successfully.",
      token: signToken(user),
      ...sessionPayload(user),
    });
  });

  // Signing out revokes every token issued to the account so far.
  router.post("/logout", protect, async (req, res) => {
    await User.updateOne({ _id: req.user._id }, { $inc: { tokenVersion: 1 } });
    res.json({ success: true, message: "Signed out." });
  });

  router.get("/me", protect, async (req, res) => {
    res.json({ success: true, ...sessionPayload(req.user) });
  });

  // Profile updates accept name, email and phone only. Role and status are
  // not part of the schema and can never be changed here.
  router.put("/me", protect, validate({ body: profileSchema }), async (req, res) => {
    const { name, email: address, phone } = req.valid.body;

    if (await User.exists({ email: address, _id: { $ne: req.user._id } })) {
      throw conflict("An account with this email already exists.");
    }

    req.user.name = name;
    req.user.email = address;
    req.user.phone = phone;
    await req.user.save();

    res.json({
      success: true,
      message: "Profile updated successfully.",
      ...sessionPayload(req.user),
    });
  });

  router.put(
    "/change-password",
    protect,
    limiters.resetToken,
    validate({ body: changePasswordSchema }),
    async (req, res) => {
      const { currentPassword, newPassword } = req.valid.body;

      const user = await User.findById(req.user._id).select("+password");
      if (!user || !(await bcrypt.compare(currentPassword, user.password))) {
        throw badRequest("Your current password is incorrect.");
      }

      if (await bcrypt.compare(newPassword, user.password)) {
        throw badRequest("Please choose a password you have not used before.");
      }

      user.password = await hashPassword(newPassword);
      user.passwordChangedAt = new Date();
      user.tokenVersion = (user.tokenVersion || 0) + 1;
      await user.save();

      // Other sessions are now invalid; this one continues with a new token.
      res.json({
        success: true,
        message: "Password changed successfully.",
        token: signToken(user),
      });
    }
  );

  router.post(
    "/forgot-password",
    limiters.passwordReset,
    validate({ body: forgotSchema }),
    async (req, res) => {
      // Checked before the account lookup: an outage is reported identically
      // for registered and unregistered addresses.
      try {
        await mailer.assertReady();
      } catch (error) {
        if (error.code !== "EMAIL_NOT_CONFIGURED") {
          logger.error("Email service is unavailable", error);
        }
        throw new HttpError(
          503,
          "Password reset email is unavailable right now. Please try again later or contact the hotel."
        );
      }

      const user = await User.findOne({ email: req.valid.body.email }).select(
        "+resetTokenHash +resetTokenExpires"
      );

      const issuedAt = user?.resetTokenExpires
        ? user.resetTokenExpires.getTime() - env.RESET_TOKEN_MINUTES * 60 * 1000
        : 0;
      const recentlySent = Date.now() - issuedAt < RESET_RESEND_SECONDS * 1000;

      if (!user || user.isActive === false || recentlySent) {
        return res.json({ success: true, message: RESET_SENT });
      }

      const token = crypto.randomBytes(32).toString("hex");

      user.resetTokenHash = hashToken(token);
      user.resetTokenExpires = new Date(Date.now() + env.RESET_TOKEN_MINUTES * 60 * 1000);
      await user.save();

      const link = `${env.CLIENT_URL}/reset-password?token=${token}`;

      try {
        await mailer.sendMail({
          to: user.email,
          subject: "Reset your LuxuryStay password",
          text: [
            `Hello ${user.name},`,
            "",
            "We received a request to reset your LuxuryStay password.",
            `Open this link to choose a new password. It expires in ${env.RESET_TOKEN_MINUTES} minutes and can be used once:`,
            "",
            link,
            "",
            "If you did not request this, you can ignore this email. Your password will not change.",
          ].join("\n"),
          html: `
            <div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:auto;color:#0b1730">
              <h2 style="font-weight:600">Reset your password</h2>
              <p>Hello ${escapeHtml(user.name)},</p>
              <p>We received a request to reset your LuxuryStay password. This link expires in ${env.RESET_TOKEN_MINUTES} minutes and can be used once.</p>
              <p style="margin:28px 0">
                <a href="${link}" style="background:#0b1730;color:#f4e7c3;padding:12px 22px;border-radius:8px;text-decoration:none">Choose a new password</a>
              </p>
              <p style="font-size:13px;color:#5b6478">If you did not request this, you can ignore this email. Your password will not change.</p>
            </div>`,
        });
      } catch {
        user.resetTokenHash = null;
        user.resetTokenExpires = null;
        await user.save();

        throw new HttpError(
          503,
          "Password reset email is unavailable right now. Please try again later or contact the hotel."
        );
      }

      return res.json({ success: true, message: RESET_SENT });
    }
  );

  // Lets the reset page show an "expired link" state before the form.
  router.post(
    "/reset-password/validate",
    limiters.resetToken,
    validate({ body: validateTokenSchema }),
    async (req, res) => {
      const valid = await User.exists({
        resetTokenHash: hashToken(req.valid.body.token),
        resetTokenExpires: { $gt: new Date() },
        isActive: { $ne: false },
      });

      if (!valid) throw badRequest(RESET_INVALID);

      res.json({ success: true });
    }
  );

  router.post(
    "/reset-password",
    limiters.resetToken,
    validate({ body: resetSchema }),
    async (req, res) => {
      const { token, newPassword } = req.valid.body;

      // One atomic update consumes the token, so a link can never be used
      // twice even by simultaneous requests.
      const user = await User.findOneAndUpdate(
        {
          resetTokenHash: hashToken(token),
          resetTokenExpires: { $gt: new Date() },
          isActive: { $ne: false },
        },
        {
          $set: {
            password: await hashPassword(newPassword),
            passwordChangedAt: new Date(),
            resetTokenHash: null,
            resetTokenExpires: null,
            failedLoginCount: 0,
            lockUntil: null,
          },
          // Signs the account out everywhere.
          $inc: { tokenVersion: 1 },
        }
      );

      if (!user) throw badRequest(RESET_INVALID);

      res.json({
        success: true,
        message: "Password updated successfully. Please sign in with your new password.",
      });
    }
  );

  return router;
};

function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]
  );
}

module.exports = { createAuthRouter, hashPassword, hashToken };
