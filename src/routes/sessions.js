const express = require("express");
const router = express.Router();
const { validateSessionId } = require("../middleware/validation");
const { asyncHandler } = require("../middleware/errorHandler");
const redisService = require("../services/redis");

// Session controller
const sessionController = {
  // Create new session
  createSession: asyncHandler(async (req, res) => {
    try {
      const sessionId = await redisService.createSession();

      if (!sessionId) {
        return res.status(500).json({
          success: false,
          error: "Failed to create session",
          message: "Unable to create new session",
        });
      }

      res.status(201).json({
        success: true,
        message: "Session created successfully",
        data: {
          sessionId,
          createdAt: new Date().toISOString(),
        },
      });
    } catch (error) {
      console.error("Error creating session:", error);
      res.status(500).json({
        success: false,
        error: "Session creation failed",
        message: error.message,
      });
    }
  }),

  // Get session data
  getSession: asyncHandler(async (req, res) => {
    try {
      const { id } = req.params;
      const session = await redisService.getSession(id);

      if (!session) {
        return res.status(404).json({
          success: false,
          error: "Session not found",
          message: "The requested session does not exist or has expired",
        });
      }

      res.json({
        success: true,
        data: {
          sessionId: session.id,
          createdAt: session.createdAt,
          lastActivity: session.lastActivity,
          messageCount: session.messages.length,
        },
      });
    } catch (error) {
      console.error("Error getting session:", error);
      res.status(500).json({
        success: false,
        error: "Failed to retrieve session",
        message: error.message,
      });
    }
  }),

  // Get session history
  getSessionHistory: asyncHandler(async (req, res) => {
    try {
      const { id } = req.params;
      const messages = await redisService.getSessionMessages(id);

      if (messages === null) {
        return res.status(404).json({
          success: false,
          error: "Session not found",
          message: "The requested session does not exist or has expired",
        });
      }

      res.json({
        success: true,
        data: {
          sessionId: id,
          messages: messages,
          count: messages.length,
        },
      });
    } catch (error) {
      console.error("Error getting session history:", error);
      res.status(500).json({
        success: false,
        error: "Failed to retrieve session history",
        message: error.message,
      });
    }
  }),

  // Clear session
  clearSession: asyncHandler(async (req, res) => {
    try {
      const { id } = req.params;
      const success = await redisService.clearSessionMessages(id);

      if (!success) {
        return res.status(404).json({
          success: false,
          error: "Session not found",
          message:
            "The requested session does not exist or could not be cleared",
        });
      }

      res.json({
        success: true,
        message: "Session cleared successfully",
        data: {
          sessionId: id,
          clearedAt: new Date().toISOString(),
        },
      });
    } catch (error) {
      console.error("Error clearing session:", error);
      res.status(500).json({
        success: false,
        error: "Failed to clear session",
        message: error.message,
      });
    }
  }),

  // Delete session
  deleteSession: asyncHandler(async (req, res) => {
    try {
      const { id } = req.params;
      const success = await redisService.deleteSession(id);

      if (!success) {
        return res.status(404).json({
          success: false,
          error: "Session not found",
          message: "The requested session does not exist",
        });
      }

      res.json({
        success: true,
        message: "Session deleted successfully",
        data: {
          sessionId: id,
          deletedAt: new Date().toISOString(),
        },
      });
    } catch (error) {
      console.error("Error deleting session:", error);
      res.status(500).json({
        success: false,
        error: "Failed to delete session",
        message: error.message,
      });
    }
  }),

  // Get session stats
  getStats: asyncHandler(async (req, res) => {
    try {
      const stats = await redisService.getStats();

      res.json({
        success: true,
        data: {
          ...stats,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      console.error("Error getting stats:", error);
      res.status(500).json({
        success: false,
        error: "Failed to retrieve stats",
        message: error.message,
      });
    }
  }),
};

// Session routes
router.post("/", sessionController.createSession);
router.get("/stats", sessionController.getStats);
router.get("/:id", validateSessionId, sessionController.getSession);
router.get(
  "/:id/history",
  validateSessionId,
  sessionController.getSessionHistory
);
router.post("/:id/clear", validateSessionId, sessionController.clearSession);
router.delete("/:id", validateSessionId, sessionController.deleteSession);

module.exports = router;
