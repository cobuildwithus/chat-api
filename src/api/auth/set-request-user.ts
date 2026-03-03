import { requestContext } from "@fastify/request-context";
import type { FastifyRequest } from "fastify";

export function setRequestUserFromHeaders(
  address: string,
  request: FastifyRequest,
) {
  requestContext.set("user", {
    address,
    city: request.headers["city"]?.toString() ?? null,
    country: request.headers["country"]?.toString() ?? null,
    countryRegion: request.headers["country-region"]?.toString() ?? null,
    userAgent: request.headers["user-agent"]?.toString() ?? null,
  });
}
