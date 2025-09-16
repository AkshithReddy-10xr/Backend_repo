require("dotenv").config();
const axios = require("axios");

async function testJinaAPI() {
  console.log("Testing Jina API directly...");

  const apiKey = process.env.JINA_API_KEY;
  console.log("API Key present:", !!apiKey);
  console.log("API Key length:", apiKey ? apiKey.length : 0);

  const testText = "This is a simple test text for embedding generation.";

  try {
    const response = await axios.post(
      "https://api.jina.ai/v1/embeddings",
      {
        input: [testText],
        model: "jina-embeddings-v2-base-en",
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        timeout: 30000,
      }
    );

    console.log("Success! Response status:", response.status);
    console.log(
      "Embedding dimensions:",
      response.data.data[0].embedding.length
    );
    console.log("Usage:", response.data.usage);
  } catch (error) {
    console.log("Error details:");
    console.log("Status:", error.response?.status);
    console.log("Status text:", error.response?.statusText);
    console.log(
      "Response data:",
      JSON.stringify(error.response?.data, null, 2)
    );
    console.log("Request headers:", error.config?.headers);
  }
}

testJinaAPI().then(() => process.exit(0));
