# Distribution assets

Out-of-repo files for getting slopbrick into more package managers and
distribution channels. These are not shipped in the npm tarball; they're
maintained here for the maintainer to use when filing upstream PRs.

## Files

| File | Use for |
|---|---|
| `homebrew/slopbrick.rb` | Homebrew formula. Either host in a personal tap (`brew tap dystx/slopbrick && brew install slopbrick`) or submit to `homebrew-core` once the project crosses the adoption threshold (~75 stars + sustained weekly npm downloads). |
| `aur/PKGBUILD` | Arch Linux AUR package. Submit to `aur.archlinux.org` via the standard `makepkg` flow once the project is stable. |
| `Show HN post draft.md` | Hacker News submission. Filed manually at news.ycombinator.com. |

## Populating the sha256

Both formula templates have a `<populate from: npm view slopbrick@X.Y.Z dist.shasum>` placeholder. To fill it:

```bash
# For Homebrew:
SHA=$(npm view slopbrick@0.6.4 dist.shasum)
sed -i '' "s/<populate.*dist.shasum>/$SHA/" distribute/homebrew/slopbrick.rb

# For AUR:
SHA=$(npm view slopbrick@0.6.4 dist.integrity | awk -F'sha512-' '{print $2}' | base64 -d | sha256sum | awk '{print $1}')
sed -i '' "s/<populate.*dist.shasum>/$SHA/" distribute/aur/PKGBUILD
```

The Homebrew maintainer guidelines require the sha256 to come from
the registry's `dist-shasum` (canonical tarball hash), not a local
rebuild — that way the package can be verified by anyone with the
official tarball.

## When to submit each channel

| Channel | Threshold | Effort |
|---|---|---|
| npm (already live) | n/a | OIDC workflow on `v*` tag push |
| Homebrew tap | Personal tap: any time. `homebrew-core`: ~75 stars + sustained weekly downloads | Tap is a one-line repo setup; `homebrew-core` PR is a longer review |
| AUR | Any time | `aur.archlinux.org` account + standard `makepkg --printsrcinfo` flow |
| WinGet (Windows) | Any time | Submit manifest to `microsoft/winget-pkgs` |
| Scoop (Windows) | Any time | Submit manifest to `ScoopInstaller/Scoop` |
| Chocolatey (Windows) | Any time | Submit `.nuspec` to `chocolatey/chocolatey-coreteampackages` |
| apt (Debian/Ubuntu) | Mature projects only | PPA or `debian-med` via `mentors.debian.net` |
| Homebrew formula on `homebrew-core` | ~75 stars | Months-long review |
