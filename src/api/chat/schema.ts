import { z } from "zod";
import { CHAT_AGENT_TYPE, type ChatData } from "../../ai/types";
import {
  buildFastifyRouteSchema,
  createRuntimeSchemaParser,
} from "../zod-route-schema";

const CHAT_TYPES = [CHAT_AGENT_TYPE] as const;

const chatDataSchema = z.object({
  goalAddress: z.string().optional(),
  grantId: z.string().optional(),
  impactId: z.string().optional(),
  castId: z.string().optional(),
  opportunityId: z.string().optional(),
  startupId: z.string().optional(),
  draftId: z.string().optional(),
}).strict();
const chatDataParserSchema = z.object(chatDataSchema.shape).strip();

const filePartSchema = z.object({
  type: z.literal("file"),
  url: z.string(),
  mediaType: z.string(),
  filename: z.string().optional(),
  mimeType: z.string().optional(),
  name: z.string().optional(),
}).strict();

const imagePartSchema = z.object({
  type: z.literal("image"),
  image: z.string(),
  mimeType: z.string().optional(),
}).strict();

const chatAttachmentSchema = z.union([filePartSchema, imagePartSchema]);

const chatHeadersSchema = z.object({
  "x-client-device": z.string().min(1).optional(),
}).passthrough();

const chatBodySchema = z.object({
  chatId: z.string().min(1),
  clientMessageId: z.string().min(1),
  userMessage: z.string(),
  attachments: z.array(chatAttachmentSchema).optional(),
  context: z.string().optional(),
  id: z.never().optional(),
  type: z.never().optional(),
  data: z.never().optional(),
  messages: z.never().optional(),
}).strict();

const chatCreateBodySchema = z.object({
  type: z.enum(CHAT_TYPES),
  data: chatDataSchema.optional(),
}).strict();

const chatGetParamsSchema = z.object({
  chatId: z.string(),
}).strict();

const chatListQuerySchema = z.object({
  goalAddress: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
}).strict();

const chatHeadersParser = createRuntimeSchemaParser(chatHeadersSchema);
const chatBodyParser = createRuntimeSchemaParser(chatBodySchema);
const chatCreateBodyParser = createRuntimeSchemaParser(chatCreateBodySchema);
const chatGetParamsParser = createRuntimeSchemaParser(chatGetParamsSchema);
const chatListQueryParser = createRuntimeSchemaParser(chatListQuerySchema);

export const chatSchema = buildFastifyRouteSchema({
  body: chatBodyParser,
  headers: chatHeadersParser,
});

export const chatCreateSchema = buildFastifyRouteSchema({
  body: chatCreateBodyParser,
});

export const chatGetSchema = buildFastifyRouteSchema({
  params: chatGetParamsParser,
});

export const chatListSchema = buildFastifyRouteSchema({
  querystring: chatListQueryParser,
});

export const parseChatBody = chatBodyParser.parse;
export const parseChatHeaders = chatHeadersParser.parse;
export const parseChatCreateBody = chatCreateBodyParser.parse;
export const parseChatGetParams = chatGetParamsParser.parse;
export const parseChatListQuery = chatListQueryParser.parse;

export function parseChatData(input: unknown): ChatData {
  const result = chatDataParserSchema.safeParse(input);
  if (!result.success) {
    return {};
  }

  return result.data;
}

export type ChatRequestBody = z.infer<typeof chatBodySchema>;
export type ChatCreateRequestBody = z.infer<typeof chatCreateBodySchema>;
export type ChatGetParams = z.infer<typeof chatGetParamsSchema>;
export type ChatListQuery = z.infer<typeof chatListQuerySchema>;
