const axios = require("axios");
const { config } = require("../config");

class EmbeddingsService {
  constructor() {
    this.apiKey = config.apis.jina.apiKey;
    this.baseUrl = config.apis.jina.baseUrl;
    this.model = config.apis.jina.model;
    this.maxTokens = config.apis.jina.maxTokens;
    this.isAvailable = !!this.apiKey;

    if (!this.isAvailable) {
      console.warn(
        "⚠️ Jina API key not configured - embeddings service disabled"
      );
    }
  }

  // Check if service is available
  isServiceAvailable() {
    return this.isAvailable && this.apiKey;
  }

  // Generate embeddings for a single text
  async generateEmbedding(text, options = {}) {
    try {
      if (!this.isServiceAvailable()) {
        throw new Error("Embeddings service not available - missing API key");
      }

      // Validate and clean input
      if (!text || typeof text !== "string") {
        throw new Error("Text input is required and must be a string");
      }

      const cleanText = text.trim();
      if (cleanText.length === 0) {
        throw new Error("Text input cannot be empty");
      }

      // Check token limit (approximate)
      if (cleanText.length > this.maxTokens * 4) {
        // Rough estimate: 4 chars per token
        console.warn(
          `⚠️ Text may exceed token limit (${this.maxTokens}), truncating...`
        );
        text = cleanText.substring(0, this.maxTokens * 4);
      }

      // Prepare request
      const requestData = {
        input: [cleanText],
        model: "jina-embeddings-v2-base-en", // Use exact model name that works
      };

      console.log(
        `🔄 Generating embedding for text (${cleanText.length} chars)...`
      );

      const response = await axios.post(this.baseUrl, requestData, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        timeout: 30000, // 30 second timeout
      });

      if (!response.data || !response.data.data || !response.data.data[0]) {
        throw new Error("Invalid response format from Jina API");
      }

      const embedding = response.data.data[0].embedding;

      if (!Array.isArray(embedding) || embedding.length === 0) {
        throw new Error("Invalid embedding format received");
      }

      console.log(`✅ Generated embedding with ${embedding.length} dimensions`);

      return {
        embedding: embedding,
        model: response.data.model || this.model,
        usage: response.data.usage || {},
        dimensions: embedding.length,
      };
    } catch (error) {
      if (error.response) {
        // API error response
        const status = error.response.status;
        const message =
          error.response.data?.error?.message ||
          error.response.data?.message ||
          "Unknown API error";

        console.error(`❌ Jina API error (${status}): ${message}`);

        if (status === 401) {
          throw new Error("Invalid Jina API key");
        } else if (status === 429) {
          throw new Error("Jina API rate limit exceeded");
        } else if (status >= 500) {
          throw new Error("Jina API server error");
        } else {
          throw new Error(`Jina API error: ${message}`);
        }
      } else if (error.code === "ECONNREFUSED" || error.code === "ETIMEDOUT") {
        console.error("❌ Network error connecting to Jina API");
        throw new Error("Network error - unable to connect to Jina API");
      } else {
        console.error("❌ Embeddings generation error:", error.message);
        throw error;
      }
    }
  }

  // Generate embeddings for multiple texts (batch processing)
  async generateBatchEmbeddings(texts, options = {}) {
    try {
      if (!this.isServiceAvailable()) {
        throw new Error("Embeddings service not available - missing API key");
      }

      if (!Array.isArray(texts) || texts.length === 0) {
        throw new Error("Texts input must be a non-empty array");
      }

      // Clean and validate texts
      const cleanTexts = texts
        .filter((text) => text && typeof text === "string")
        .map((text) => text.trim())
        .filter((text) => text.length > 0);

      if (cleanTexts.length === 0) {
        throw new Error("No valid texts provided");
      }

      // Limit batch size to prevent timeouts
      const batchSize = options.batchSize || 10;
      const results = [];

      console.log(
        `🔄 Generating embeddings for ${cleanTexts.length} texts in batches of ${batchSize}...`
      );

      for (let i = 0; i < cleanTexts.length; i += batchSize) {
        const batch = cleanTexts.slice(i, i + batchSize);

        try {
          const requestData = {
            input: [cleanText],
            model: "jina-embeddings-v2-base-en", // Use exact model name that works
          };

          const response = await axios.post(this.baseUrl, requestData, {
            headers: {
              Authorization: `Bearer ${this.apiKey}`,
              "Content-Type": "application/json",
            },
            timeout: 60000, // 60 second timeout for batches
          });

          if (!response.data || !response.data.data) {
            throw new Error("Invalid response format from Jina API");
          }

          // Process batch results
          const batchResults = response.data.data.map((item, index) => ({
            text: batch[index],
            embedding: item.embedding,
            model: response.data.model || this.model,
            index: i + index,
          }));

          results.push(...batchResults);

          console.log(
            `✅ Processed batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(
              cleanTexts.length / batchSize
            )}`
          );

          // Small delay between batches to avoid rate limits
          if (i + batchSize < cleanTexts.length) {
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
        } catch (error) {
          console.error(
            `❌ Error processing batch starting at index ${i}:`,
            error.message
          );

          // For batch errors, continue with remaining batches but log the error
          const failedBatch = batch.map((text, index) => ({
            text: text,
            embedding: null,
            error: error.message,
            index: i + index,
          }));

          results.push(...failedBatch);
        }
      }

      const successCount = results.filter((r) => r.embedding).length;
      const failureCount = results.length - successCount;

      console.log(
        `✅ Batch embedding complete: ${successCount} success, ${failureCount} failed`
      );

      return {
        results: results,
        total: results.length,
        successful: successCount,
        failed: failureCount,
      };
    } catch (error) {
      console.error("❌ Batch embeddings generation error:", error.message);
      throw error;
    }
  }

  // Generate query embedding (optimized for search)
  async generateQueryEmbedding(query) {
    return await this.generateEmbedding(query, {
      task: "retrieval.query",
    });
  }

  // Generate document embedding (optimized for storage)
  async generateDocumentEmbedding(document) {
    return await this.generateEmbedding(document, {
      task: "retrieval.passage",
    });
  }

  // Calculate cosine similarity between two embeddings
  cosineSimilarity(embedding1, embedding2) {
    if (!Array.isArray(embedding1) || !Array.isArray(embedding2)) {
      throw new Error("Embeddings must be arrays");
    }

    if (embedding1.length !== embedding2.length) {
      throw new Error("Embeddings must have the same dimensions");
    }

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < embedding1.length; i++) {
      dotProduct += embedding1[i] * embedding2[i];
      norm1 += embedding1[i] * embedding1[i];
      norm2 += embedding2[i] * embedding2[i];
    }

    const magnitude = Math.sqrt(norm1) * Math.sqrt(norm2);

    if (magnitude === 0) {
      return 0;
    }

    return dotProduct / magnitude;
  }

  // Find most similar embeddings from a collection
  findMostSimilar(queryEmbedding, documentEmbeddings, topK = 5) {
    try {
      const similarities = documentEmbeddings.map((docEmb, index) => ({
        index: index,
        embedding: docEmb.embedding || docEmb,
        similarity: this.cosineSimilarity(
          queryEmbedding,
          docEmb.embedding || docEmb
        ),
        metadata: docEmb.metadata || {},
      }));

      // Sort by similarity (descending) and take top K
      return similarities
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, topK);
    } catch (error) {
      console.error("❌ Error finding similar embeddings:", error.message);
      return [];
    }
  }

  // Health check for the service
  async healthCheck() {
    try {
      if (!this.isServiceAvailable()) {
        return {
          status: "unavailable",
          message: "API key not configured",
        };
      }

      // Test with a simple embedding
      const testResult = await this.generateEmbedding("Health check test", {
        timeout: 5000,
      });

      return {
        status: "ok",
        model: testResult.model,
        dimensions: testResult.dimensions,
        usage: testResult.usage,
      };
    } catch (error) {
      return {
        status: "error",
        message: error.message,
      };
    }
  }

  // Get service statistics
  getStats() {
    return {
      model: this.model,
      maxTokens: this.maxTokens,
      available: this.isServiceAvailable(),
      baseUrl: this.baseUrl,
    };
  }
}

// Create and export singleton instance
const embeddingsService = new EmbeddingsService();
module.exports = embeddingsService;
