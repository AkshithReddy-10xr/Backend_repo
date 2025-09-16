const { body, param, query, validationResult } = require("express-validator");
const { ValidationError } = require("./errorHandler");

// Middleware to handle validation errors
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    const errorMessages = errors.array().map((error) => ({
      field: error.path || error.param,
      message: error.msg,
      value: error.value,
    }));

    return res.status(400).json({
      success: false,
      error: "Validation Error",
      message: "Invalid input data",
      details: errorMessages,
      timestamp: new Date().toISOString(),
    });
  }

  next();
};

// Chat message validation
const validateChatMessage = [
  body("message")
    .isString()
    .withMessage("Message must be a string")
    .trim()
    .isLength({ min: 1, max: parseInt(process.env.MAX_QUERY_LENGTH) || 500 })
    .withMessage(
      `Message must be between 1 and ${
        process.env.MAX_QUERY_LENGTH || 500
      } characters`
    ),

  body("sessionId")
    .optional()
    .isString()
    .withMessage("Session ID must be a string")
    .matches(/^session:[a-f0-9-]{36}$/)
    .withMessage("Invalid session ID format"),

  handleValidationErrors,
];

// Session ID validation
const validateSessionId = [
  param("id")
    .isString()
    .withMessage("Session ID must be a string")
    .matches(/^session:[a-f0-9-]{36}$/)
    .withMessage("Invalid session ID format"),

  handleValidationErrors,
];

// Query parameters validation
const validatePagination = [
  query("page")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Page must be a positive integer"),

  query("limit")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("Limit must be between 1 and 100"),

  handleValidationErrors,
];

// News ingestion validation
const validateNewsIngestion = [
  body("sources")
    .optional()
    .isArray()
    .withMessage("Sources must be an array")
    .custom((sources) => {
      if (sources.length > 10) {
        throw new Error("Maximum 10 sources allowed");
      }
      return true;
    }),

  body("sources.*")
    .optional()
    .isURL()
    .withMessage("Each source must be a valid URL"),

  body("limit")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("Limit must be between 1 and 100"),

  handleValidationErrors,
];

// File upload validation
const validateFileUpload = [
  body("file").custom((value, { req }) => {
    if (!req.file) {
      throw new Error("No file uploaded");
    }

    const allowedTypes = ["text/plain", "application/json", "text/csv"];
    if (!allowedTypes.includes(req.file.mimetype)) {
      throw new Error("Invalid file type. Allowed: txt, json, csv");
    }

    // Max size 10MB
    if (req.file.size > 10 * 1024 * 1024) {
      throw new Error("File size must be less than 10MB");
    }

    return true;
  }),

  handleValidationErrors,
];

// General text validation
const validateText = (field, minLength = 1, maxLength = 1000) => [
  body(field)
    .isString()
    .withMessage(`${field} must be a string`)
    .trim()
    .isLength({ min: minLength, max: maxLength })
    .withMessage(
      `${field} must be between ${minLength} and ${maxLength} characters`
    ),

  handleValidationErrors,
];

// UUID validation
const validateUUID = (field) => [
  param(field).isUUID().withMessage(`${field} must be a valid UUID`),

  handleValidationErrors,
];

// Custom sanitization middleware
const sanitizeInput = (req, res, next) => {
  // Sanitize string inputs to prevent XSS
  const sanitizeValue = (value) => {
    if (typeof value === "string") {
      // Remove potentially dangerous characters
      return value
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "") // Remove script tags
        .replace(/<[^>]*>/g, "") // Remove HTML tags
        .replace(/javascript:/gi, "") // Remove javascript: protocol
        .replace(/on\w+\s*=/gi, ""); // Remove event handlers
    }
    return value;
  };

  // Recursively sanitize object properties
  const sanitizeObject = (obj) => {
    if (Array.isArray(obj)) {
      return obj.map(sanitizeObject);
    } else if (obj && typeof obj === "object") {
      const sanitized = {};
      for (const key in obj) {
        sanitized[key] = sanitizeObject(obj[key]);
      }
      return sanitized;
    } else {
      return sanitizeValue(obj);
    }
  };

  // Sanitize request body
  if (req.body) {
    req.body = sanitizeObject(req.body);
  }

  // Sanitize query parameters
  if (req.query) {
    req.query = sanitizeObject(req.query);
  }

  next();
};

// Rate limiting headers validation
const validateRateLimitHeaders = (req, res, next) => {
  // Check for session ID in headers
  const sessionId = req.headers["x-session-id"];
  if (sessionId && !sessionId.match(/^session:[a-f0-9-]{36}$/)) {
    return res.status(400).json({
      success: false,
      error: "Invalid Header",
      message: "Invalid session ID format in header",
    });
  }

  next();
};

// Content type validation
const validateContentType = (expectedType) => {
  return (req, res, next) => {
    if (
      req.method === "POST" ||
      req.method === "PUT" ||
      req.method === "PATCH"
    ) {
      const contentType = req.get("Content-Type");

      if (!contentType || !contentType.includes(expectedType)) {
        return res.status(400).json({
          success: false,
          error: "Invalid Content Type",
          message: `Expected Content-Type: ${expectedType}`,
          received: contentType || "none",
        });
      }
    }
    next();
  };
};

// Custom validation for specific business logic
const validateBusinessRules = {
  // Ensure user isn't sending too many messages too quickly
  messageFrequency: (req, res, next) => {
    const sessionId = req.body.sessionId || req.headers["x-session-id"];

    // This could check Redis for recent message timestamps
    // For now, just pass through
    next();
  },

  // Validate session ownership (if implementing user authentication)
  sessionOwnership: (req, res, next) => {
    // This would validate that the user owns the session
    // For now, just pass through
    next();
  },
};

// Export validation middleware
module.exports = {
  handleValidationErrors,
  validateChatMessage,
  validateSessionId,
  validatePagination,
  validateNewsIngestion,
  validateFileUpload,
  validateText,
  validateUUID,
  sanitizeInput,
  validateRateLimitHeaders,
  validateContentType,
  validateBusinessRules,

  // Convenience exports
  chatValidation: validateChatMessage,
  sessionValidation: validateSessionId,
  paginationValidation: validatePagination,
};
