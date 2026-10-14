const multer = require("multer");

const { HttpError } = require("../utils/httpError");
const logger = require("../utils/logger");

const notFoundHandler = (req, res) => {
  res.status(404).json({
    success: false,
    message: "The requested resource was not found.",
  });
};

// Central error translation. Unexpected errors are logged server-side and
// answered with a generic message: no stack traces or database details leave
// the server.
// eslint-disable-next-line no-unused-vars
const errorHandler = (error, req, res, next) => {
  if (error instanceof HttpError) {
    return res.status(error.status).json({
      success: false,
      message: error.message,
      ...(error.details ? { errors: error.details } : {}),
    });
  }

  if (error instanceof multer.MulterError) {
    const message =
      error.code === "LIMIT_FILE_SIZE"
        ? "Each document must be 5MB or smaller."
        : "The uploaded files could not be accepted.";
    return res.status(400).json({ success: false, message });
  }

  if (error?.code === "UNSUPPORTED_FILE") {
    return res.status(400).json({ success: false, message: error.message });
  }

  if (error?.type === "entity.too.large") {
    return res.status(413).json({ success: false, message: "The request is too large." });
  }

  if (error?.type === "entity.parse.failed" || error instanceof SyntaxError) {
    return res.status(400).json({ success: false, message: "The request body is not valid JSON." });
  }

  if (error?.name === "VersionError") {
    return res.status(409).json({
      success: false,
      message: "This record was just changed by someone else. Please refresh and try again.",
    });
  }

  if (error?.name === "CastError") {
    return res.status(400).json({ success: false, message: "A valid record id is required." });
  }

  if (error?.name === "ValidationError") {
    return res.status(400).json({ success: false, message: "Please provide valid details." });
  }

  if (error?.code === 11000) {
    return res.status(409).json({ success: false, message: "This record already exists." });
  }

  if (error?.message === "CORS_NOT_ALLOWED") {
    return res.status(403).json({ success: false, message: "Origin not allowed." });
  }

  logger.error("Unhandled request error", error, {
    method: req.method,
    path: req.route?.path || req.path,
  });

  return res.status(500).json({
    success: false,
    message: "Something went wrong on our side. Please try again.",
  });
};

module.exports = { notFoundHandler, errorHandler };
