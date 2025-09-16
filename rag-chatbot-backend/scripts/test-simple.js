require("dotenv").config();
const axios = require("axios");
const RSSParser = require("rss-parser");

async function testRSSConnectivity() {
  console.log("Testing RSS feed connectivity...\n");

  const testFeeds = [
    "https://rss.cnn.com/rss/edition.rss",
    "https://feeds.bbci.co.uk/news/rss.xml",
    "https://feeds.npr.org/1001/rss.xml",
  ];

  const parser = new RSSParser();

  for (const feedUrl of testFeeds) {
    try {
      console.log(`Testing: ${feedUrl}`);

      // Test basic connectivity
      const response = await axios.get(feedUrl, {
        timeout: 10000,
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; RAGChatbot/1.0)",
        },
      });

      console.log(`✅ HTTP Status: ${response.status}`);

      // Test RSS parsing
      const feed = await parser.parseString(response.data);
      console.log(`✅ Feed Title: ${feed.title}`);
      console.log(`✅ Articles Found: ${feed.items.length}`);

      if (feed.items.length > 0) {
        const sample = feed.items[0];
        console.log(`✅ Sample Article: ${sample.title?.substring(0, 60)}...`);
        console.log(
          `✅ Content Length: ${
            (sample.contentSnippet || sample.content || "").length
          } chars\n`
        );
      }
    } catch (error) {
      console.error(`❌ Failed to fetch ${feedUrl}:`);
      console.error(`   Error: ${error.message}\n`);
    }
  }
}

testRSSConnectivity()
  .then(() => {
    console.log("RSS connectivity test completed");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Test failed:", error);
    process.exit(1);
  });
