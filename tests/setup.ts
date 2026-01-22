// Ensure DB and profile mocks are registered before any test files are evaluated
// This import executes vi.mock(...) calls inside the module at load time
import "./utils/mocks/db";
import "./utils/mocks/cache";
import "./utils/mocks/ai";

process.env.CHAT_GRANT_SECRET ??= "test-chat-grant-secret";
process.env.OPENAI_API_KEY ??= "test-openai-key";
process.env.NEYNAR_API_KEY ??= "test-neynar-key";
process.env.REDIS_URL ??= "redis://localhost:6379";
process.env.POSTGRES_URL ??= "postgres://localhost:5432/cobuild";
process.env.PRIVY_APP_ID ??= "privy";
process.env.NODE_ENV ??= "development";
