# Redirect README for `usebrick/slopbrick`

> **This repository has moved.**
>
> New home: **[github.com/usebrick/platform](https://github.com/usebrick/platform)**
>
> The `slopbrick` CLI source, schemas, and release pipeline now live in the `usebrick/platform` monorepo.
>
> ```bash
> # Old (frozen — no further releases from this repo):
> npm install slop-audit   # → deprecated, points to slopbrick (the unscoped npm package)
>
> # New (use this going forward):
> npm install slopbrick    # → unscoped CLI, same package
> ```
>
> **This repo stays online for 6–12 months** as a redirect target for old GitHub links, search results, and bookmarks. Do not delete before **June 2027**.
>
> What's in the new monorepo (v0.17.0):
>
> ```
> usebrick/platform/
> ├── packages/
> │   ├── core/          (@usebrick/core, private — Repository Structure Platform spec)
> │   ├── engine/        (@usebrick/engine, private — pure scanning logic, new in v0.15.0)
> │   ├── slopbrick/     (slopbrick CLI — published to npm, 95 rules as of v0.17.0)
> │   └── website/       (@usebrick/website, private — usebrick.dev marketing site)
> ├── .github/workflows/
> │   ├── ci.yml
> │   └── publish.yml
> ├── docs/
> │   ├── ARCHITECTURE.md
> │   ├── UPDATE-SUMMARY.md
> │   ├── future-extractions.md
> │   └── old-repo-redirect.md
> ├── README.md
> └── AGENTS.md
> ```
>
> **v0.15.0 breaking change:** The platform is renamed from "Repository
> Memory Platform" to **"Repository Structure Platform"**. The on-disk
> artifact `.slopbrick/memory.md` is now `.slopbrick/structure.md`. The
> single `slopIndex` score is replaced by 4 independent scores
> (`aiQuality` / `engineeringHygiene` / `security` / `repositoryHealth`).
> The MCP tool `slop_suggest_with_memory` is now
> `slop_suggest_with_structure`.
>
> **v0.16.0 fix:** The 4-score model is now real — each score computes
> a distinct value (in v0.15.0 all 4 read from the same source). The
> slopbrick CLI is now an unscoped npm package (`npm install slopbrick`).
>
> For maintainer actions (npm deprecate, GitHub transfer, env setup), see `docs/rename-checklist.md` in the new monorepo.
