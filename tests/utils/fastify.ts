import type { FastifyReply } from "fastify";
import { vi } from "vitest";

type MockFn = ReturnType<typeof vi.fn>;
type MockFastifyReply = FastifyReply & {
  code: MockFn;
  status: MockFn;
  send: MockFn;
  header: MockFn;
};

export const createReply = (overrides: Partial<FastifyReply> = {}): MockFastifyReply =>
  ({
    code: vi.fn().mockReturnThis(),
    status: vi.fn().mockReturnThis(),
    send: vi.fn(),
    header: vi.fn(),
    ...overrides,
  }) as unknown as MockFastifyReply;
