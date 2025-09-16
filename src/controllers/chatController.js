const redisService = require("../services/redis");
const ragPipelineService = require("../services/ragPipeline");

// Handle WebSocket/Socket.IO messages
const handleSocketMessage = async (socket, io, data) => {
  try {
    const { sessionId, message } = data;

    // Validate session
    let session = await redisService.getSession(sessionId);
    if (!session) {
      // Create new session if it doesn't exist
      const newSessionId = await redisService.createSession(sessionId);
      session = await redisService.getSession(newSessionId);
    }

    // Add user message to session
    await redisService.addMessage(sessionId, {
      role: "user",
      content: message,
      timestamp: new Date().toISOString(),
    });

    // Emit typing indicator
    socket.emit("typing", true);

    // Check if RAG pipeline is ready
    if (!ragPipelineService.isReady()) {
      console.warn("⚠️ RAG pipeline not ready, using fallback response");

      const fallbackResponse = `I apologize, but my knowledge base is not currently available. Please try again in a moment, or contact support if the issue persists.`;

      socket.emit("typing", false);
      socket.emit("message_complete", {
        sessionId,
        fullResponse: fallbackResponse,
        timestamp: new Date().toISOString(),
      });

      await redisService.addMessage(sessionId, {
        role: "assistant",
        content: fallbackResponse,
        timestamp: new Date().toISOString(),
      });

      return;
    }

    // Process message through RAG pipeline with streaming
    await ragPipelineService.processStreamingQuery(
      message,
      async (chunkData) => {
        // Emit each chunk as it arrives
        socket.emit("message_chunk", {
          sessionId,
          chunk: chunkData.chunk,
          fullText: chunkData.fullText,
          index: chunkData.chunkIndex,
          isComplete: chunkData.isComplete,
          timestamp: new Date().toISOString(),
        });
      },
      {
        // RAG options
        topK: 3,
        similarityThreshold: 0.1,
        maxContextLength: 3,
        temperature: 0.7,
      }
    );

    // Stop typing indicator when complete
    socket.emit("typing", false);

    console.log(`✅ RAG message processed for session ${sessionId}`);
  } catch (error) {
    console.error("Socket message handling error:", error);

    socket.emit("typing", false);
    socket.emit("error", {
      message: "Failed to process message",
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
};

// Handle REST API messages (non-WebSocket)
const handleRestMessage = async (req, res) => {
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

    // Generate response (placeholder for RAG pipeline)
    const response = `You said: "${message}". This is a placeholder response that will be replaced by the RAG pipeline.`;

    // Add bot response
    await redisService.addMessage(actualSessionId, {
      role: "assistant",
      content: response,
      timestamp: new Date().toISOString(),
    });

    res.json({
      success: true,
      data: {
        sessionId: actualSessionId,
        userMessage: message,
        botResponse: response,
        timestamp: new Date().toISOString(),
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
};

module.exports = {
  handleSocketMessage,
  handleRestMessage,
};
