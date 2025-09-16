const cors = require("cors");

// CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);

    const allowedOrigins = [
      process.env.CORS_ORIGIN || "http://localhost:3000",
      "http://localhost:3001",
      "https://localhost:3000",
      "https://localhost:3001",
    ];

    // Add production origins if in production
    if (process.env.NODE_ENV === "production") {
      allowedOrigins.push(
        // Add your frontend Vercel URL here when deployed
        "https://your-frontend.vercel.app"
      );
    }

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`CORS blocked origin: ${origin}`);
      callback(new Error("Not allowed by CORS"));
    }
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
  allowedHeaders: [
    "Origin",
    "X-Requested-With",
    "Content-Type",
    "Accept",
    "Authorization",
    "Cache-Control",
    "X-Session-ID",
  ],
  credentials: true,
  optionsSuccessStatus: 200, // Support legacy browsers
  preflightContinue: false,
};

module.exports = cors(corsOptions);
