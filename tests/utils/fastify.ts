import type { FastifyReply } from "fastify";
import { vi } from "vitest";

export const createReply = (overrides: Partial<FastifyReply> = {}): FastifyReply =>
  ({
    code: vi.fn().mockReturnThis(),
    status: vi.fn().mockReturnThis(),
    send: vi.fn(),
    header: vi.fn(),
    ...overrides,
  }) as unknown as FastifyReply;
