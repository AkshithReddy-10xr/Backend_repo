const axios = require("axios");
const cheerio = require("cheerio");
const RSSParser = require("rss-parser");
const { config } = require("../config");
const embeddingsService = require("./embeddings");
const vectorDbService = require("./vectordb");

class NewsIngestionService {
  constructor() {
    this.parser = new RSSParser({
      customFields: {
        item: ["media:content", "media:thumbnail"],
      },
    });
    this.userAgent = config.news.userAgent;
    this.fetchLimit = config.news.fetchLimit;
    this.rssFeeds = config.news.rssFeeds;
  }

  // Fetch articles from RSS feeds
  async fetchFromRSS(feedUrl, limit = 10) {
    try {
      console.log(`🔄 Fetching articles from RSS: ${feedUrl}`);

      const response = await axios.get(feedUrl, {
        headers: {
          "User-Agent": this.userAgent,
        },
        timeout: 10000,
      });

      const feed = await this.parser.parseString(response.data);

      const articles = feed.items.slice(0, limit).map((item, index) => ({
        id: `rss_${Date.now()}_${index}`,
        title: item.title || "No title",
        content: this.cleanText(
          item.contentSnippet || item.content || item.summary || ""
        ),
        url: item.link || "",
        published: new Date(
          item.pubDate || item.isoDate || Date.now()
        ).toISOString(),
        source: feed.title || "RSS Feed",
        author: item.creator || item["dc:creator"] || "Unknown",
        category: item.categories ? item.categories.join(", ") : "General",
        guid: item.guid || item.id || item.link,
      }));

      console.log(`✅ Fetched ${articles.length} articles from RSS`);
      return articles;
    } catch (error) {
      console.error(`❌ Error fetching RSS feed ${feedUrl}:`, error.message);
      return [];
    }
  }

  // Scrape full article content from URL
  async scrapeFullArticle(url) {
    try {
      console.log(`🔄 Scraping full article: ${url}`);

      const response = await axios.get(url, {
        headers: {
          "User-Agent": this.userAgent,
        },
        timeout: 15000,
      });

      const $ = cheerio.load(response.data);

      // Try different selectors for article content
      const contentSelectors = [
        '[data-module="ArticleBody"] p',
        ".article-body p",
        ".story-body p",
        ".content p",
        "main p",
        "article p",
        ".post-content p",
        ".entry-content p",
      ];

      let content = "";
      let title = "";
      let publishedDate = "";

      // Extract title
      title =
        $("h1").first().text().trim() ||
        $("title").text().trim() ||
        $('[data-testid="headline"]').text().trim();

      // Extract published date
      publishedDate =
        $("time").attr("datetime") ||
        $('[data-testid="timestamp"]').text() ||
        $('meta[property="article:published_time"]').attr("content") ||
        new Date().toISOString();

      // Extract content
      for (const selector of contentSelectors) {
        const paragraphs = $(selector)
          .map((i, el) => $(el).text().trim())
          .get();
        if (paragraphs.length > 2) {
          // Found substantial content
          content = paragraphs.join(" ");
          break;
        }
      }

      // Fallback: get all paragraph text
      if (!content) {
        content = $("p")
          .map((i, el) => $(el).text().trim())
          .get()
          .filter((text) => text.length > 50) // Filter out short paragraphs
          .join(" ");
      }

      const cleanContent = this.cleanText(content);

      if (cleanContent.length < 100) {
        console.warn(
          `⚠️ Short content extracted from ${url} (${cleanContent.length} chars)`
        );
      }

      console.log(
        `✅ Scraped article: ${title.substring(0, 50)}... (${
          cleanContent.length
        } chars)`
      );

      return {
        title: title,
        content: cleanContent,
        published: publishedDate,
        wordCount: cleanContent.split(" ").length,
      };
    } catch (error) {
      console.error(`❌ Error scraping article ${url}:`, error.message);
      return {
        title: "Could not extract title",
        content: "Could not extract content",
        published: new Date().toISOString(),
        wordCount: 0,
      };
    }
  }

