// Custom error classes
class ValidationError extends Error {
  constructor(message, field = null) {
    super(message);
    this.name = "ValidationError";
    this.statusCode = 400;
    this.field = field;
  }
}

class NotFoundError extends Error {
  constructor(message = "Resource not found") {
    super(message);
    this.name = "NotFoundError";
    this.statusCode = 404;
  }
}

class RateLimitError extends Error {
  constructor(message = "Rate limit exceeded") {
    super(message);
    this.name = "RateLimitError";
    this.statusCode = 429;
  }
}

class ExternalAPIError extends Error {
  constructor(message, service, originalError = null) {
    super(message);
    this.name = "ExternalAPIError";
    this.statusCode = 502;
    this.service = service;
    this.originalError = originalError;
  }
}

// Main error handler middleware
const errorHandler = (err, req, res, next) => {
  // Log error details
  console.error("Error occurred:", {
    name: err.name,
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get("User-Agent"),
    timestamp: new Date().toISOString(),
  });

  // Default error response
  let errorResponse = {
    success: false,
    error: err.name || "InternalServerError",
    message: "An unexpected error occurred",
    timestamp: new Date().toISOString(),
    path: req.path,
  };

  // Handle different error types
  if (err instanceof ValidationError) {
    errorResponse = {
      ...errorResponse,
      message: err.message,
      field: err.field,
    };
    return res.status(400).json(errorResponse);
  }

  if (err instanceof NotFoundError) {
    errorResponse.message = err.message;
    return res.status(404).json(errorResponse);
  }

  if (err instanceof RateLimitError) {
    errorResponse.message = err.message;
    return res.status(429).json(errorResponse);
  }

  if (err instanceof ExternalAPIError) {
    errorResponse.message = `External service error: ${err.service}`;
    errorResponse.details = err.message;
    return res.status(502).json(errorResponse);
  }

  // Handle Express validation errors
  if (err.name === "ValidationError" && err.errors) {
    const validationErrors = Object.values(err.errors).map((e) => e.message);
    errorResponse.message = "Validation failed";
    errorResponse.details = validationErrors;
    return res.status(400).json(errorResponse);
  }

  // Handle JSON parsing errors
  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    errorResponse.message = "Invalid JSON in request body";
    return res.status(400).json(errorResponse);
  }

  // Handle MongoDB/Database errors
  if (err.name === "MongoError" || err.name === "MongooseError") {
    errorResponse.message = "Database error";
    return res.status(500).json(errorResponse);
  }

  // Handle Redis errors
  if (err.name === "ReplyError" || err.message.includes("Redis")) {
    errorResponse.message = "Cache service temporarily unavailable";
    return res.status(503).json(errorResponse);
  }

  // Handle ChromaDB errors
  if (err.message.includes("Chroma") || err.message.includes("Vector")) {
    errorResponse.message = "Vector database error";
    return res.status(503).json(errorResponse);
  }

  // Handle Gemini API errors
  if (err.message.includes("Gemini") || err.message.includes("Google")) {
    errorResponse.message = "AI service temporarily unavailable";
    return res.status(503).json(errorResponse);
  }

  // Handle Jina API errors
  if (err.message.includes("Jina") || err.message.includes("embedding")) {
    errorResponse.message = "Embedding service temporarily unavailable";
    return res.status(503).json(errorResponse);
  }

  // Handle network/timeout errors
  if (err.code === "ECONNREFUSED" || err.code === "ETIMEDOUT") {
    errorResponse.message = "Service temporarily unavailable";
    return res.status(503).json(errorResponse);
  }

  // Handle file system errors
  if (err.code && err.code.startsWith("E")) {
    errorResponse.message = "File system error";
    return res.status(500).json(errorResponse);
  }

  // Production vs Development error responses
  if (process.env.NODE_ENV === "production") {
    // Don't expose internal error details in production
    errorResponse.message = "Internal server error";
    delete errorResponse.stack;
  } else {
    // Include stack trace in development
    errorResponse.message = err.message || "Internal server error";
    errorResponse.stack = err.stack;
  }

  // Default to 500 Internal Server Error
  const statusCode = err.statusCode || err.status || 500;
  res.status(statusCode).json(errorResponse);
};

// Async error wrapper
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// 404 handler for undefined routes
const notFoundHandler = (req, res, next) => {
  const error = new NotFoundError(`Route ${req.originalUrl} not found`);
  next(error);
};

module.exports = {
  errorHandler,
  asyncHandler,
  notFoundHandler,
  ValidationError,
  NotFoundError,
  RateLimitError,
  ExternalAPIError,
};
