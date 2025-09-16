const embeddingsService = require("./embeddings");
const vectorDbService = require("./vectordb");
const llmService = require("./llm");
const { config } = require("../config");

class RAGPipelineService {
  constructor() {
    this.topK = config.rag.vectorSearchTopK || 3;
    this.similarityThreshold = 0.1;
    this.maxContextLength = config.rag.maxContextChunks || 5;
    this.isInitialized = false;
  }

  // Initialize the RAG pipeline
  async initialize() {
    try {
      console.log("🔄 Initializing RAG pipeline...");

      // Check if all required services are available
      const embeddingsAvailable = embeddingsService.isServiceAvailable();
      const vectorDbAvailable = vectorDbService.isAvailable();
      const llmAvailable = llmService.isServiceAvailable();

      if (!embeddingsAvailable) {
        throw new Error(
          "Embeddings service not available - check JINA_API_KEY"
        );
      }

      if (!vectorDbAvailable) {
        throw new Error("Vector database not available");
      }

      if (!llmAvailable) {
        throw new Error("LLM service not available - check GEMINI_API_KEY");
      }

      this.isInitialized = true;
      console.log("✅ RAG pipeline initialized successfully");

      return true;
    } catch (error) {
      console.error("❌ Failed to initialize RAG pipeline:", error.message);
      this.isInitialized = false;
      return false;
    }
  }

  // Check if pipeline is ready
  isReady() {
    return (
      this.isInitialized &&
      embeddingsService.isServiceAvailable() &&
      vectorDbService.isAvailable() &&
      llmService.isServiceAvailable()
    );
  }

  // Main query processing pipeline
  async processQuery(query, options = {}) {
    try {
      if (!this.isReady()) {
        throw new Error(
          "RAG pipeline not ready - please check service availability"
        );
      }

      console.log(`🔄 Processing RAG query: "${query.substring(0, 50)}..."`);

      const startTime = Date.now();
      const pipeline = {
        query: query,
        steps: [],
        context: [],
        response: null,
        metadata: {},
      };

      // Step 1: Generate query embedding
      pipeline.steps.push({
        step: 1,
        name: "embedding_generation",
        status: "started",
        timestamp: Date.now(),
      });

      const queryEmbedding = await embeddingsService.generateQueryEmbedding(
        query
      );

      pipeline.steps[0].status = "completed";
      pipeline.steps[0].duration = Date.now() - pipeline.steps[0].timestamp;
      pipeline.metadata.queryEmbeddingDimensions = queryEmbedding.dimensions;

      // Step 2: Vector search
      pipeline.steps.push({
        step: 2,
        name: "vector_search",
        status: "started",
        timestamp: Date.now(),
      });

      const searchResults = await vectorDbService.searchSimilar(
        queryEmbedding.embedding,
        options.topK || this.topK,
        options.filter
      );

      pipeline.steps[1].status = "completed";
      pipeline.steps[1].duration = Date.now() - pipeline.steps[1].timestamp;
      pipeline.metadata.searchResultsCount = searchResults.documents.length;

      // Step 3: Filter by similarity threshold
      pipeline.steps.push({
        step: 3,
        name: "context_filtering",
        status: "started",
        timestamp: Date.now(),
      });

      const relevantContext = this.filterRelevantContext(
        searchResults,
        options.similarityThreshold || this.similarityThreshold
      );

      pipeline.steps[2].status = "completed";
      pipeline.steps[2].duration = Date.now() - pipeline.steps[2].timestamp;
      pipeline.metadata.relevantContextCount = relevantContext.length;

      if (relevantContext.length === 0) {
        console.warn("⚠️ No relevant context found for query");
        pipeline.context = [];
        pipeline.response = await this.generateFallbackResponse(query);
      } else {
        // Step 4: Prepare context
        pipeline.steps.push({
          step: 4,
          name: "context_preparation",
          status: "started",
          timestamp: Date.now(),
        });

        const contextData = this.prepareContext(
          relevantContext,
          options.maxContextLength || this.maxContextLength
        );
        pipeline.context = contextData;

        pipeline.steps[3].status = "completed";
        pipeline.steps[3].duration = Date.now() - pipeline.steps[3].timestamp;
        pipeline.metadata.finalContextLength = contextData.length;

        // Step 5: Generate LLM response
        pipeline.steps.push({
          step: 5,
          name: "llm_generation",
          status: "started",
          timestamp: Date.now(),
        });

        const llmResponse = await llmService.generateRAGResponse(
          query,
          contextData,
          options
        );
        pipeline.response = llmResponse;

        pipeline.steps[4].status = "completed";
        pipeline.steps[4].duration = Date.now() - pipeline.steps[4].timestamp;
        pipeline.metadata.responseLength = llmResponse.text.length;
      }

      const totalDuration = Date.now() - startTime;
      pipeline.metadata.totalDuration = totalDuration;

      console.log(`✅ RAG query processed in ${totalDuration}ms`);

      return {
        success: true,
        query: query,
        response: pipeline.response.text,
        context: pipeline.context,
        metadata: pipeline.metadata,
        steps: pipeline.steps,
      };
    } catch (error) {
      console.error("❌ Error processing RAG query:", error.message);

      return {
        success: false,
        query: query,
        error: error.message,
        fallbackResponse: await this.generateFallbackResponse(query).catch(
          () =>
            "I apologize, but I'm having technical difficulties processing your request right now."
        ),
      };
    }
  }

