# Maintainer: usebrick.dev <maintainers@usebrick.dev>
# Submit with: makepkg --printsrcinfo > .SRCINFO

pkgname=slopbrick
pkgver=0.10.1
pkgrel=1
pkgdesc="Repository Coherence Engine for AI-generated code — 4 scores, 103 rules, MCP for agents. Part of the usebrick.dev platform. v10-calibrated against 576,750 real files."
arch=('any')
url="https://github.com/usebrick/slopbrick"
license=('MIT')
depends=('nodejs>=22' 'npm')
makedepends=('npm')
options=('!strip')
source=("https://registry.npmjs.org/$pkgname/-/$pkgname-$pkgver.tgz")
sha256sums=('<populate from: npm view slopbrick@0.10.1 dist.shasum>')

package() {
  npm install \
    --prefix "$pkgdir/usr" \
    --global \
    --cache "$srcdir/npm-cache" \
    "$srcdir/$pkgname-$pkgver.tgz"

  # npm writes per-package bins; symlink them into /usr/bin
  mkdir -p "$pkgdir/usr/bin"
  ln -s /usr/lib/node_modules/slopbrick/bin/slopbrick.js "$pkgdir/usr/bin/slopbrick"

  # Non-executable files
  install -Dm644 "$pkgdir/usr/lib/node_modules/slopbrick/README.md" \
    "$pkgdir/usr/share/doc/$pkgname/README.md"
  install -Dm644 "$pkgdir/usr/lib/node_modules/slopbrick/LICENSE" \
    "$pkgdir/usr/share/licenses/$pkgname/LICENSE"
}
