const { badRequest } = require("../utils/httpError");

const formatIssues = (issues) =>
  issues.map((issue) => ({
    field: issue.path.join(".") || undefined,
    message:
      issue.code === "unrecognized_keys"
        ? `Unexpected field${issue.keys.length > 1 ? "s" : ""}: ${issue.keys.join(", ")}.`
        : issue.message,
  }));

// Validates body, query and params against strict schemas. Parsed, trimmed and
// coerced values are placed on req.valid; handlers read from there only.
const validate = (schemas) => (req, res, next) => {
  const valid = {};

  for (const part of ["params", "query", "body"]) {
    const schema = schemas[part];
    if (!schema) continue;

    const result = schema.safeParse(req[part] ?? {});

    if (!result.success) {
      const errors = formatIssues(result.error.issues);
      return next(badRequest(errors[0].message, errors));
    }

    valid[part] = result.data;
  }

  req.valid = valid;
  return next();
};

// Rejects MongoDB operator keys anywhere in a JSON body before any handler
// sees it. Schemas already force field types; this is defence in depth.
const hasUnsafeKey = (value, depth = 0) => {
  if (!value || typeof value !== "object") return false;
  if (depth > 8) return true;

  if (Array.isArray(value)) {
    return value.some((item) => hasUnsafeKey(item, depth + 1));
  }

  return Object.keys(value).some(
    (key) =>
      key.startsWith("$") ||
      key.includes(".") ||
      key === "__proto__" ||
      key === "constructor" ||
      key === "prototype" ||
      hasUnsafeKey(value[key], depth + 1)
  );
};

const rejectUnsafeKeys = (req, res, next) => {
  if (hasUnsafeKey(req.body) || hasUnsafeKey(req.query)) {
    return next(badRequest("The request contains fields that are not allowed."));
  }
  return next();
};

module.exports = { validate, rejectUnsafeKeys, hasUnsafeKey };
