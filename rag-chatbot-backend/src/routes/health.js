const express = require("express");
const router = express.Router();
const redisService = require("../services/redis");
const { config } = require("../config");

// Basic health check
router.get("/", async (req, res) => {
  try {
    const healthCheck = {
      status: "OK",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: config.server.env,
      version: "1.0.0",
      services: {
        redis: "checking...",
        vectordb: "checking...",
        apis: "checking...",
      },
      system: {
        nodeVersion: process.version,
        platform: process.platform,
        memory: {
          used:
            Math.round((process.memoryUsage().heapUsed / 1024 / 1024) * 100) /
            100,
          total:
            Math.round((process.memoryUsage().heapTotal / 1024 / 1024) * 100) /
            100,
        },
      },
    };

    // Check Redis connectivity
    try {
      if (redisService.isAvailable()) {
        await redisService.set("health_check", { timestamp: Date.now() }, 60);
        const testValue = await redisService.get("health_check");
        healthCheck.services.redis = testValue ? "OK" : "FAILED";
      } else {
        healthCheck.services.redis = "DISCONNECTED";
      }
    } catch (error) {
      healthCheck.services.redis = `ERROR: ${error.message}`;
    }

    // Check Vector DB (basic check)
    try {
      // This will be implemented when we create the vector service
      healthCheck.services.vectordb = "OK";
    } catch (error) {
      healthCheck.services.vectordb = `ERROR: ${error.message}`;
    }

    // Check API keys availability (without exposing them)
    healthCheck.services.apis = {
      jina: config.apis.jina.apiKey ? "CONFIGURED" : "MISSING",
      gemini: config.apis.gemini.apiKey ? "CONFIGURED" : "MISSING",
    };

    // Determine overall status
    const hasErrors = Object.values(healthCheck.services).some(
      (status) =>
        typeof status === "string" &&
        (status.includes("ERROR") ||
          status === "FAILED" ||
          status === "MISSING")
    );

    if (hasErrors) {
      healthCheck.status = "DEGRADED";
      res.status(503);
    }

    res.json(healthCheck);
  } catch (error) {
    console.error("Health check error:", error);
    res.status(500).json({
      status: "ERROR",
      timestamp: new Date().toISOString(),
      error: error.message,
    });
  }
});

// Detailed health check
router.get("/detailed", async (req, res) => {
  try {
    const detailedHealth = {
      status: "OK",
      timestamp: new Date().toISOString(),
      services: {
        redis: await getRedisHealth(),
        system: getSystemHealth(),
        configuration: getConfigHealth(),
      },
    };

    res.json(detailedHealth);
  } catch (error) {
    res.status(500).json({
      status: "ERROR",
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// Redis health details
async function getRedisHealth() {
  try {
    if (!redisService.isAvailable()) {
      return {
        status: "DISCONNECTED",
        message: "Redis service not available",
      };
    }

    // Performance test
    const start = Date.now();
    await redisService.set("perf_test", "test_data", 60);
    const data = await redisService.get("perf_test");
    const responseTime = Date.now() - start;

    const stats = await redisService.getStats();

    return {
      status: "OK",
      responseTime: `${responseTime}ms`,
      stats,
      connection:
        redisService.client instanceof Map
          ? "In-Memory Fallback"
          : "Redis Cloud",
    };
  } catch (error) {
    return {
      status: "ERROR",
      error: error.message,
    };
  }
}

// System health details
function getSystemHealth() {
  const memUsage = process.memoryUsage();

  return {
    uptime: {
      process: Math.round(process.uptime()),
      system: require("os").uptime(),
    },
    memory: {
      rss: Math.round(memUsage.rss / 1024 / 1024),
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
      external: Math.round(memUsage.external / 1024 / 1024),
    },
    cpu: {
      usage: process.cpuUsage(),
    },
    platform: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
    },
  };
}

// Configuration health
function getConfigHealth() {
  return {
    environment: config.server.env,
    port: config.server.port,
    features: config.features,
    apis: {
      jina: config.apis.jina.apiKey ? "Configured" : "Missing",
      gemini: config.apis.gemini.apiKey ? "Configured" : "Missing",
    },
    redis: {
      configured: !!config.redis.url,
      ttl: config.redis.ttl,
    },
  };
}

// Liveness probe (simple OK response)
router.get("/live", (req, res) => {
  res.status(200).json({ status: "OK", timestamp: new Date().toISOString() });
});

// Readiness probe (checks if app is ready to serve requests)
router.get("/ready", async (req, res) => {
  try {
    // Check if essential services are ready
    const redisReady = redisService.isAvailable();
    const apisReady = config.apis.jina.apiKey && config.apis.gemini.apiKey;

    if (redisReady && apisReady) {
      res.status(200).json({
        status: "READY",
        timestamp: new Date().toISOString(),
        services: { redis: redisReady, apis: apisReady },
      });
    } else {
      res.status(503).json({
        status: "NOT_READY",
        timestamp: new Date().toISOString(),
        services: { redis: redisReady, apis: apisReady },
      });
    }
  } catch (error) {
    res.status(503).json({
      status: "ERROR",
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

module.exports = router;
