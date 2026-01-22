import { vi } from "vitest";

type ResponseProvider = () => unknown[];

const responses = new Map<unknown, ResponseProvider[]>();
const callCounts = new Map<unknown, number>();

type SelectChain = {
  groupBy: (_cols?: unknown) => Promise<unknown[]>;
  limit: (_n?: number) => SelectChain;
  orderBy: (_o?: unknown) => SelectChain;
  then: (resolve: (rows: unknown[]) => unknown) => unknown;
};

function makeSelectChain(rows: unknown[]): SelectChain {
  const chain: SelectChain = {
    groupBy: (_cols?: unknown) => Promise.resolve(rows),
    limit: (_n?: number) => chain,
    orderBy: (_o?: unknown) => chain,
    then: (resolve: (rows: unknown[]) => unknown) => resolve(rows),
  };
  return chain;
}

function makeInsertChain(table: unknown) {
  return {
    values: (_vals?: unknown) => {
      callCounts.set(table, (callCounts.get(table) ?? 0) + 1);
      return {
        onConflictDoNothing: () => ({
          returning: (_sel?: unknown) => Promise.resolve(takeResponse(table)),
        }),
        onConflictDoUpdate: (_opts?: unknown) => Promise.resolve(takeResponse(table)),
        returning: (_sel?: unknown) => Promise.resolve(takeResponse(table)),
      };
    },
  };
}

function takeResponse(table: unknown) {
  const queue = responses.get(table);
  if (!queue || queue.length === 0) return [];
  const provider = queue.length > 1 ? queue.shift()! : queue[0]!;
  const value = provider();
  return Array.isArray(value) ? value : [];
}

function normalizeResponse(rows: unknown[] | ResponseProvider): ResponseProvider {
  if (typeof rows === "function") return rows as ResponseProvider;
  if (Array.isArray(rows)) return () => rows;
  return () => [];
}

// Mock cobuildDb select/from/where/limit chain and update/set/where chain
vi.mock("../../../src/infra/db/cobuildDb", () => {
  type CobuildDbMock = {
    select: (_sel?: unknown) => {
      from: (table: unknown) => {
        innerJoin: (_otherTable: unknown, _on: unknown) => {
          where: (_cond?: unknown) => SelectChain;
        };
        where: (_cond?: unknown) => SelectChain;
      };
    };
    update: (table: unknown) => {
      set: (vals: unknown) => { where: (_cond?: unknown) => Promise<void> };
    };
    insert: (table: unknown) => ReturnType<typeof makeInsertChain>;
    delete: (table: unknown) => { where: (_cond?: unknown) => Promise<void> };
    $primary?: CobuildDbMock;
  };

  const cobuildDb: CobuildDbMock = {
    select: (_sel?: unknown) => ({
      from: (table: unknown) => ({
        innerJoin: (_otherTable: unknown, _on: unknown) => ({
          where: (_cond?: unknown) => {
            callCounts.set(table, (callCounts.get(table) ?? 0) + 1);
            const rows = takeResponse(table);
            return makeSelectChain(rows);
          },
        }),
        where: (_cond?: unknown) => {
          callCounts.set(table, (callCounts.get(table) ?? 0) + 1);
          const rows = takeResponse(table);
          return makeSelectChain(rows);
        },
      }),
    }),
    update: (table: unknown) => ({
      set: (vals: unknown) => ({
        where: (_cond?: unknown) => {
          callCounts.set(table, (callCounts.get(table) ?? 0) + 1);
          responses.set(table, [() => [{ __update__: true, set: vals }]]);
          return Promise.resolve();
        },
      }),
    }),
    insert: (table: unknown) => makeInsertChain(table),
    delete: (table: unknown) => ({
      where: (_cond?: unknown) => {
        callCounts.set(table, (callCounts.get(table) ?? 0) + 1);
        return Promise.resolve();
      },
    }),
  };
  cobuildDb.$primary = cobuildDb;
  return { cobuildDb };
});

// Mock getFarcasterProfileByAddress
vi.mock("../../../src/infra/db/queries/profiles/get-profile", () => {
  return {
    getFarcasterProfileByAddress: vi.fn(async (_address: string) => null),
  };
});

export function setCobuildDbResponse(table: unknown, rows: unknown[] | ResponseProvider) {
  responses.set(table, [normalizeResponse(rows)]);
}

export function queueCobuildDbResponse(table: unknown, rows: unknown[] | ResponseProvider) {
  const queue = responses.get(table) ?? [];
  queue.push(normalizeResponse(rows));
  responses.set(table, queue);
}

export function getDbCallCount(table: unknown): number {
  return callCounts.get(table) ?? 0;
}

export function resetDbMocks() {
  responses.clear();
  callCounts.clear();
}

export function resetAllMocks() {
  resetDbMocks();
}

// Cache helpers
// Cache mocks moved to tests/utils/mocks/cache.ts
