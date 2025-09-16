require("dotenv").config();
const embeddingsService = require("../src/services/embeddings");
const vectorDbService = require("../src/services/vectordb");

async function debugSearch() {
  console.log("Debugging vector search...");

  // Initialize (same as server)
  await vectorDbService.initialize();

  // Check what's in the database
  const stats = await vectorDbService.getStats();
  console.log("Vector DB stats:", stats);

  // If empty, add a test article directly
  if (stats.count === 0) {
    console.log("Database is empty, adding test article...");

    const testArticle = {
      id: "debug_test",
      title: "AI in Software Development",
      content:
        "AI tools are transforming how developers write code with automated assistance",
      embedding: (
        await embeddingsService.generateDocumentEmbedding(
          "AI tools are transforming how developers write code with automated assistance"
        )
      ).embedding,
      metadata: { source: "Debug Test" },
    };

    await vectorDbService.addDocuments([testArticle]);
    console.log("Test article added");
  }

  // Now try searching
  const query = "AI in software development";
  const queryEmbedding = await embeddingsService.generateQueryEmbedding(query);

  const results = await vectorDbService.searchSimilar(
    queryEmbedding.embedding,
    5
  );

  console.log("Search results:", {
    documentsFound: results.documents.length,
    distances: results.distances,
    similarities: results.distances?.map((d) => 1 - d), // Convert distance to similarity
  });

  if (results.documents.length > 0) {
    console.log(
      "First result:",
      results.documents[0].substring(0, 100) + "..."
    );
  }
}

debugSearch().then(() => process.exit(0));
