# Release

## Current Release: 1.0.18

This release adds a flow-adaptation skill and hardens cross-app search:

- Adds the `mobbin-flow-architect` skill: study a reference app's flow on Mobbin and adapt it into the current project as a flow spec, task plan, and (with sign-off) the build.
- Migrates cross-app screen and flow search to Next.js RSC scraping after Mobbin retired the `/api/content/search-*` routes; search now scans a bounded set of popular apps per platform.
- Adds direct capture workflows for flows, screens, and site sections that preserve ordered steps, screen URLs, hotspot metadata, source URLs, patterns, elements, and optional visual hashes.
- Documents skills-first install, upgrade, and status checks, and clarifies MCP versus skills usage.
- Documents release verification commands and the npm publish flow.

## Release Checklist

1. Confirm the npm registry version:

```bash
npm view @aos-engineer/mobbin-mcp version
```

2. Bump package metadata:

```bash
npm version <next-version> --no-git-tag-version
```

3. Run local gates:

```bash
npm run format:check
npm run lint
npm test
node dist/index.js --version
node dist/index.js skill --help
npm pack --dry-run
```

4. Publish:

```bash
npm publish --access public
```

5. Verify install:

```bash
npm view @aos-engineer/mobbin-mcp version
npm install -g @aos-engineer/mobbin-mcp@latest
mobbin-mcp --version
mobbin-mcp skills install --force
mobbin-mcp skills status
```

## Auth Requirements

Publishing requires an npm account with permission for the `@aos-engineer` scope. Check auth with:

```bash
npm whoami
```

If this returns `E401`, run `npm login` or configure an npm automation token before publishing.
