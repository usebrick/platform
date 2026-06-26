# Redirect README for `usebrick/slopbrick`

> **This repository has moved.**
>
> New home: **[github.com/usebrick/platform](https://github.com/usebrick/platform)**
>
> The `slopbrick` CLI source, schemas, and release pipeline now live in the `usebrick/platform` monorepo.
>
> ```bash
> # Old (frozen — no further releases from this repo):
> npm install slop-audit   # → deprecated, points to @usebrick/platform
>
> # New (use this going forward):
> npm install slopbrick    # → unscoped CLI, same package
> ```
>
> **This repo stays online for 6–12 months** as a redirect target for old GitHub links, search results, and bookmarks. Do not delete before **June 2027**.
>
> What's in the new monorepo:
>
> ```
> usebrick/platform/
> ├── packages/
> │   ├── core/          (@usebrick/core, private — Repository Memory Platform spec)
> │   └── slopbrick/     (slopbrick CLI — published to npm)
> ├── .github/workflows/
> │   ├── ci.yml
> │   └── publish.yml
> ├── docs/
> ├── README.md
> └── AGENTS.md
> ```
>
> For maintainer actions (npm deprecate, GitHub transfer, env setup), see `docs/rename-checklist.md` in the new monorepo.
