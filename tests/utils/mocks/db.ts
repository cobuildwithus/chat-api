import { vi } from "vitest";

type ResponseProvider = () => any[];

const responses = new Map<any, ResponseProvider[]>();
const callCounts = new Map<any, number>();

function makeSelectChain(rows: any[]) {
  const chain: any = {
    groupBy: (_cols?: any) => Promise.resolve(rows),
    limit: (_n?: number) => chain,
    orderBy: (_o?: any) => chain,
    then: (resolve: any) => resolve(rows),
  };
  return chain;
}

function makeInsertChain(table: any) {
  return {
    values: (_vals?: any) => {
      callCounts.set(table, (callCounts.get(table) ?? 0) + 1);
      return {
        onConflictDoNothing: () => ({
          returning: (_sel?: any) => Promise.resolve(takeResponse(table)),
        }),
        onConflictDoUpdate: (_opts?: any) => Promise.resolve(takeResponse(table)),
        returning: (_sel?: any) => Promise.resolve(takeResponse(table)),
      };
    },
  };
}

function takeResponse(table: any) {
  const queue = responses.get(table);
  if (!queue || queue.length === 0) return [];
  const provider = queue.length > 1 ? queue.shift()! : queue[0]!;
  const value = provider();
  return Array.isArray(value) ? value : [];
}

function normalizeResponse(rows: any[] | ResponseProvider): ResponseProvider {
  if (typeof rows === "function") return rows as ResponseProvider;
  if (Array.isArray(rows)) return () => rows;
  return () => [];
}

// Mock cobuildDb select/from/where/limit chain and update/set/where chain
vi.mock("../../../src/infra/db/cobuildDb", () => {
  const cobuildDb = {
    select: (_sel?: any) => ({
      from: (table: any) => ({
        innerJoin: (_otherTable: any, _on: any) => ({
          where: (_cond?: any) => {
            callCounts.set(table, (callCounts.get(table) ?? 0) + 1);
            const rows = takeResponse(table);
            return makeSelectChain(rows);
          },
        }),
        where: (_cond?: any) => {
          callCounts.set(table, (callCounts.get(table) ?? 0) + 1);
          const rows = takeResponse(table);
          return makeSelectChain(rows);
        },
      }),
    }),
    update: (table: any) => ({
      set: (vals: unknown) => ({
        where: (_cond?: unknown) => {
          callCounts.set(table, (callCounts.get(table) ?? 0) + 1);
          responses.set(table, [() => [{ __update__: true, set: vals }]]);
          return Promise.resolve();
        },
      }),
    }),
    insert: (table: any) => makeInsertChain(table),
    delete: (table: any) => ({
      where: (_cond?: unknown) => {
        callCounts.set(table, (callCounts.get(table) ?? 0) + 1);
        return Promise.resolve();
      },
    }),
  } as any;
  cobuildDb.$primary = cobuildDb;
  return { cobuildDb };
});

// Mock getFarcasterProfileByAddress
vi.mock("../../../src/infra/db/queries/profiles/get-profile", () => {
  return {
    getFarcasterProfileByAddress: vi.fn(async (_address: string) => null),
  };
});

export function setCobuildDbResponse(table: any, rows: any[] | ResponseProvider) {
  responses.set(table, [normalizeResponse(rows)]);
}

export function queueCobuildDbResponse(table: any, rows: any[] | ResponseProvider) {
  const queue = responses.get(table) ?? [];
  queue.push(normalizeResponse(rows));
  responses.set(table, queue);
}

export function getDbCallCount(table: any): number {
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
