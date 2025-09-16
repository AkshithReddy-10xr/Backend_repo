const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
require("dotenv").config();

// Import middleware
const corsMiddleware = require("./middleware/cors");
const rateLimitMiddleware = require("./middleware/rateLimit");
const { errorHandler } = require("./middleware/errorHandler");

// Import routes
const chatRoutes = require("./routes/chat");
const sessionRoutes = require("./routes/sessions");
const healthRoutes = require("./routes/health");
const ingestionRoutes = require("./routes/ingestion");

// Import services
const redisService = require("./services/redis");
const vectorDbService = require("./services/vectordb");
const ragPipelineService = require("./services/ragPipeline");

// Create Express app
const app = express();
const server = http.createServer(app);

// Fix MaxListeners warning
process.setMaxListeners(15);

// Initialize Socket.IO
const io = socketIo(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || "http://localhost:3000",
    methods: ["GET", "POST"],
  },
});

// Trust proxy (important for Railway/Render deployment)
app.set("trust proxy", 1);

// Security middleware
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
  })
);

// CORS middleware
app.use(corsMiddleware);

// Rate limiting (only on API routes)
app.use("/api/", rateLimitMiddleware);

// Body parsing middleware
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Logging middleware
if (process.env.NODE_ENV !== "test") {
  app.use(morgan("combined"));
}

// API routes
app.use("/api/health", healthRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/sessions", sessionRoutes);
app.use("/api/ingest", ingestionRoutes);

// Root endpoint
app.get("/", (req, res) => {
  res.json({
    message: "RAG Chatbot Backend API",
    version: "1.0.0",
    status: "running",
    endpoints: {
      health: "/api/health",
      chat: "/api/chat",
      sessions: "/api/sessions",
      ingest: "/api/ingest",
    },
  });
});

// Socket.IO connection handling
io.on("connection", (socket) => {
  console.log("New client connected:", socket.id);

  // Join session room
  socket.on("join_session", (sessionId) => {
    socket.join(sessionId);
    console.log(`Client ${socket.id} joined session ${sessionId}`);
  });

  // Handle chat messages
  socket.on("send_message", async (data) => {
    try {
      const { sessionId, message } = data;

      // Emit typing indicator
      socket.to(sessionId).emit("typing", true);

      // Import chat controller dynamically to avoid circular dependencies
      const { handleSocketMessage } = require("./controllers/chatController");

      // Process message and stream response
      await handleSocketMessage(socket, io, data);
    } catch (error) {
      console.error("Socket message error:", error);
      socket.emit("error", { message: "Failed to process message" });
    }
  });

  // Handle disconnection
  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
  });
});

// Error handling middleware (must be last)
app.use(errorHandler);

// Handle 404
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
    path: req.originalUrl,
  });
});

// Graceful shutdown
const gracefulShutdown = async () => {
  console.log("Starting graceful shutdown...");

  try {
    // Close Redis connection
    await redisService.disconnect();

    // Close ChromaDB (if needed)
    // await vectorDbService.close();

    console.log("Graceful shutdown completed");
    process.exit(0);
  } catch (error) {
    console.error("Error during shutdown:", error);
    process.exit(1);
  }
};

// Handle shutdown signals
process.on("SIGTERM", gracefulShutdown);
process.on("SIGINT", gracefulShutdown);

// Initialize services on startup
const initializeServices = async () => {
  try {
    console.log("Initializing services...");

    // Initialize Redis
    await redisService.connect();
    console.log("✅ Redis connected");

    // Initialize Vector DB
    await vectorDbService.initialize();
    console.log("✅ Vector DB initialized");

    // Initialize RAG Pipeline (with error handling)
    try {
      await ragPipelineService.initialize();
      console.log("✅ RAG Pipeline initialized");
    } catch (ragError) {
      console.warn("⚠️ RAG Pipeline initialization failed:", ragError.message);
      console.warn(
        "🔄 RAG services may not be fully available - check API keys"
      );
    }

    console.log("🚀 All services initialized successfully");
  } catch (error) {
    console.error("❌ Service initialization failed:", error);
    process.exit(1);
  }
};

// Export app and server for testing
module.exports = { app, server, io, initializeServices };
