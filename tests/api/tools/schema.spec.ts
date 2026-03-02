import { describe, expect, it } from "vitest";
import {
  toolExecutionSchema,
  toolMetadataSchema,
  toolsListSchema,
} from "../../../src/api/tools/schema";

describe("tools schema", () => {
  it("defines request body for tool execution", () => {
    expect(toolExecutionSchema.body.required).toEqual(["name"]);
    expect(toolExecutionSchema.body.properties.name.minLength).toBe(1);
    expect(toolExecutionSchema.body.properties.name.maxLength).toBe(128);
  });

  it("defines params for tool metadata lookup", () => {
    expect(toolMetadataSchema.params.required).toEqual(["name"]);
    expect(toolMetadataSchema.params.properties.name.minLength).toBe(1);
    expect(toolMetadataSchema.params.properties.name.maxLength).toBe(128);
  });

  it("keeps list schema unconstrained", () => {
    expect(toolsListSchema).toEqual({});
  });
});
