import "dotenv/config";

import { setupServer } from "./api/server";
import { validateEnvVariables } from "./config/env";

const port = process.env.PORT || 4000;

const run = async () => {
  validateEnvVariables();

  const server = await setupServer();
  await server.listen({ port: Number(port), host: "::" });

  console.log(`Server started at ${process.env.RAILWAY_STATIC_URL || "localhost"}:${port}`);
};

run().catch((e) => {
  console.error("Server startup failed:");
  console.error(e.message);
  console.error("Stack trace:", e.stack);
  process.exit(1);
});
