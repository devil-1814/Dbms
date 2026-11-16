require("dotenv").config({ path: ".env.local" });
const { createClient } = require("redis");

async function main() {
  const url = process.env.REDIS_URL;
  if (!url) {
    console.error("REDIS_URL is missing. Add it to .env.local first.");
    process.exitCode = 1;
    return;
  }

  const client = createClient({ url });
  client.on("error", (error) => {
    console.error("Redis error:", error.message);
  });

  try {
    await client.connect();
    const pong = await client.ping();
    const testKey = "smart-emergency:connection-check";
    await client.set(testKey, "Redis connection successful", { EX: 30 });
    const value = await client.get(testKey);

    console.log("Redis PING:", pong);
    console.log("Test key:", value);
    console.log("Redis connection verified successfully.");
  } finally {
    if (client.isOpen) await client.quit();
  }
}

main().catch((error) => {
  console.error("Redis connection check failed:", error.message);
  process.exitCode = 1;
});