  // Clean and normalize text content
  cleanText(text) {
    if (!text || typeof text !== "string") {
      return "";
    }

    return (
      text
        // Remove HTML tags
        .replace(/<[^>]*>/g, " ")
        // Remove extra whitespace
        .replace(/\s+/g, " ")
        // Remove special characters but keep punctuation
        .replace(/[^\w\s.,!?;:()\-'"]/g, " ")
        // Remove URLs
        .replace(/https?:\/\/[^\s]+/g, "")
        // Remove email addresses
        .replace(/\S+@\S+\.\S+/g, "")
        // Trim and normalize spaces
        .trim()
        // Remove very short words (likely artifacts)
        .split(" ")
        .filter((word) => word.length > 1 || /[.!?]/.test(word))
        .join(" ")
    );
  }

  // Chunk long articles into smaller pieces
  chunkText(text, maxChunkSize = 1000, overlap = 100) {
    if (!text || text.length <= maxChunkSize) {
      return [text];
    }

    const chunks = [];
    let startIndex = 0;

    while (startIndex < text.length) {
      let endIndex = startIndex + maxChunkSize;

      // Try to break at sentence boundaries
      if (endIndex < text.length) {
        const lastSentence = text.lastIndexOf(".", endIndex);
        const lastQuestion = text.lastIndexOf("?", endIndex);
        const lastExclamation = text.lastIndexOf("!", endIndex);

        const lastPunctuation = Math.max(
          lastSentence,
          lastQuestion,
          lastExclamation
        );

        if (lastPunctuation > startIndex + maxChunkSize * 0.5) {
          endIndex = lastPunctuation + 1;
        }
      }

      const chunk = text.substring(startIndex, endIndex).trim();
      if (chunk.length > 0) {
        chunks.push(chunk);
      }

      // Move start index with overlap
      startIndex = Math.max(endIndex - overlap, startIndex + 1);
    }

    return chunks.filter((chunk) => chunk.length > 50); // Filter out very short chunks
  }

  // Process and store articles with embeddings
  async processAndStoreArticles(articles) {
    try {
      console.log(`🔄 Processing ${articles.length} articles...`);

      const processedArticles = [];
      let successCount = 0;
      let errorCount = 0;

      for (let i = 0; i < articles.length; i++) {
        const article = articles[i];

        try {
          // Enhance article with full content if URL is available
          let enhancedArticle = { ...article };

          if (article.url && article.content.length < 200) {
            console.log(
              `🔍 Enhancing article ${i + 1}/${
                articles.length
              }: ${article.title.substring(0, 50)}...`
            );
            const fullContent = await this.scrapeFullArticle(article.url);

            enhancedArticle = {
              ...article,
              title: fullContent.title || article.title,
              content:
                fullContent.content.length > article.content.length
                  ? fullContent.content
                  : article.content,
              wordCount: fullContent.wordCount,
            };
          }

          // Skip articles with insufficient content
          if (enhancedArticle.content.length < 100) {
            console.warn(
              `⚠️ Skipping article with insufficient content: ${enhancedArticle.title}`
            );
            continue;
          }

          // Chunk long articles
          const chunks = this.chunkText(enhancedArticle.content);

          for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
            const chunk = chunks[chunkIndex];

            try {
              // Generate embedding for the chunk
              const embeddingResult =
                await embeddingsService.generateDocumentEmbedding(chunk);

              const processedChunk = {
                id: `${enhancedArticle.id}_chunk_${chunkIndex}`,
                title: enhancedArticle.title,
                content: chunk,
                embedding: embeddingResult.embedding,
                metadata: {
                  originalId: enhancedArticle.id,
                  url: enhancedArticle.url,
                  published: enhancedArticle.published,
                  source: enhancedArticle.source,
                  author: enhancedArticle.author,
                  category: enhancedArticle.category,
                  chunkIndex: chunkIndex,
                  totalChunks: chunks.length,
                  wordCount: chunk.split(" ").length,
                  processedAt: new Date().toISOString(),
                },
              };

              processedArticles.push(processedChunk);
              successCount++;
            } catch (embeddingError) {
              console.error(
                `❌ Error generating embedding for chunk ${chunkIndex} of article ${
                  i + 1
                }:`,
                embeddingError.message
              );
              errorCount++;
            }
          }

          // Small delay to avoid rate limiting
          if (i < articles.length - 1) {
            await new Promise((resolve) => setTimeout(resolve, 200));
          }
        } catch (articleError) {
          console.error(
            `❌ Error processing article ${i + 1}:`,
            articleError.message
          );
          errorCount++;
        }
      }

      // Store processed articles in vector database
      if (processedArticles.length > 0) {
        console.log(
          `💾 Storing ${processedArticles.length} processed chunks in vector database...`
        );
        const storeResult = await vectorDbService.addDocuments(
          processedArticles
        );

        if (storeResult.success) {
          console.log(`✅ Successfully stored ${storeResult.count} chunks`);
        } else {
          console.error(`❌ Error storing chunks: ${storeResult.error}`);
        }
      }

      const summary = {
        totalArticles: articles.length,
        processedChunks: processedArticles.length,
        successCount: successCount,
        errorCount: errorCount,
        averageChunksPerArticle:
          articles.length > 0
            ? (processedArticles.length / articles.length).toFixed(1)
            : 0,
      };

      console.log(`✅ Processing complete:`, summary);
      return summary;
    } catch (error) {
      console.error("❌ Error processing articles:", error.message);
      throw error;
    }
  }

  // Main ingestion method
  async ingestNews(options = {}) {
    try {
      const limit = options.limit || this.fetchLimit;
      const sources = options.sources || this.rssFeeds;

      console.log(
        `🚀 Starting news ingestion from ${sources.length} sources...`
      );

      let allArticles = [];

      // Fetch from all RSS sources
      for (const feedUrl of sources) {
        try {
          const articles = await this.fetchFromRSS(
            feedUrl,
            Math.ceil(limit / sources.length)
          );
          allArticles = allArticles.concat(articles);

          // Small delay between feeds
          await new Promise((resolve) => setTimeout(resolve, 1000));
        } catch (feedError) {
          console.error(
            `❌ Failed to fetch from ${feedUrl}:`,
            feedError.message
          );
        }
      }

      // Remove duplicates based on URL or title
      const uniqueArticles = this.removeDuplicates(allArticles);

      // Limit to requested number
      const finalArticles = uniqueArticles.slice(0, limit);

      console.log(
        `📊 Fetched ${allArticles.length} articles, ${uniqueArticles.length} unique, processing ${finalArticles.length}`
      );

      // Process and store articles
      const processingResult = await this.processAndStoreArticles(
        finalArticles
      );

      return {
        success: true,
        summary: {
          requested: limit,
          fetched: allArticles.length,
          unique: uniqueArticles.length,
          processed: finalArticles.length,
          ...processingResult,
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error("❌ News ingestion failed:", error.message);
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  // Remove duplicate articles
  removeDuplicates(articles) {
    const seen = new Set();
    const unique = [];

    for (const article of articles) {
      // Create a key based on URL or title
      const key =
        article.url || article.title.toLowerCase().replace(/\s+/g, " ").trim();

      if (!seen.has(key)) {
        seen.add(key);
        unique.push(article);
      }
    }

    return unique;
  }

  // Get ingestion statistics
  async getStats() {
    try {
      const vectorStats = await vectorDbService.getStats();

      return {
        vectorDatabase: vectorStats,
        rssFeeds: this.rssFeeds.length,
        fetchLimit: this.fetchLimit,
        userAgent: this.userAgent,
        lastIngestion: null, // Could be stored in Redis
      };
    } catch (error) {
      return {
        error: error.message,
        vectorDatabase: { count: 0, storage: "unknown" },
        rssFeeds: this.rssFeeds.length,
      };
    }
  }

  // Health check
  async healthCheck() {
    try {
      // Test RSS feed connectivity
      const testFeed = this.rssFeeds[0];
      await axios.get(testFeed, {
        headers: { "User-Agent": this.userAgent },
        timeout: 5000,
      });

      const embeddingHealth = await embeddingsService.healthCheck();
      const vectorHealth = await vectorDbService.healthCheck();

      return {
        status: "ok",
        rssConnectivity: "ok",
        embeddings: embeddingHealth.status,
        vectorDb: vectorHealth.status,
      };
    } catch (error) {
      return {
        status: "error",
        message: error.message,
      };
    }
  }
}

// Create and export singleton instance
const newsIngestionService = new NewsIngestionService();
module.exports = newsIngestionService;
