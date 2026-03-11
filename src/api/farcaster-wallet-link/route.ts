import type { FastifyReply, FastifyRequest } from "fastify";
import { persistFarcasterWalletLink } from "../../infra/db/queries/profiles/persist-wallet-link";
import { authorizeFarcasterWalletLink } from "./authorize";
import { parseFarcasterWalletLinkBody } from "./schema";

export async function handleFarcasterWalletLinkRequest(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const body = parseFarcasterWalletLinkBody(request.body);
  const authorized = await authorizeFarcasterWalletLink({
    fid: body.fid,
    address: body.address,
    reply,
  });
  if (!authorized) {
    return;
  }
  const result = await persistFarcasterWalletLink(body);

  return reply.send({
    ok: true,
    fid: result.fid,
    address: result.address,
  });
}
