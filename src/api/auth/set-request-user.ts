import type { FastifyRequest } from "fastify";
import {
  setChatUserPrincipalFromRequest,
  type ChatUserPrincipal,
  type SubjectWallet,
} from "./principals";

export function setRequestUserFromHeaders(
  address: SubjectWallet,
  request: FastifyRequest,
) {
  setChatUserPrincipalFromRequest(address, request);
}

export type { ChatUserPrincipal };
