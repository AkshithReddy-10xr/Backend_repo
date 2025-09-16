const { GoogleGenerativeAI } = require("@google/generative-ai");
const { config } = require("../config");

class LLMService {
  constructor() {
    this.apiKey = config.apis.gemini.apiKey;
    this.model = config.apis.gemini.model;
    this.maxTokens = config.apis.gemini.maxTokens;
    this.temperature = config.apis.gemini.temperature;
    this.topP = config.apis.gemini.topP;

    if (this.apiKey) {
      this.genAI = new GoogleGenerativeAI(this.apiKey);
      this.geminiModel = this.genAI.getGenerativeModel({ model: this.model });
      this.isAvailable = true;
    } else {
      console.warn("⚠️ Gemini API key not configured - LLM service disabled");
      this.isAvailable = false;
    }
  }

  // Check if service is available
  isServiceAvailable() {
    return this.isAvailable && this.apiKey;
  }

  // Generate response from Gemini
  async generateResponse(prompt, options = {}) {
    try {
      if (!this.isServiceAvailable()) {
        throw new Error("LLM service not available - missing API key");
      }

      if (!prompt || typeof prompt !== "string") {
        throw new Error("Prompt is required and must be a string");
      }

      console.log(
        `🔄 Generating response for prompt (${prompt.length} chars)...`
      );

      const generationConfig = {
        temperature: options.temperature || this.temperature,
        topP: options.topP || this.topP,
        maxOutputTokens: options.maxTokens || this.maxTokens,
      };

      const result = await this.geminiModel.generateContent({
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }],
          },
        ],
        generationConfig,
      });

      const response = await result.response;
      const text = response.text();

      if (!text || text.trim().length === 0) {
        throw new Error("Empty response from Gemini API");
      }

      console.log(`✅ Generated response (${text.length} chars)`);

      return {
        text: text.trim(),
        model: this.model,
        usage: {
          promptTokens: this.estimateTokens(prompt),
          completionTokens: this.estimateTokens(text),
          totalTokens: this.estimateTokens(prompt + text),
        },
      };
    } catch (error) {
      console.error("❌ Error generating LLM response:", error.message);

      if (error.message.includes("API_KEY_INVALID")) {
        throw new Error("Invalid Gemini API key");
      } else if (error.message.includes("RATE_LIMIT")) {
        throw new Error("Gemini API rate limit exceeded");
      } else if (error.message.includes("SAFETY")) {
        throw new Error("Content blocked by safety filters");
      } else {
        throw new Error(`LLM generation failed: ${error.message}`);
      }
    }
  }

  // Generate streaming response
  async generateStreamingResponse(prompt, options = {}, onChunk = null) {
    try {
      if (!this.isServiceAvailable()) {
        throw new Error("LLM service not available - missing API key");
      }

      console.log(`🔄 Generating streaming response...`);

      const generationConfig = {
        temperature: options.temperature || this.temperature,
        topP: options.topP || this.topP,
        maxOutputTokens: options.maxTokens || this.maxTokens,
      };

      const result = await this.geminiModel.generateContentStream({
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }],
          },
        ],
        generationConfig,
      });

      let fullText = "";
      let chunkCount = 0;

      for await (const chunk of result.stream) {
        const chunkText = chunk.text();

        if (chunkText) {
          fullText += chunkText;
          chunkCount++;

          if (onChunk && typeof onChunk === "function") {
            await onChunk({
              chunk: chunkText,
              fullText: fullText,
              chunkIndex: chunkCount,
              isComplete: false,
            });
          }
        }
      }

      // Final callback with complete text
      if (onChunk && typeof onChunk === "function") {
        await onChunk({
          chunk: "",
          fullText: fullText,
          chunkIndex: chunkCount,
          isComplete: true,
        });
      }

      console.log(
        `✅ Streaming complete: ${chunkCount} chunks, ${fullText.length} chars`
      );

      return {
        text: fullText.trim(),
        model: this.model,
        chunks: chunkCount,
        usage: {
          promptTokens: this.estimateTokens(prompt),
          completionTokens: this.estimateTokens(fullText),
          totalTokens: this.estimateTokens(prompt + fullText),
        },
      };
    } catch (error) {
      console.error("❌ Error generating streaming response:", error.message);
      throw new Error(`Streaming generation failed: ${error.message}`);
    }
  }

  // Generate RAG response with context
  async generateRAGResponse(query, context, options = {}) {
    try {
      const systemPrompt = this.buildRAGPrompt(query, context, options);
      return await this.generateResponse(systemPrompt, options);
    } catch (error) {
      console.error("❌ Error generating RAG response:", error.message);
      throw error;
    }
  }

  // Generate streaming RAG response
  async generateStreamingRAGResponse(
    query,
    context,
    options = {},
    onChunk = null
  ) {
    try {
      const systemPrompt = this.buildRAGPrompt(query, context, options);
      return await this.generateStreamingResponse(
        systemPrompt,
        options,
        onChunk
      );
    } catch (error) {
      console.error(
        "❌ Error generating streaming RAG response:",
        error.message
      );
      throw error;
    }
  }

  // Build RAG prompt with context
  buildRAGPrompt(query, context, options = {}) {
    const systemMessage =
      options.systemMessage ||
      `You are a helpful AI assistant that answers questions based on the provided context. You should:

1. Answer questions accurately based on the given context
2. If the context doesn't contain enough information to answer the question, say so honestly
3. Keep your answers concise and relevant
4. Cite information from the context when appropriate
5. Be conversational and helpful in tone`;

    const contextText = Array.isArray(context)
      ? context.map((ctx, i) => `[${i + 1}] ${ctx.content || ctx}`).join("\n\n")
      : context;

    const prompt = `${systemMessage}

CONTEXT:
${contextText}

QUESTION: ${query}

ANSWER:`;

    return prompt;
  }

  // Chat with conversation history
  async chatWithHistory(messages, options = {}) {
    try {
      if (!this.isServiceAvailable()) {
        throw new Error("LLM service not available - missing API key");
      }

      if (!Array.isArray(messages) || messages.length === 0) {
        throw new Error("Messages array is required");
      }

      // Convert messages to Gemini format
      const contents = messages.map((msg) => ({
        role: msg.role === "assistant" ? "model" : "user",
        parts: [{ text: msg.content }],
      }));

      const generationConfig = {
        temperature: options.temperature || this.temperature,
        topP: options.topP || this.topP,
        maxOutputTokens: options.maxTokens || this.maxTokens,
      };

      const result = await this.geminiModel.generateContent({
        contents: contents,
        generationConfig,
      });

      const response = await result.response;
      const text = response.text();

      return {
        text: text.trim(),
        model: this.model,
        usage: {
          promptTokens: this.estimateTokens(
            messages.map((m) => m.content).join(" ")
          ),
          completionTokens: this.estimateTokens(text),
          totalTokens: this.estimateTokens(
            messages.map((m) => m.content).join(" ") + text
          ),
        },
      };
    } catch (error) {
      console.error("❌ Error in chat with history:", error.message);
      throw error;
    }
  }

  // Estimate token count (rough approximation)
  estimateTokens(text) {
    if (!text || typeof text !== "string") return 0;

    // Rough estimate: 1 token ≈ 4 characters for English text
    return Math.ceil(text.length / 4);
  }

  // Validate and clean input text
  validateInput(text, maxLength = 30000) {
    if (!text || typeof text !== "string") {
      throw new Error("Input must be a non-empty string");
    }

    const cleanText = text.trim();

    if (cleanText.length === 0) {
      throw new Error("Input cannot be empty");
    }

    if (cleanText.length > maxLength) {
      console.warn(
        `⚠️ Input text truncated from ${cleanText.length} to ${maxLength} characters`
      );
      return cleanText.substring(0, maxLength);
    }

    return cleanText;
  }

  // Health check
  async healthCheck() {
    try {
      if (!this.isServiceAvailable()) {
        return {
          status: "unavailable",
          message: "API key not configured",
        };
      }

      // Test with a simple prompt
      const testResult = await this.generateResponse(
        "Hello! This is a health check test.",
        {
          maxTokens: 50,
          temperature: 0.1,
        }
      );

      return {
        status: "ok",
        model: this.model,
        responseLength: testResult.text.length,
        usage: testResult.usage,
      };
    } catch (error) {
      return {
        status: "error",
        message: error.message,
      };
    }
  }

  // Get service statistics
  getStats() {
    return {
      model: this.model,
      maxTokens: this.maxTokens,
      temperature: this.temperature,
      topP: this.topP,
      available: this.isServiceAvailable(),
    };
  }

  // Generate summary of text
  async summarizeText(text, maxWords = 100) {
    try {
      const prompt = `Please provide a concise summary of the following text in approximately ${maxWords} words:

${text}

Summary:`;

      return await this.generateResponse(prompt, {
        maxTokens: Math.ceil(maxWords * 1.5),
        temperature: 0.3,
      });
    } catch (error) {
      console.error("❌ Error summarizing text:", error.message);
      throw error;
    }
  }

  // Extract key information from text
  async extractKeyInfo(text, query) {
    try {
      const prompt = `Based on the following text, please answer this question: "${query}"

Text: ${text}

Answer:`;

      return await this.generateResponse(prompt, {
        maxTokens: 200,
        temperature: 0.2,
      });
    } catch (error) {
      console.error("❌ Error extracting key info:", error.message);
      throw error;
    }
  }
}

// Create and export singleton instance
const llmService = new LLMService();
module.exports = llmService;