  // Streaming query processing
  async processStreamingQuery(query, onChunk, options = {}) {
    try {
      if (!this.isReady()) {
        throw new Error("RAG pipeline not ready");
      }

      console.log(`🔄 Processing streaming RAG query...`);

      // Steps 1-4: Same as regular processing
      const queryEmbedding = await embeddingsService.generateQueryEmbedding(
        query
      );

      const searchResults = await vectorDbService.searchSimilar(
        queryEmbedding.embedding,
        options.topK || this.topK,
        options.filter
      );

      const relevantContext = this.filterRelevantContext(
        searchResults,
        options.similarityThreshold || this.similarityThreshold
      );

      if (relevantContext.length === 0) {
        // Stream fallback response
        const fallbackText =
          "I don't have enough relevant information to answer your question.";
        const words = fallbackText.split(" ");

        for (let i = 0; i < words.length; i++) {
          await onChunk({
            chunk: words[i] + " ",
            fullText: words.slice(0, i + 1).join(" "),
            chunkIndex: i,
            isComplete: false,
          });
          await new Promise((resolve) => setTimeout(resolve, 100));
        }

        await onChunk({
          chunk: "",
          fullText: fallbackText,
          chunkIndex: words.length,
          isComplete: true,
        });

        return { success: true, query, response: fallbackText, context: [] };
      }

      const contextData = this.prepareContext(
        relevantContext,
        options.maxContextLength || this.maxContextLength
      );

      // Step 5: Stream LLM response
      const llmResponse = await llmService.generateStreamingRAGResponse(
        query,
        contextData,
        options,
        onChunk
      );

      return {
        success: true,
        query: query,
        response: llmResponse.text,
        context: contextData,
        chunks: llmResponse.chunks,
        usage: llmResponse.usage,
      };
    } catch (error) {
      console.error("❌ Error in streaming RAG query:", error.message);

      // Stream error message
      const errorText =
        "I apologize, but I encountered an error processing your request.";
      await onChunk({
        chunk: errorText,
        fullText: errorText,
        chunkIndex: 0,
        isComplete: true,
        error: true,
      });

      return {
        success: false,
        query: query,
        error: error.message,
      };
    }
  }

  // Filter context by similarity threshold
  filterRelevantContext(searchResults, threshold) {
    const relevant = [];

    console.log("🔍 Debug similarity filtering:");
    console.log("Threshold:", threshold);
    console.log("Raw distances:", searchResults.distances);

    for (let i = 0; i < searchResults.documents.length; i++) {
      const distance = searchResults.distances[i] || 0;
      const similarity = 1 - distance; // Convert distance to similarity

      console.log(
        `Document ${i}: distance=${distance}, similarity=${similarity}`
      );

      if (similarity >= threshold) {
        console.log(`✅ Document ${i} passed threshold`);
        relevant.push({
          content: searchResults.documents[i],
          metadata: searchResults.metadatas[i] || {},
          similarity: similarity,
          id: searchResults.ids[i],
        });
      } else {
        console.log(
          `❌ Document ${i} failed threshold (${similarity} < ${threshold})`
        );
      }
    }

    return relevant.sort((a, b) => b.similarity - a.similarity);
  }

