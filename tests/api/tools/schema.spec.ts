import { describe, expect, it } from "vitest";
import {
  cliToolExecutionRequestBodyJsonSchema,
  cliToolMetadataParamsJsonSchema,
  cliToolsAuthHeadersJsonSchema,
} from "@cobuild/wire";
import {
  parseToolExecutionBody,
  toolExecutionSchema,
  toolMetadataSchema,
  toolsListSchema,
} from "../../../src/api/tools/schema";

describe("tools schema", () => {
  it("defines request body for tool execution", () => {
    expect(toolExecutionSchema.body).toEqual(cliToolExecutionRequestBodyJsonSchema);
  });

  it("defines params for tool metadata lookup", () => {
    expect(toolMetadataSchema.params).toEqual(cliToolMetadataParamsJsonSchema);
  });

  it("requires authorization headers for tool routes", () => {
    expect(toolsListSchema.headers).toEqual(cliToolsAuthHeadersJsonSchema);
  });

  it("uses the same runtime parser for tool execution input", () => {
    expect(parseToolExecutionBody({ name: "get-user" })).toEqual({
      name: "get-user",
      input: {},
    });
    expect(() => parseToolExecutionBody({})).toThrow();
    expect(() => parseToolExecutionBody({ name: "get-user", extra: true })).toThrow();
  });
});
