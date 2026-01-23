import "dotenv/config";

import { setupServer } from "./api/server";
import { validateEnvVariables } from "./config/env";
import { closeCobuildDb } from "./infra/db/cobuildDb";
import { closeRedisClient } from "./infra/redis";

const port = process.env.PORT || 4000;
const fatalReasons = new Set(["uncaughtException", "unhandledRejection"]);

const run = async () => {
  validateEnvVariables();

  const server = await setupServer();
  let shuttingDown = false;
  const shutdown = async (reason: string, error?: unknown) => {
    if (shuttingDown) return;
    shuttingDown = true;
    if (error) {
      console.error(`[shutdown] ${reason}`, error);
    } else {
      console.log(`[shutdown] ${reason}`);
    }
    try {
      await server.close();
    } catch (closeError) {
      console.error("[shutdown] failed to close server", closeError);
    }
    await Promise.all([
      closeCobuildDb().catch((dbError) => console.error("[shutdown] failed to close db", dbError)),
      closeRedisClient().catch((redisError) =>
        console.error("[shutdown] failed to close redis", redisError),
      ),
    ]);
    process.exit(fatalReasons.has(reason) ? 1 : 0);
  };

  const registerShutdownHandler = (signal: string) => {
    process.on(signal, () => {
      void shutdown(signal);
    });
  };

  ["SIGTERM", "SIGINT"].forEach(registerShutdownHandler);
  process.on("uncaughtException", (error) => void shutdown("uncaughtException", error));
  process.on("unhandledRejection", (reason) => void shutdown("unhandledRejection", reason));
  await server.listen({ port: Number(port), host: "::" });

  console.log(`Server started at ${process.env.RAILWAY_STATIC_URL || "localhost"}:${port}`);
};

run().catch((e) => {
  console.error("Server startup failed:");
  console.error(e.message);
  console.error("Stack trace:", e.stack);
  process.exit(1);
});