  // Prepare context for LLM
  prepareContext(relevantContext, maxLength) {
    const context = [];
    let totalLength = 0;

    for (const item of relevantContext) {
      const content = item.content || "";
      const metadata = item.metadata || {};

      // Add source information if available
      let contextItem = content;
      if (metadata.title || metadata.source || metadata.url) {
        const sources = [];
        if (metadata.title) sources.push(`Title: ${metadata.title}`);
        if (metadata.source) sources.push(`Source: ${metadata.source}`);
        if (metadata.published)
          sources.push(`Published: ${metadata.published}`);

        contextItem = `${content}\n\n[${sources.join(" | ")}]`;
      }

      // Check if adding this context would exceed the limit
      if (context.length >= maxLength) {
        break;
      }

      context.push({
        content: contextItem,
        similarity: item.similarity,
        metadata: metadata,
      });

      totalLength += contextItem.length;
    }

    return context;
  }

  // Generate fallback response when no context is found
  async generateFallbackResponse(query) {
    try {
      const fallbackPrompt = `The user asked: "${query}"

I don't have specific information in my knowledge base to answer this question directly. Please provide a helpful response explaining that you don't have enough relevant information, but offer to help in other ways or suggest how they might find the information they need.

Be polite, helpful, and acknowledge their question.`;

      const response = await llmService.generateResponse(fallbackPrompt, {
        maxTokens: 150,
        temperature: 0.7,
      });

      return response;
    } catch (error) {
      console.error("❌ Error generating fallback response:", error.message);
      return {
        text: "I apologize, but I don't have enough information in my knowledge base to answer your question. Could you try rephrasing your question or asking about a different topic?",
      };
    }
  }

  // Get pipeline statistics
  async getStats() {
    try {
      const embeddingStats = embeddingsService.getStats();
      const vectorStats = await vectorDbService.getStats();
      const llmStats = llmService.getStats();

      return {
        ready: this.isReady(),
        configuration: {
          topK: this.topK,
          similarityThreshold: this.similarityThreshold,
          maxContextLength: this.maxContextLength,
        },
        services: {
          embeddings: embeddingStats,
          vectorDb: vectorStats,
          llm: llmStats,
        },
      };
    } catch (error) {
      return {
        ready: false,
        error: error.message,
      };
    }
  }

  // Health check for entire pipeline
  async healthCheck() {
    try {
      const checks = {
        embeddings: await embeddingsService.healthCheck(),
        vectorDb: await vectorDbService.healthCheck(),
        llm: await llmService.healthCheck(),
      };

      const allHealthy = Object.values(checks).every(
        (check) => check.status === "ok"
      );

      return {
        status: allHealthy ? "ok" : "degraded",
        services: checks,
        ready: this.isReady(),
      };
    } catch (error) {
      return {
        status: "error",
        message: error.message,
        ready: false,
      };
    }
  }

  // Update configuration
  updateConfig(newConfig) {
    if (newConfig.topK !== undefined) {
      this.topK = Math.max(1, Math.min(20, newConfig.topK));
    }

    if (newConfig.similarityThreshold !== undefined) {
      this.similarityThreshold = Math.max(
        0,
        Math.min(1, newConfig.similarityThreshold)
      );
    }

    if (newConfig.maxContextLength !== undefined) {
      this.maxContextLength = Math.max(
        1,
        Math.min(10, newConfig.maxContextLength)
      );
    }

    console.log("✅ RAG pipeline configuration updated:", {
      topK: this.topK,
      similarityThreshold: this.similarityThreshold,
      maxContextLength: this.maxContextLength,
    });
  }
}

// Create and export singleton instance
const ragPipelineService = new RAGPipelineService();
module.exports = ragPipelineService;
