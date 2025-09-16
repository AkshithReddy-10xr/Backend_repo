require("dotenv").config();

// Validate required environment variables
const requiredEnvVars = ["JINA_API_KEY", "GEMINI_API_KEY"];

const missingVars = requiredEnvVars.filter((varName) => !process.env[varName]);
if (missingVars.length > 0 && process.env.NODE_ENV !== "test") {
  console.warn(`⚠️  Missing environment variables: ${missingVars.join(", ")}`);
  console.warn(
    "Some features may not work properly. Please check your .env file."
  );
}

const config = {
  // Server Configuration
  server: {
    port: parseInt(process.env.PORT) || 5000,
    env: process.env.NODE_ENV || "development",
    corsOrigin: process.env.CORS_ORIGIN || "http://localhost:3000",
  },

  // API Keys
  apis: {
    jina: {
      apiKey: process.env.JINA_API_KEY,
      baseUrl: "https://api.jina.ai/v1/embeddings",
      model: process.env.EMBEDDING_MODEL || "jina-embeddings-v2-base-en",
      maxTokens: 8192,
    },
    gemini: {
      apiKey: process.env.GEMINI_API_KEY,
      model: "gemini-1.5-flash",
      maxTokens: 8192,
      temperature: 0.7,
      topP: 0.9,
    },
  },

  // Redis Configuration
  redis: {
    url: process.env.REDIS_URL,
    ttl: parseInt(process.env.REDIS_TTL) || 86400,
    maxRetries: 3,
    retryDelay: 100,
  },

  // Database Configuration (Optional)
  database: {
    url: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === "production",
  },

  // RAG Pipeline Settings
  rag: {
    maxQueryLength: parseInt(process.env.MAX_QUERY_LENGTH) || 500,
    maxContextChunks: parseInt(process.env.MAX_CONTEXT_CHUNKS) || 5,
    vectorSearchTopK: parseInt(process.env.VECTOR_SEARCH_TOP_K) || 3,
    similarityThreshold: parseFloat(process.env.SIMILARITY_THRESHOLD) || 0.7,
    chunkSize: 1000,
    chunkOverlap: 100,
  },

  // Rate Limiting
  rateLimit: {
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000, // 15 minutes
    chatLimit: 10, // messages per minute
    sessionLimit: 20, // session operations per 5 minutes
  },

  // Session Management
  session: {
    ttl: parseInt(process.env.SESSION_TTL) || 86400,
    maxMessages: parseInt(process.env.MAX_SESSION_MESSAGES) || 50,
    cleanupInterval: parseInt(process.env.SESSION_CLEANUP_INTERVAL) || 3600,
  },

  // News Ingestion
  news: {
    fetchLimit: parseInt(process.env.NEWS_FETCH_LIMIT) || 50,
    updateInterval: parseInt(process.env.NEWS_UPDATE_INTERVAL) || 3600000, // 1 hour
    rssFeeds: [
      "https://rss.cnn.com/rss/edition.rss",
      "https://feeds.bbci.co.uk/news/rss.xml",
      "https://rss.cnn.com/rss/edition_technology.rss",
      "https://feeds.npr.org/1001/rss.xml",
      "https://feeds.feedburner.com/TechCrunch",
    ],
    userAgent:
      "Mozilla/5.0 (compatible; RAGChatbot/1.0; +https://example.com/bot)",
  },

  // ChromaDB Configuration
  chroma: {
    path: "./chroma_data",
    collectionName: "news_articles",
    embeddingFunction: "jina",
    distance: "cosine",
    persistDirectory: "./chroma_data",
  },

  // Logging Configuration
  logging: {
    level: process.env.LOG_LEVEL || "info",
    file: process.env.LOG_FILE || null,
    console: true,
    timestamp: true,
  },

  // Security Settings
  security: {
    enableHelmet: true,
    enableCors: true,
    enableRateLimit: true,
    maxRequestSize: "10mb",
    timeout: 30000, // 30 seconds
  },

  // Feature Flags
  features: {
    enableWebSocket: true,
    enableSSE: true,
    enableMetrics: true,
    enableHealthCheck: true,
    enableSwagger: process.env.NODE_ENV === "development",
  },
};

// Validation functions
const validateConfig = () => {
  const errors = [];

  // Validate API keys
  if (!config.apis.jina.apiKey) {
    errors.push("JINA_API_KEY is required");
  }

  if (!config.apis.gemini.apiKey) {
    errors.push("GEMINI_API_KEY is required");
  }

  // Validate numeric values
  if (config.server.port < 1 || config.server.port > 65535) {
    errors.push("PORT must be a valid port number (1-65535)");
  }

  if (config.rag.maxQueryLength < 1) {
    errors.push("MAX_QUERY_LENGTH must be greater than 0");
  }

  if (config.rag.vectorSearchTopK < 1) {
    errors.push("VECTOR_SEARCH_TOP_K must be greater than 0");
  }

  return errors;
};

// Get configuration for specific service
const getServiceConfig = (serviceName) => {
  const serviceConfigs = {
    redis: config.redis,
    database: config.database,
    rag: config.rag,
    news: config.news,
    chroma: config.chroma,
    apis: config.apis,
    session: config.session,
    logging: config.logging,
    security: config.security,
    rateLimit: config.rateLimit,
  };

  return serviceConfigs[serviceName] || null;
};

// Export configuration
module.exports = {
  config,
  validateConfig,
  getServiceConfig,

  // Convenience exports
  isDevelopment: config.server.env === "development",
  isProduction: config.server.env === "production",
  isTest: config.server.env === "test",
};
