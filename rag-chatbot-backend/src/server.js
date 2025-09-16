const { server, initializeServices } = require("./app");

const PORT = process.env.PORT || 5000;

// Start server
const startServer = async () => {
  try {
    // Initialize all services first
    await initializeServices();

    // Start HTTP server
    server.listen(PORT, () => {
      console.log(`
🚀 RAG Chatbot Backend Server Started
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📍 Server: http://localhost:${PORT}
🌐 Environment: ${process.env.NODE_ENV || "development"}
⏰ Started at: ${new Date().toISOString()}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📋 Available Endpoints:
• GET  /                     - API Info
• GET  /api/health          - Health Check
• POST /api/chat            - Send Message
• GET  /api/sessions/:id    - Get Session
• POST /api/sessions/:id/clear - Clear Session

🔌 Socket.IO Events:
• join_session    - Join chat session
• send_message    - Send chat message
• message_chunk   - Receive response chunk
• typing          - Typing indicator

Ready to receive requests! 🎯
      `);
    });
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
};

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
  process.exit(1);
});

// Start the server
startServer();
