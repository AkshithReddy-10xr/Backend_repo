const Redis = require("ioredis");
const { v4: uuidv4 } = require("uuid");

class RedisService {
  constructor() {
    this.client = null;
    this.isConnected = false;
    this.retryAttempts = 0;
    this.maxRetries = 3;
  }

  // Connect to Redis
  async connect() {
    try {
      const redisUrl = process.env.REDIS_URL;

      if (!redisUrl) {
        console.warn(
          "⚠️ REDIS_URL not provided, using memory storage fallback"
        );
        this.client = new Map(); // In-memory fallback
        this.isConnected = true;
        return true;
      }

      console.log("Connecting to Redis...");

      // Create Redis client with connection options
      this.client = new Redis(redisUrl, {
        connectTimeout: 10000,
        lazyConnect: true,
        maxRetriesPerRequest: 3,
        retryDelayOnFailover: 100,
        enableAutoPipelining: true,
        family: 4, // Use IPv4
      });

      // Event listeners
      this.client.on("connect", () => {
        console.log("✅ Redis connected successfully");
        this.isConnected = true;
        this.retryAttempts = 0;
      });

      this.client.on("ready", () => {
        console.log("✅ Redis ready for operations");
      });

      this.client.on("error", (error) => {
        console.error("❌ Redis connection error:", error.message);
        this.isConnected = false;

        // Fallback to in-memory storage on persistent errors
        if (this.retryAttempts >= this.maxRetries) {
          console.warn(
            "🔄 Redis max retries reached, switching to memory storage"
          );
          this.client = new Map();
          this.isConnected = true;
        }
        this.retryAttempts++;
      });

      this.client.on("close", () => {
        console.log("🔌 Redis connection closed");
        this.isConnected = false;
      });

      this.client.on("reconnecting", () => {
        console.log("🔄 Redis reconnecting...");
      });

      // Connect to Redis
      await this.client.connect();

      // Test connection
      await this.client.ping();

      return true;
    } catch (error) {
      console.error("❌ Failed to connect to Redis:", error.message);

      // Fallback to in-memory storage
      console.warn("🔄 Using in-memory storage as fallback");
      this.client = new Map();
      this.isConnected = true;
      return false;
    }
  }

  // Disconnect from Redis
  async disconnect() {
    try {
      if (this.client && typeof this.client.disconnect === "function") {
        await this.client.disconnect();
      }
      this.isConnected = false;
      console.log("✅ Redis disconnected gracefully");
    } catch (error) {
      console.error("❌ Error disconnecting from Redis:", error);
    }
  }

  // Check if Redis is available
  isAvailable() {
    return this.isConnected && this.client;
  }

  // Set key-value with TTL
  async set(key, value, ttlSeconds = null) {
    try {
      if (!this.isAvailable()) {
        throw new Error("Redis not available");
      }

      const serializedValue = JSON.stringify(value);

      // Use Map fallback
      if (this.client instanceof Map) {
        this.client.set(key, serializedValue);

        // Simple TTL simulation for Map
        if (ttlSeconds) {
          setTimeout(() => {
            this.client.delete(key);
          }, ttlSeconds * 1000);
        }
        return true;
      }

      // Use Redis
      if (ttlSeconds) {
        await this.client.setex(key, ttlSeconds, serializedValue);
      } else {
        await this.client.set(key, serializedValue);
      }

      return true;
    } catch (error) {
      console.error(`❌ Redis SET error for key ${key}:`, error.message);
      return false;
    }
  }

  // Get value by key
  async get(key) {
    try {
      if (!this.isAvailable()) {
        return null;
      }

      let value;

      // Use Map fallback
      if (this.client instanceof Map) {
        value = this.client.get(key);
      } else {
        // Use Redis
        value = await this.client.get(key);
      }

      if (value === null || value === undefined) {
        return null;
      }

      return JSON.parse(value);
    } catch (error) {
      console.error(`❌ Redis GET error for key ${key}:`, error.message);
      return null;
    }
  }

  // Delete key
  async del(key) {
    try {
      if (!this.isAvailable()) {
        return false;
      }

      // Use Map fallback
      if (this.client instanceof Map) {
        return this.client.delete(key);
      }

      // Use Redis
      const result = await this.client.del(key);
      return result > 0;
    } catch (error) {
      console.error(`❌ Redis DEL error for key ${key}:`, error.message);
      return false;
    }
  }

  // Check if key exists
  async exists(key) {
    try {
      if (!this.isAvailable()) {
        return false;
      }

      // Use Map fallback
      if (this.client instanceof Map) {
        return this.client.has(key);
      }

      // Use Redis
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      console.error(`❌ Redis EXISTS error for key ${key}:`, error.message);
      return false;
    }
  }

  // Set TTL for existing key
  async expire(key, seconds) {
    try {
      if (!this.isAvailable() || this.client instanceof Map) {
        return false;
      }

      const result = await this.client.expire(key, seconds);
      return result === 1;
    } catch (error) {
      console.error(`❌ Redis EXPIRE error for key ${key}:`, error.message);
      return false;
    }
  }

