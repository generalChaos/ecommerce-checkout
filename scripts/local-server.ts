#!/usr/bin/env node
/**
 * Local development server for testing the checkout API with curl.
 * 
 * Usage:
 *   npm run build
 *   npm run dev
 * 
 * Then test with:
 *   curl -X POST http://localhost:3000/checkout -H "Content-Type: application/json" -d '{...}'
 */

import * as http from "http";
import { handler } from "../dist/src/handlers/checkout";

const PORT = process.env.PORT || 3000;

const server = http.createServer(async (req, res) => {
  // CORS headers for local testing
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // Handle preflight
  if (req.method === "OPTIONS") {
    res.writeHead(200);
    res.end();
    return;
  }

  // Only handle POST /checkout
  if (req.method !== "POST" || req.url !== "/checkout") {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not Found" }));
    return;
  }

  try {
    // Read request body
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });

    req.on("end", async () => {
      try {
        // Parse body
        const parsedBody = body ? JSON.parse(body) : {};

        // Create API Gateway-like event
        const event = {
          httpMethod: "POST",
          path: "/checkout",
          pathParameters: null,
          queryStringParameters: null,
          headers: {
            "Content-Type": req.headers["content-type"] || "application/json",
          },
          body: JSON.stringify(parsedBody),
          isBase64Encoded: false,
          requestContext: {
            requestId: `local-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            accountId: "123456789012",
            apiId: "local-api",
            protocol: "HTTP/1.1",
            httpMethod: "POST",
            path: "/checkout",
            stage: "local",
            requestTime: new Date().toISOString(),
            requestTimeEpoch: Date.now(),
            identity: {
              sourceIp: "127.0.0.1",
            },
          },
        };

        // Invoke Lambda handler
        const result = await handler(event as any);

        // Send response
        res.writeHead(result.statusCode, {
          "Content-Type": "application/json",
          ...result.headers,
        });
        res.end(result.body);
      } catch (error: any) {
        console.error("Error processing request:", error);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            error: "Internal Server Error",
            message: error.message,
          })
        );
      }
    });
  } catch (error: any) {
    console.error("Error:", error);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: "Internal Server Error",
        message: error.message,
      })
    );
  }
});

server.listen(PORT, () => {
  console.log(`🚀 Local checkout server running on http://localhost:${PORT}`);
  console.log(`📝 Test with: curl -X POST http://localhost:${PORT}/checkout \\`);
  console.log(`   -H "Content-Type: application/json" \\`);
  console.log(`   -d '{"cartId":"test-123","items":[{"productId":"prod-1","name":"Test","price":10.00,"quantity":1}],"paymentToken":"tok_valid_visa"}'`);
  console.log(`\n⚠️  Note: This requires AWS credentials and a DynamoDB table.`);
  console.log(`   Set AWS_REGION and ensure the table exists, or use LocalStack.\n`);
});
