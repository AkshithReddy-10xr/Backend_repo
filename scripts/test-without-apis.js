require("dotenv").config();
const vectorDbService = require("../src/services/vectordb");

async function testOffline() {
  try {
    console.log("Testing RAG system without external APIs...");

    // Initialize vector DB
    await vectorDbService.initialize();
    console.log("✅ Vector DB initialized");

    // Create mock articles with fake embeddings for testing
    const mockArticles = [
      {
        id: "test_1",
        title: "AI Revolution in Software Development",
        content:
          "AI tools are transforming how developers write code with automated assistance.",
        embedding: Array(384)
          .fill(0)
          .map(() => Math.random() - 0.5), // Fake 384-dim embedding
        metadata: { source: "Test", category: "Technology" },
      },
      {
        id: "test_2",
        title: "Quantum Computing Breakthrough",
        content:
          "New quantum processors achieve stability at higher temperatures for practical applications.",
        embedding: Array(384)
          .fill(0)
          .map(() => Math.random() - 0.5),
        metadata: { source: "Test", category: "Science" },
      },
    ];

    // Store mock articles
    const result = await vectorDbService.addDocuments(mockArticles);
    console.log("✅ Mock articles stored:", result);

    // Test search
    const queryEmbedding = Array(384)
      .fill(0)
      .map(() => Math.random() - 0.5);
    const searchResults = await vectorDbService.searchSimilar(
      queryEmbedding,
      2
    );
    console.log("✅ Search test results:", {
      found: searchResults.documents.length,
      titles: searchResults.metadatas.map((m) => m.source),
    });

    console.log("\n🎉 Offline test completed successfully!");
    console.log(
      "Your vector database is working. Once you add API keys, the full RAG pipeline will work."
    );
  } catch (error) {
    console.error("❌ Offline test failed:", error.message);
  }
}

testOffline().then(() => process.exit(0));
