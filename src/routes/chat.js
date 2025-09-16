const express = require("express");
const router = express.Router();
const { validateChatMessage } = require("../middleware/validation");
const { asyncHandler } = require("../middleware/errorHandler");
const ragPipelineService = require("../services/ragPipeline");
const redisService = require("../services/redis");

// Placeholder for chat controller (we'll implement this next)
const chatController = {
  sendMessage: asyncHandler(async (req, res) => {
    try {
      const { message, sessionId } = req.body;

      // Get or create session
      let actualSessionId = sessionId;
      if (!sessionId) {
        actualSessionId = await redisService.createSession();
      }

      let session = await redisService.getSession(actualSessionId);
      if (!session) {
        actualSessionId = await redisService.createSession();
        session = await redisService.getSession(actualSessionId);
      }

      // Add user message
      await redisService.addMessage(actualSessionId, {
        role: "user",
        content: message,
        timestamp: new Date().toISOString(),
      });

      // Check if RAG pipeline is ready
      if (!ragPipelineService.isReady()) {
        console.warn("⚠️ RAG pipeline not ready, using fallback response");

        const fallbackResponse =
          "I apologize, but my knowledge base is not currently available. Please ensure the system is properly configured with API keys and try again.";

        await redisService.addMessage(actualSessionId, {
          role: "assistant",
          content: fallbackResponse,
          timestamp: new Date().toISOString(),
        });

        return res.json({
          success: true,
          data: {
            sessionId: actualSessionId,
            userMessage: message,
            botResponse: fallbackResponse,
            timestamp: new Date().toISOString(),
            source: "fallback",
          },
        });
      }

      // Process through RAG pipeline
      const ragResult = await ragPipelineService.processQuery(message, {
        topK: 3,
        similarityThreshold: 0.1,
        maxContextLength: 3,
        temperature: 0.7,
      });

      let botResponse;
      let source;

      if (ragResult.success) {
        botResponse = ragResult.response;
        source = "rag_pipeline";
      } else {
        botResponse =
          ragResult.fallbackResponse ||
          "I'm sorry, I couldn't process your request at the moment.";
        source = "fallback";
      }

      // Add bot response to session
      await redisService.addMessage(actualSessionId, {
        role: "assistant",
        content: botResponse,
        timestamp: new Date().toISOString(),
      });

      res.json({
        success: true,
        data: {
          sessionId: actualSessionId,
          userMessage: message,
          botResponse: botResponse,
          context: ragResult.context || [],
          metadata: ragResult.metadata || {},
          timestamp: new Date().toISOString(),
          source: source,
        },
      });
    } catch (error) {
      console.error("REST message handling error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to process message",
        message: error.message,
      });
    }
  }),

  streamMessage: asyncHandler(async (req, res) => {
    // Server-sent events for streaming responses
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Cache-Control",
    });

    const { message } = req.body;

    // Send initial message
    res.write(
      `data: ${JSON.stringify({
        type: "start",
        message: "Processing your query...",
        timestamp: new Date().toISOString(),
      })}\n\n`
    );

    // Simulate streaming response
    const response =
      "This is a streaming placeholder response. The RAG pipeline will provide real streaming responses.";
    const words = response.split(" ");

    for (let i = 0; i < words.length; i++) {
      setTimeout(() => {
        res.write(
          `data: ${JSON.stringify({
            type: "chunk",
            content: words[i] + " ",
            index: i,
            timestamp: new Date().toISOString(),
          })}\n\n`
        );

        // Send final message
        if (i === words.length - 1) {
          setTimeout(() => {
            res.write(
              `data: ${JSON.stringify({
                type: "end",
                message: "Response complete",
                timestamp: new Date().toISOString(),
              })}\n\n`
            );
            res.end();
          }, 100);
        }
      }, i * 200); // 200ms delay between words
    }
  }),
};

// Chat endpoints
router.post("/", validateChatMessage, chatController.sendMessage);
router.post("/stream", validateChatMessage, chatController.streamMessage);

// Export for Socket.IO usage
router.chatController = chatController;

module.exports = router;
