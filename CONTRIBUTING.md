# Contributing

Thanks for helping improve the chat-api!

## Getting started

```bash
pnpm install
cp .env.example .env
pnpm test
pnpm typecheck
```

## Adding a tool

1. Create a new folder under `src/ai/tools/<tool-name>/`.
2. Export a Tool object from `tool.ts` (see `docs/TOOLS.md`).
3. Register it in `src/ai/tools/index.ts`.
4. Add or update tests.

## Code organization

- API routes and middleware live in `src/api/`.
- Domain logic is in `src/chat/`.
- External services and storage live in `src/infra/`.
- Config and env parsing live in `src/config/`.

## Checklist

- [ ] Tests pass (`pnpm test`)
- [ ] Typecheck passes (`pnpm typecheck`)
- [ ] Tool registered (if applicable)
- [ ] Docs updated (if applicable)
