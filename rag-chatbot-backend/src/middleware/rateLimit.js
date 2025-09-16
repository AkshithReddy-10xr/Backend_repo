const rateLimit = require("express-rate-limit");

// Simple rate limiter without custom key generator (uses default IPv6-safe one)
const createRateLimit = (windowMs, max, message) => {
  return rateLimit({
    windowMs,
    max,
    message: {
      success: false,
      error: "Too many requests",
      message,
      retryAfter: Math.ceil(windowMs / 1000),
    },
    standardHeaders: true,
    legacyHeaders: false,
    // Remove custom keyGenerator to use default IPv6-safe one
    skip: (req) => {
      // Skip rate limiting for health checks
      return req.path === "/api/health";
    },
    handler: (req, res) => {
      console.warn(`Rate limit exceeded for ${req.ip} on ${req.path}`);
      res.status(429).json({
        success: false,
        error: "Too many requests",
        message: "Rate limit exceeded. Please try again later.",
        retryAfter: Math.ceil(windowMs / 1000),
      });
    },
  });
};

// Different rate limits for different endpoints
const generalLimiter = createRateLimit(
  15 * 60 * 1000, // 15 minutes
  100, // 100 requests per window
  "Too many requests from this IP, please try again later."
);

const chatLimiter = createRateLimit(
  1 * 60 * 1000, // 1 minute
  10, // 10 chat messages per minute
  "Too many chat messages, please slow down."
);

const sessionLimiter = createRateLimit(
  5 * 60 * 1000, // 5 minutes
  20, // 20 session operations per 5 minutes
  "Too many session operations, please try again later."
);

// Export middleware functions
module.exports = {
  general: generalLimiter,
  chat: chatLimiter,
  session: sessionLimiter,
};

// Export general limiter as default
module.exports = generalLimiter;
