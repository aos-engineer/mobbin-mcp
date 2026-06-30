# Contributing to mobbin-mcp

Thanks for your interest in contributing! Here's how to get started.

## Development setup

1. Clone the repo and install dependencies:

```bash
git clone https://github.com/aos-engineer/mobbin-mcp.git
cd mobbin-mcp
npm install
```

2. Authenticate with Mobbin:

```bash
npx tsx src/index.ts auth
```

3. Run the server in dev mode (auto-restarts on changes):

```bash
npm run dev
```

## Making changes

1. Fork the repo and create a branch from `main`
2. Make your changes in `src/`
3. Update docs and skill instructions when behavior changes
4. Verify the release gates:

```bash
npm run format:check
npm run lint
npm test
```

5. Open a pull request

## Project structure

```
src/
  index.ts                    # Server entry point and MCP tool/resource/prompt registration
  constants.ts                # API URLs and config
  types.ts                    # TypeScript interfaces
  cli/auth.ts                 # CLI authentication flow
  cli/skill.ts                # Skills-first command dispatcher
  services/auth.ts            # Token management and refresh
  services/api-client.ts      # Mobbin API client
  utils/artifact-store.ts     # Project artifact storage, builders, prompts, import/export
  utils/capture-workflows.ts  # Direct Mobbin flow/screen/site-section capture workflows
  utils/formatting.ts         # Response formatters
source/skills/                # Skill source files copied into dist during build
```

## Guidelines

- Keep PRs focused — one feature or fix per PR
- Follow the existing code style (TypeScript strict mode)
- Test your changes against the Mobbin API before submitting
- Prefer direct capture workflows for Mobbin-originated references, and keep manual `capture` for notes, derived references, or unsupported sources

## Release checklist

1. Update user-facing docs for new tools or behavior
2. Bump `package.json` and `package-lock.json`
3. Run `npm test` to rebuild TypeScript and skill bundles
4. Run `npm pack --dry-run` and check that `dist/` contains the compiled server and skills
5. Publish with `npm publish --access public`

## Reporting issues

Open an issue on GitHub with:

- What you expected to happen
- What actually happened
- Steps to reproduce
