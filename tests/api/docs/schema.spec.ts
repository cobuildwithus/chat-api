import { describe, expect, it } from "vitest";
import { docsSearchSchema } from "../../../src/api/docs/schema";

describe("docs search schema", () => {
  it("requires query and bounds limit", () => {
    expect(docsSearchSchema.body.required).toEqual(["query"]);
    expect(docsSearchSchema.body.properties.limit.minimum).toBe(1);
    expect(docsSearchSchema.body.properties.limit.maximum).toBe(20);
  });
});

