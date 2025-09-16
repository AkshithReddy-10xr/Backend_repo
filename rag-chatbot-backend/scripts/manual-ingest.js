require("dotenv").config();
const vectorDbService = require("../src/services/vectordb");
const embeddingsService = require("../src/services/embeddings");

// Sample tech news articles for testing
const sampleArticles = [
  {
    id: "tech_1",
    title: "AI Revolution in Software Development",
    content:
      "Artificial Intelligence is transforming how software developers write code. New AI-powered tools like GitHub Copilot and ChatGPT are helping developers write better code faster. These tools can generate code snippets, debug issues, and even write entire functions based on natural language descriptions.",
    source: "Tech News Today",
    category: "Technology",
  },
  {
    id: "tech_2",
    title: "Quantum Computing Breakthrough",
    content:
      "Researchers at MIT have achieved a major breakthrough in quantum computing by developing a new type of quantum processor that can maintain stability at higher temperatures. This advancement could make quantum computers more practical for real-world applications.",
    source: "Science Daily",
    category: "Science",
  },
];

async function manualIngestion() {
  try {
    console.log("Starting manual content ingestion...");

    await vectorDbService.initialize();
    console.log("✅ Vector DB initialized");

    if (!embeddingsService.isServiceAvailable()) {
      console.error("❌ Embeddings service not available - check JINA_API_KEY");
      return;
    }

    const processedArticles = [];

    for (let i = 0; i < sampleArticles.length; i++) {
      const article = sampleArticles[i];
      console.log(`Processing: ${article.title}`);

      const embeddingResult = await embeddingsService.generateDocumentEmbedding(
        article.content
      );

      processedArticles.push({
        id: article.id,
        title: article.title,
        content: article.content,
        embedding: embeddingResult.embedding,
        metadata: {
          source: article.source,
          category: article.category,
          processedAt: new Date().toISOString(),
        },
      });
    }

    const storeResult = await vectorDbService.addDocuments(processedArticles);
    console.log("✅ Articles stored successfully");
  } catch (error) {
    console.error("❌ Error:", error.message);
  }
}

manualIngestion().then(() => process.exit(0));
