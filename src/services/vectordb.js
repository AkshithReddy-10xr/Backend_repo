const { ChromaClient } = require("chromadb");
const path = require("path");
const fs = require("fs").promises;
const { config } = require("../config");

class VectorDBService {
  constructor() {
    this.client = null;
    this.collection = null;
    this.isInitialized = false;
    this.collectionName = config.chroma.collectionName || "news_articles";
    this.persistPath = config.chroma.persistDirectory || "./chroma_data";
  }

  // Initialize ChromaDB client and collection
  async initialize() {
    try {
      console.log("Initializing ChromaDB...");

      // Ensure persist directory exists
      await this.ensureDirectoryExists(this.persistPath);

      // Create ChromaDB client
      this.client = new ChromaClient({
        path: this.persistPath,
      });

      // Test connection
      await this.client.heartbeat();
      console.log("✅ ChromaDB client connected");

      // Get or create collection
      await this.initializeCollection();

      this.isInitialized = true;
      console.log("✅ Vector database initialized successfully");

      return true;
    } catch (error) {
      console.error("❌ Failed to initialize ChromaDB:", error.message);

      // Create fallback in-memory storage
      this.client = new Map();
      this.collection = new Map();
      this.isInitialized = true;

      console.warn("🔄 Using in-memory vector storage as fallback");
      return false;
    }
  }

  // Ensure directory exists
  async ensureDirectoryExists(dirPath) {
    try {
      await fs.access(dirPath);
    } catch (error) {
      if (error.code === "ENOENT") {
        await fs.mkdir(dirPath, { recursive: true });
        console.log(`📁 Created directory: ${dirPath}`);
      } else {
        throw error;
      }
    }
  }

  // Initialize or get existing collection
  async initializeCollection() {
    try {
      // Try to get existing collection first
      try {
        this.collection = await this.client.getCollection({
          name: this.collectionName,
        });

        const count = await this.collection.count();
        console.log(
          `✅ Found existing collection '${this.collectionName}' with ${count} documents`
        );
      } catch (error) {
        // Collection doesn't exist, create it
        console.log(`📝 Creating new collection '${this.collectionName}'`);

        this.collection = await this.client.createCollection({
          name: this.collectionName,
          metadata: {
            "hnsw:space": "cosine",
            "hnsw:construction_ef": 100,
            "hnsw:M": 16,
          },
        });

        console.log(`✅ Created collection '${this.collectionName}'`);
      }
    } catch (error) {
      console.error("❌ Error initializing collection:", error.message);
      throw error;
    }
  }

  // Check if service is available
  isAvailable() {
    return this.isInitialized && (this.client || this.collection);
  }

  // Add documents to the collection
  async addDocuments(documents) {
    try {
      if (!this.isAvailable()) {
        throw new Error("Vector database not available");
      }

      // Handle fallback storage
      if (this.client instanceof Map) {
        documents.forEach((doc, index) => {
          const id = doc.id || `doc_${Date.now()}_${index}`;
          console.log("Storing document:", {
            id: id,
            contentType: typeof doc.content,
            contentPreview: doc.content
              ? doc.content.substring(0, 50)
              : "no content",
          });
          this.collection.set(id, doc);
        });

        console.log(
          `✅ Added ${documents.length} documents to in-memory storage`
        );
        return { success: true, count: documents.length };
      }

      // Prepare data for ChromaDB
      const ids = documents.map(
        (doc, index) => doc.id || `doc_${Date.now()}_${index}`
      );
      const embeddings = documents
        .map((doc) => doc.embedding || null)
        .filter(Boolean);
      const metadatas = documents.map((doc) => ({
        title: doc.title || "",
        content: doc.content || "",
        url: doc.url || "",
        published: doc.published || new Date().toISOString(),
        source: doc.source || "unknown",
        ...doc.metadata,
      }));
      const texts = documents.map((doc) => doc.content || doc.text || "");

      // Add to ChromaDB collection
      if (embeddings.length === documents.length) {
        // We have embeddings, use them
        await this.collection.add({
          ids: ids,
          embeddings: embeddings,
          metadatas: metadatas,
          documents: texts,
        });
      } else {
        // No embeddings, let ChromaDB generate them (if embedding function is configured)
        await this.collection.add({
          ids: ids,
          metadatas: metadatas,
          documents: texts,
        });
      }

      console.log(`✅ Added ${documents.length} documents to ChromaDB`);
      return { success: true, count: documents.length };
    } catch (error) {
      console.error("❌ Error adding documents:", error.message);
      return { success: false, error: error.message };
    }
  }

  // Search for similar documents
  async searchSimilar(queryEmbedding, nResults = 5, filter = null) {
    try {
      if (!this.isAvailable()) {
        throw new Error("Vector database not available");
      }

      // Handle fallback storage
      if (this.client instanceof Map) {
        const results = Array.from(this.collection.values()).slice(0, nResults);

        console.log(
          "Retrieved documents from in-memory storage:",
          results.map((doc) => ({
            id: doc.id,
            contentType: typeof doc.content,
            contentPreview: doc.content
              ? doc.content.substring(0, 50)
              : "no content",
          }))
        );

        return {
          documents: results.map((doc) => doc.content || ""), // Extract content string
          metadatas: results.map((doc) => doc.metadata || {}),
          distances: results.map(() => 0.5), // Mock similarity scores
          ids: results.map((doc) => doc.id),
        };
      }

      // Query ChromaDB
      const results = await this.collection.query({
        queryEmbeddings: [queryEmbedding],
        nResults: nResults,
        where: filter,
        include: ["documents", "metadatas", "distances"],
      });

      return {
        documents: results.documents[0] || [],
        metadatas: results.metadatas[0] || [],
        distances: results.distances[0] || [],
        ids: results.ids[0] || [],
      };
    } catch (error) {
      console.error("❌ Error searching documents:", error.message);
      return {
        documents: [],
        metadatas: [],
        distances: [],
        ids: [],
      };
    }
  }

