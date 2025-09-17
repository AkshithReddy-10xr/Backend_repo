# RAG-Powered News Chatbot Backend

A full-stack RAG (Retrieval-Augmented Generation) chatbot backend that answers queries about news articles using ChromaDB for vector storage, Jina Embeddings for text embeddings, and Google Gemini for response generation.

## 🚀 Features

- **RAG Pipeline**: Complete retrieval-augmented generation implementation
- **Vector Database**: ChromaDB for efficient similarity search
- **Embeddings**: Jina Embeddings API for high-quality text embeddings  
- **LLM Integration**: Google Gemini API for intelligent responses
- **Session Management**: Redis-powered session handling with TTL
- **Real-time Communication**: Socket.IO for live chat streaming
- **News Ingestion**: Automated RSS feed processing and article scraping
- **Health Monitoring**: Comprehensive health checks for all services
- **Error Handling**: Robust error handling with fallback mechanisms
- **Rate Limiting**: API protection with configurable limits
- **CORS Support**: Secure cross-origin resource sharing

## 🛠 Tech Stack

| Component | Technology | Purpose |
|-----------|------------|---------|
| **Framework** | Express.js + Socket.IO | REST API + WebSocket server |
| **Vector Database** | ChromaDB | Document storage and similarity search |
| **Embeddings** | Jina Embeddings API | Text-to-vector conversion |
| **LLM** | Google Gemini API | Response generation |
| **Cache/Sessions** | Redis (with fallback) | Session management and caching |
| **News Processing** | RSS Parser + Cheerio | Content ingestion and scraping |
| **Validation** | Express-validator | Input validation and sanitization |
| **Security** | Helmet + CORS + Rate limiting | API security |

## 📋 Prerequisites

- Node.js 18.x or higher
- Redis instance (optional - falls back to in-memory storage)
- API Keys:
  - Jina Embeddings API key
  - Google Gemini API key

## 🔧 Installation

1. **Clone the repository**
   ```bash
   git clone <your-backend-repo-url>
   cd rag-chatbot-backend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment Setup**
   
   Create a `.env` file in the root directory:
   ```env
   # API Keys (Required)
   JINA_API_KEY=your_jina_api_key_here
   GEMINI_API_KEY=your_gemini_api_key_here
   
   # Server Configuration
   PORT=5000
   NODE_ENV=production
   CORS_ORIGIN=https://your-frontend-domain.com
   
   # Redis Configuration (Optional)
   REDIS_URL=redis://localhost:6379
   REDIS_TTL=86400
   
   # Session Configuration
   SESSION_TTL=86400
   MAX_SESSION_MESSAGES=50
   
   # RAG Configuration
   MAX_QUERY_LENGTH=500
   MAX_CONTEXT_CHUNKS=5
   VECTOR_SEARCH_TOP_K=3
   SIMILARITY_THRESHOLD=0.1
   
   # Rate Limiting
   RATE_LIMIT_MAX_REQUESTS=100
   RATE_LIMIT_WINDOW_MS=900000
   
   # News Ingestion
   NEWS_FETCH_LIMIT=50
   ```

4. **Initialize the database**
   ```bash
   npm run setup
   ```

## 🚀 Running the Application

### Development Mode
```bash
npm run dev
```

### Production Mode
```bash
npm start
```

### Ingest News Articles
```bash
npm run ingest
```

## 📊 API Endpoints

### Health Check
- `GET /api/health` - Basic health status
- `GET /api/health/detailed` - Detailed service status
- `GET /api/health/ready` - Readiness probe
- `GET /api/health/live` - Liveness probe

### Chat Operations
- `POST /api/chat` - Send message and get response
- `POST /api/chat/stream` - Stream response via Server-Sent Events

### Session Management  
- `POST /api/sessions` - Create new session
- `GET /api/sessions/:id` - Get session info
- `GET /api/sessions/:id/history` - Get session message history
- `POST /api/sessions/:id/clear` - Clear session messages
- `DELETE /api/sessions/:id` - Delete session
- `GET /api/sessions/stats` - Get session statistics

### News Ingestion
- `POST /api/ingest/news` - Trigger news ingestion
- `POST /api/ingest/articles` - Add custom articles
- `GET /api/ingest/stats` - Get ingestion statistics
- `GET /api/ingest/health` - Check ingestion services

## 🔌 WebSocket Events

### Client → Server
- `join_session` - Join a chat session
- `send_message` - Send a chat message

### Server → Client  
- `typing` - Typing indicator status
- `message_chunk` - Streaming response chunk
- `message_complete` - Response completion
- `error` - Error notification

## 📁 Project Structure

```
src/
├── app.js              # Express app configuration
├── server.js           # Server entry point
├── config/
│   └── index.js        # Configuration management
├── controllers/
│   └── chatController.js # Chat request handlers
├── middleware/
│   ├── cors.js         # CORS configuration
│   ├── errorHandler.js # Global error handling
│   ├── rateLimit.js    # Rate limiting
│   └── validation.js   # Input validation
├── routes/
│   ├── chat.js         # Chat endpoints
│   ├── health.js       # Health check endpoints
│   ├── ingestion.js    # News ingestion endpoints
│   └── sessions.js     # Session management endpoints
└── services/
    ├── embeddings.js   # Jina Embeddings integration
    ├── llm.js          # Google Gemini integration
    ├── newsIngestion.js # RSS feed processing
    ├── ragPipeline.js  # RAG orchestration
    ├── redis.js        # Redis/memory storage
    └── vectordb.js     # ChromaDB integration
