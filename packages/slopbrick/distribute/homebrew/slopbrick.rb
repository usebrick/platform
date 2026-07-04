# Homebrew formula for slopbrick
#
# Install with:
#   brew tap usebrick/slopbrick
#   brew install slopbrick
#
# Or submit this to homebrew-core after the project crosses the
# adoption threshold (typically 75+ GitHub stars + sustained weekly
# downloads from npm). Submit:
#   brew bump-formula-pr slopbrick --version=0.10.1 \
#     --url=https://registry.npmjs.org/slopbrick/-/slopbrick-0.10.1.tgz \
#     --sha256=<populate from npm view slopbrick@0.10.1 dist.shasum>

class Slopbrick < Formula
  desc "Repository Coherence Engine for AI-generated code — 4 scores, 103 rules, MCP for agents. Part of the usebrick.dev platform. v10-calibrated against 576,750 real files."
  homepage "https://github.com/usebrick/slopbrick"
  url "https://registry.npmjs.org/slopbrick/-/slopbrick-0.10.1.tgz"
  sha256 "<populate from npm view slopbrick@0.10.1 dist.shasum>"
  license "MIT"

  depends_on "node@18"

  def install
    system "npm", "install", *std_npm_args
    bin.install_symlink Dir["#{libexec}/bin/*"]
  end

  test do
    # Smoke test: verify the CLI loads and reports its version. We don't
    # scan a fixture here because that would require a network round-trip
    # to fetch the rule registry and would slow down `brew test` by 30s+.
    assert_match version.to_s, shell_output("#{bin}/slopbrick --version")
  end
end
