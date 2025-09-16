const express = require("express");
const router = express.Router();
const { asyncHandler } = require("../middleware/errorHandler");
const newsIngestionService = require("../services/newsIngestion");
const embeddingsService = require("../services/embeddings"); // Add this line
const vectorDbService = require("../services/vectordb");

// Trigger news ingestion
router.post(
  "/news",
  asyncHandler(async (req, res) => {
    try {
      const { limit = 10, sources } = req.body;

      console.log(`Starting news ingestion: limit=${limit}`);

      const result = await newsIngestionService.ingestNews({
        limit: Math.min(limit, 50), // Cap at 50 to prevent abuse
        sources: sources,
      });

      if (result.success) {
        res.json({
          success: true,
          message: "News ingestion completed successfully",
          data: result.summary,
          timestamp: result.timestamp,
        });
      } else {
        res.status(500).json({
          success: false,
          error: "News ingestion failed",
          message: result.error,
          timestamp: result.timestamp,
        });
      }
    } catch (error) {
      console.error("Ingestion endpoint error:", error);
      res.status(500).json({
        success: false,
        error: "Internal server error",
        message: error.message,
      });
    }
  })
);
// Add this route to src/routes/ingestion.js
router.post(
  "/articles",
  asyncHandler(async (req, res) => {
    try {
      const { articles } = req.body;

      const processedArticles = [];

      for (const article of articles) {
        const embeddingResult =
          await embeddingsService.generateDocumentEmbedding(article.content);

        processedArticles.push({
          id: article.id || `article_${Date.now()}_${Math.random()}`,
          title: article.title,
          content: article.content, // Make sure this is a string
          embedding: embeddingResult.embedding,
          metadata: {
            source: article.source || "Direct Upload",
            category: article.category || "General",
          },
        });
      }

      // Add logging to debug
      console.log(
        "Sample processed article content:",
        typeof processedArticles[0].content,
        processedArticles[0].content.substring(0, 100)
      );

      const result = await vectorDbService.addDocuments(processedArticles);

      res.json({
        success: true,
        message: "Articles added successfully",
        data: { processed: processedArticles.length, result },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  })
);
// Get ingestion statistics
router.get(
  "/stats",
  asyncHandler(async (req, res) => {
    try {
      const stats = await newsIngestionService.getStats();

      res.json({
        success: true,
        data: stats,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Stats endpoint error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to get ingestion stats",
        message: error.message,
      });
    }
  })
);

// Health check for ingestion services
router.get(
  "/health",
  asyncHandler(async (req, res) => {
    try {
      const health = await newsIngestionService.healthCheck();

      const statusCode = health.status === "ok" ? 200 : 503;

      res.status(statusCode).json({
        success: health.status === "ok",
        data: health,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      res.status(503).json({
        success: false,
        error: "Health check failed",
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  })
);

module.exports = router;