```

## 🔄 RAG Pipeline Flow

1. **Query Processing**: Validate and sanitize user input
2. **Embedding Generation**: Convert query to vector using Jina API
3. **Vector Search**: Find similar articles in ChromaDB
4. **Context Filtering**: Filter results by similarity threshold
5. **Context Preparation**: Format relevant articles for LLM
6. **Response Generation**: Generate answer using Gemini API
7. **Streaming Response**: Stream answer back to client

## 🏥 Health Monitoring

The application includes comprehensive health checks:

- **Service Availability**: Redis, ChromaDB, API keys
- **Performance Metrics**: Response times, memory usage
- **Error Tracking**: Failed requests, service errors
- **Resource Monitoring**: Memory, CPU, connections

## 🔒 Security Features

- **Input Validation**: All inputs validated and sanitized
- **Rate Limiting**: Configurable per-IP and per-session limits
- **CORS Protection**: Secure cross-origin resource sharing
- **Error Sanitization**: No sensitive data in error responses
- **Session Security**: Secure session management with TTL

## 📈 Performance Optimizations

- **Connection Pooling**: Efficient database connections
- **Caching Strategy**: Redis caching with fallback
- **Streaming Responses**: Real-time response streaming
- **Batch Processing**: Efficient news article processing
- **Error Recovery**: Automatic retries and fallbacks

## 🚀 Deployment

### Railway Deployment

1. **Connect your repository** to Railway
2. **Set environment variables** in Railway dashboard
3. **Deploy** - Railway will automatically build and deploy

### Environment Variables for Production
```env
JINA_API_KEY=your_production_jina_key
GEMINI_API_KEY=your_production_gemini_key
REDIS_URL=your_redis_connection_string
CORS_ORIGIN=https://your-frontend-domain.com
NODE_ENV=production
```

## 🧪 Testing

```bash
# Run tests
npm test

# Run tests in watch mode  
npm run test:watch
```

## 📝 Configuration

### Redis Configuration
- **URL**: Redis connection string
- **TTL**: Session timeout (default: 24 hours)
- **Fallback**: In-memory storage when Redis unavailable

### RAG Configuration
- **Top K**: Number of similar documents to retrieve
- **Similarity Threshold**: Minimum similarity score (0.1-1.0)
- **Context Chunks**: Maximum context pieces for LLM

### Rate Limiting
- **Global Limit**: 100 requests per 15 minutes
- **Chat Limit**: 10 messages per minute
- **Session Limit**: 20 operations per 5 minutes

## 🔍 Troubleshooting

### Common Issues

1. **API Key Errors**
   ```
   Error: JINA_API_KEY is required
   Solution: Set valid API keys in .env file
   ```

2. **Redis Connection Issues**
   ```
   Warning: Using in-memory storage as fallback
   Solution: Check REDIS_URL or ignore if using fallback
   ```

3. **ChromaDB Initialization**
   ```
   Error: Failed to initialize ChromaDB
   Solution: Check file permissions and disk space
   ```

### Debug Mode
Set `NODE_ENV=development` for detailed error messages and logging.

## 📊 Monitoring & Logs

- **Health Endpoint**: `/api/health/detailed`
- **Service Stats**: `/api/sessions/stats`
- **Ingestion Stats**: `/api/ingest/stats`
- **Console Logs**: Structured logging with timestamps

## 🔄 Updates & Maintenance

### News Data Updates
```bash
# Manual news ingestion
npm run ingest

# Or via API
curl -X POST http://localhost:5000/api/ingest/news
```

### Database Maintenance
```bash
# Clear old sessions (automatic with TTL)
# Clean ChromaDB (if needed)
npm run clean
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License.

## 📞 Support

For issues and questions:
- Check the `/api/health` endpoint
- Review application logs
- Verify environment variables
- Check API key validity

## 📚 API Documentation

Visit `/api/health` after starting the server to see all available endpoints and their status.