  // Get all keys matching pattern
  async keys(pattern = "*") {
    try {
      if (!this.isAvailable()) {
        return [];
      }

      // Use Map fallback
      if (this.client instanceof Map) {
        const allKeys = Array.from(this.client.keys());
        if (pattern === "*") return allKeys;

        // Simple pattern matching for *
        const regex = new RegExp(pattern.replace("*", ".*"));
        return allKeys.filter((key) => regex.test(key));
      }

      // Use Redis
      return await this.client.keys(pattern);
    } catch (error) {
      console.error(
        `❌ Redis KEYS error for pattern ${pattern}:`,
        error.message
      );
      return [];
    }
  }

  // Session Management Methods

  // Generate new session ID
  generateSessionId() {
    return `session:${uuidv4()}`;
  }

  // Create new session
  async createSession(sessionId = null) {
    try {
      const id = sessionId || this.generateSessionId();
      const session = {
        id,
        createdAt: new Date().toISOString(),
        lastActivity: new Date().toISOString(),
        messages: [],
      };

      const ttl = parseInt(process.env.SESSION_TTL) || 86400; // 24 hours default
      await this.set(`session:${id}`, session, ttl);

      console.log(`✅ Session created: ${id}`);
      return id;
    } catch (error) {
      console.error("❌ Error creating session:", error);
      return null;
    }
  }

  // Get session data
  async getSession(sessionId) {
    try {
      const session = await this.get(`session:${sessionId}`);
      if (session) {
        // Update last activity
        session.lastActivity = new Date().toISOString();
        const ttl = parseInt(process.env.SESSION_TTL) || 86400;
        await this.set(`session:${sessionId}`, session, ttl);
      }
      return session;
    } catch (error) {
      console.error(`❌ Error getting session ${sessionId}:`, error);
      return null;
    }
  }

  // Update session data
  async updateSession(sessionId, sessionData) {
    try {
      sessionData.lastActivity = new Date().toISOString();
      const ttl = parseInt(process.env.SESSION_TTL) || 86400;
      await this.set(`session:${sessionId}`, sessionData, ttl);
      return true;
    } catch (error) {
      console.error(`❌ Error updating session ${sessionId}:`, error);
      return false;
    }
  }

  // Delete session
  async deleteSession(sessionId) {
    try {
      const result = await this.del(`session:${sessionId}`);
      if (result) {
        console.log(`✅ Session deleted: ${sessionId}`);
      }
      return result;
    } catch (error) {
      console.error(`❌ Error deleting session ${sessionId}:`, error);
      return false;
    }
  }

  // Add message to session
  async addMessage(sessionId, message) {
    try {
      const session = await this.getSession(sessionId);
      if (!session) {
        console.error(`❌ Session ${sessionId} not found`);
        return false;
      }

      // Add message with timestamp
      const messageWithTimestamp = {
        ...message,
        timestamp: new Date().toISOString(),
      };

      session.messages.push(messageWithTimestamp);

      // Limit message history
      const maxMessages = parseInt(process.env.MAX_SESSION_MESSAGES) || 50;
      if (session.messages.length > maxMessages) {
        session.messages = session.messages.slice(-maxMessages);
      }

      await this.updateSession(sessionId, session);
      return true;
    } catch (error) {
      console.error(`❌ Error adding message to session ${sessionId}:`, error);
      return false;
    }
  }

  // Get session messages
  async getSessionMessages(sessionId) {
    try {
      const session = await this.getSession(sessionId);
      return session ? session.messages : [];
    } catch (error) {
      console.error(
        `❌ Error getting messages for session ${sessionId}:`,
        error
      );
      return [];
    }
  }

  // Clear session messages
  async clearSessionMessages(sessionId) {
    try {
      const session = await this.getSession(sessionId);
      if (!session) {
        return false;
      }

      session.messages = [];
      await this.updateSession(sessionId, session);
      console.log(`✅ Session messages cleared: ${sessionId}`);
      return true;
    } catch (error) {
      console.error(`❌ Error clearing session messages ${sessionId}:`, error);
      return false;
    }
  }

  // Get session statistics
  async getStats() {
    try {
      const sessionKeys = await this.keys("session:*");
      const totalSessions = sessionKeys.length;

      let totalMessages = 0;
      let activeSessions = 0;
      const now = new Date();

      for (const key of sessionKeys) {
        const session = await this.get(key);
        if (session) {
          totalMessages += session.messages.length;

          // Consider session active if last activity was within 1 hour
          const lastActivity = new Date(session.lastActivity);
          const hoursSinceActivity = (now - lastActivity) / (1000 * 60 * 60);
          if (hoursSinceActivity < 1) {
            activeSessions++;
          }
        }
      }

      return {
        totalSessions,
        activeSessions,
        totalMessages,
        memoryUsage:
          this.client instanceof Map ? "In-Memory Fallback" : "Redis",
      };
    } catch (error) {
      console.error("❌ Error getting Redis stats:", error);
      return {
        totalSessions: 0,
        activeSessions: 0,
        totalMessages: 0,
        memoryUsage: "Unknown",
      };
    }
  }
}

// Create and export singleton instance
const redisService = new RedisService();
module.exports = redisService;