  // Search by text query (requires embedding generation)
  async searchByText(queryText, nResults = 5, filter = null) {
    try {
      if (!this.isAvailable()) {
        throw new Error("Vector database not available");
      }

      // Handle fallback storage (simple text search)
      if (this.client instanceof Map) {
        const results = Array.from(this.collection.values())
          .filter((doc) => {
            const content = (doc.content || "").toLowerCase();
            const query = queryText.toLowerCase();
            return content.includes(query);
          })
          .slice(0, nResults);

        return {
          documents: results.map((doc) => doc.content || ""), // Extract content string
          metadatas: results.map((doc) => doc.metadata || {}),
          distances: results.map(() => 0.7), // Mock similarity scores
          ids: results.map((doc) => doc.id),
        };
      }

      // For ChromaDB, we need to generate embeddings first
      // This will be implemented when we create the embeddings service
      console.warn(
        "⚠️ Text search requires embeddings service - using fallback"
      );

      return {
        documents: [],
        metadatas: [],
        distances: [],
        ids: [],
      };
    } catch (error) {
      console.error("❌ Error searching by text:", error.message);
      return {
        documents: [],
        metadatas: [],
        distances: [],
        ids: [],
      };
    }
  }

  // Get document by ID
  async getDocument(id) {
    try {
      if (!this.isAvailable()) {
        return null;
      }

      // Handle fallback storage
      if (this.client instanceof Map) {
        return this.collection.get(id) || null;
      }

      // Get from ChromaDB
      const result = await this.collection.get({
        ids: [id],
        include: ["documents", "metadatas"],
      });

      if (result.ids.length === 0) {
        return null;
      }

      return {
        id: result.ids[0],
        content: result.documents[0],
        metadata: result.metadatas[0],
      };
    } catch (error) {
      console.error(`❌ Error getting document ${id}:`, error.message);
      return null;
    }
  }

  // Update document
  async updateDocument(id, updates) {
    try {
      if (!this.isAvailable()) {
        throw new Error("Vector database not available");
      }

      // Handle fallback storage
      if (this.client instanceof Map) {
        const existing = this.collection.get(id);
        if (existing) {
          this.collection.set(id, { ...existing, ...updates });
          return true;
        }
        return false;
      }

      // Update in ChromaDB
      await this.collection.update({
        ids: [id],
        documents: updates.content ? [updates.content] : undefined,
        metadatas: updates.metadata ? [updates.metadata] : undefined,
      });

      return true;
    } catch (error) {
      console.error(`❌ Error updating document ${id}:`, error.message);
      return false;
    }
  }

  // Delete document
  async deleteDocument(id) {
    try {
      if (!this.isAvailable()) {
        throw new Error("Vector database not available");
      }

      // Handle fallback storage
      if (this.client instanceof Map) {
        return this.collection.delete(id);
      }

      // Delete from ChromaDB
      await this.collection.delete({
        ids: [id],
      });

      return true;
    } catch (error) {
      console.error(`❌ Error deleting document ${id}:`, error.message);
      return false;
    }
  }

  // Get collection statistics
  async getStats() {
    try {
      if (!this.isAvailable()) {
        return {
          count: 0,
          storage: "unavailable",
        };
      }

      // Handle fallback storage
      if (this.client instanceof Map) {
        return {
          count: this.collection.size,
          storage: "in-memory",
          collections: ["fallback"],
        };
      }

      // Get ChromaDB stats
      const count = await this.collection.count();
      const collections = await this.client.listCollections();

      return {
        count: count,
        storage: "chromadb",
        collections: collections.map((c) => c.name),
        persistPath: this.persistPath,
      };
    } catch (error) {
      console.error("❌ Error getting vector DB stats:", error.message);
      return {
        count: 0,
        storage: "error",
        error: error.message,
      };
    }
  }

  // Clear all documents from collection
  async clear() {
    try {
      if (!this.isAvailable()) {
        throw new Error("Vector database not available");
      }

      // Handle fallback storage
      if (this.client instanceof Map) {
        this.collection.clear();
        console.log("✅ Cleared in-memory vector storage");
        return true;
      }

      // For ChromaDB, delete and recreate collection
      await this.client.deleteCollection({ name: this.collectionName });
      await this.initializeCollection();

      console.log(`✅ Cleared collection '${this.collectionName}'`);
      return true;
    } catch (error) {
      console.error("❌ Error clearing collection:", error.message);
      return false;
    }
  }

  // Health check
  async healthCheck() {
    try {
      if (!this.isAvailable()) {
        return {
          status: "unavailable",
          message: "Vector database not initialized",
        };
      }

      // Handle fallback storage
      if (this.client instanceof Map) {
        return {
          status: "ok",
          storage: "in-memory",
          documents: this.collection.size,
        };
      }

      // Check ChromaDB health
      await this.client.heartbeat();
      const count = await this.collection.count();

      return {
        status: "ok",
        storage: "chromadb",
        documents: count,
        collection: this.collectionName,
      };
    } catch (error) {
      return {
        status: "error",
        message: error.message,
      };
    }
  }

  // Close connection (cleanup)
  async close() {
    try {
      if (this.client && typeof this.client.close === "function") {
        await this.client.close();
      }

      this.client = null;
      this.collection = null;
      this.isInitialized = false;

      console.log("✅ Vector database connection closed");
    } catch (error) {
      console.error("❌ Error closing vector database:", error);
    }
  }
}

// Create and export singleton instance
const vectorDBService = new VectorDBService();
module.exports = vectorDBService;
