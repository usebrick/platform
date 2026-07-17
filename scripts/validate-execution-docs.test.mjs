import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const validatorPath = resolve(repositoryRoot, "scripts/validate-execution-docs.mjs");

const requiredSections = [
  "Outcome",
  "Current truth",
  "Scope",
  "Non-goals",
  "Dependencies",
  "Acceptance criteria",
  "Execution steps",
  "Verification",
  "Evidence destination",
  "Rollback",
  "Next action",
];

function write(root, relativePath, contents) {
  const absolutePath = resolve(root, relativePath);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, contents);
}

function planMarkdown({ id = "P-001", status = "ready", omitSection } = {}) {
  const sections = requiredSections
    .filter((section) => section !== omitSection)
    .map((section) => `## ${section}\n\nContent for ${section}.`)
    .join("\n\n");
  return `# ${id}\n\n- **Status:** \`${status}\`\n\n${sections}\n`;
}

function makeFixture() {
  const root = mkdtempSync(resolve(tmpdir(), "usebrick-plans-"));
  const plan = {
    id: "P-001",
    title: "Fixture plan",
    track: "implementation",
    lane: "fixture",
    horizon: "now",
    status: "ready",
    priority: 1,
    path: "docs/execution/plans/P-001.md",
    dependencies: {
      requires: [],
      externalGates: [],
      benefitsFrom: [],
      conflictsWith: [],
    },
  };
  const index = {
    schemaVersion: 1,
    revision: 1,
    updatedAt: "2026-07-17",
    globalStatus: "advancing",
    roadmap: "ROADMAP.md",
    status: "docs/execution/STATUS.md",
    changelog: "docs/execution/CHANGELOG.md",
    wipLimits: { implementation: 1, company: 1 },
    plans: [plan],
  };

  write(root, "docs/execution/index.json", `${JSON.stringify(index, null, 2)}\n`);
  write(root, plan.path, planMarkdown());
  write(
    root,
    "ROADMAP.md",
    "docs/execution/index.json\ndocs/execution/STATUS.md\ndocs/execution/CHANGELOG.md\n",
  );
  write(
    root,
    "docs/execution/README.md",
    "../../ROADMAP.md\nindex.json\nSTATUS.md\nCHANGELOG.md\n",
  );
  write(
    root,
    "docs/execution/STATUS.md",
    "**Index revision:** 1\n**Global status:** `advancing`\n| `P-001` | `ready` |\n",
  );
  write(root, "docs/execution/CHANGELOG.md", "## Revision 1 — fixture\n");
  write(
    root,
    "docs/archive/MANIFEST.json",
    `${JSON.stringify({ schemaVersion: 1, entries: [] }, null, 2)}\n`,
  );

  return { root, index, plan };
}

function run(root) {
  return spawnSync(process.execPath, [validatorPath, "--root", root], {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
}

function saveIndex(root, index) {
  write(root, "docs/execution/index.json", `${JSON.stringify(index, null, 2)}\n`);
}

function archiveDigests(contents) {
  const bytes = Buffer.from(contents);
  return {
    sha256: createHash("sha256").update(bytes).digest("hex"),
    gitBlob: createHash("sha1")
      .update(`blob ${bytes.length}\0`)
      .update(bytes)
      .digest("hex"),
  };
}

const archiveMetadata = {
  archivedAt: "2026-07-17",
  reason: "Historical planning evidence",
  supersededBy: "ROADMAP.md",
};

function withFixture(callback) {
  const fixture = makeFixture();
  try {
    callback(fixture);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
}

test("accepts a complete plan set and an empty archive manifest", () => {
  withFixture(({ root }) => {
    const result = run(root);
    assert.equal(result.status, 0, result.stderr);
  });
});

test("rejects unindexed and multiply indexed Markdown plan files", () => {
  withFixture(({ root, index, plan }) => {
    write(root, "docs/execution/plans/ORPHAN.md", planMarkdown({ id: "ORPHAN" }));
    index.plans.push({ ...plan, id: "P-002", priority: 2 });
    saveIndex(root, index);

    const result = run(root);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /unindexed plan file: docs\/execution\/plans\/ORPHAN\.md/);
    assert.match(result.stderr, /plan path is indexed more than once/);
  });
});

test("rejects missing, non-integer, and negative plan priorities", () => {
  for (const priority of [undefined, "1", -1, 1.5]) {
    withFixture(({ root, index, plan }) => {
      if (priority === undefined) delete plan.priority;
      else plan.priority = priority;
      saveIndex(root, index);

      const result = run(root);
      assert.equal(
        result.status,
        1,
        `priority ${JSON.stringify(priority)} passed`,
      );
      assert.match(
        result.stderr,
        /P-001: priority must be a nonnegative integer/,
      );
    });
  }
});

test("rejects absolute, non-normalized, and out-of-directory plan paths", () => {
  for (const pathForFixture of [
    (root) => resolve(root, "docs/execution/plans/P-001.md"),
    () => "docs/execution/plans/./P-001.md",
    () => "docs/execution/STATUS.md",
  ]) {
    withFixture(({ root, index, plan }) => {
      plan.path = pathForFixture(root);
      saveIndex(root, index);

      const result = run(root);
      assert.equal(result.status, 1);
      assert.match(
        result.stderr,
        /P-001: plan path must be a normalized repository-relative Markdown path under docs\/execution\/plans\//,
      );
    });
  }
});

test("rejects authority links that are not the canonical paths", () => {
  withFixture(({ root, index }) => {
    index.roadmap = "alternate/ROADMAP.md";
    index.status = "alternate/STATUS.md";
    index.changelog = "alternate/CHANGELOG.md";
    saveIndex(root, index);
    write(root, index.roadmap, "alternate roadmap\n");
    write(root, index.status, "alternate status\n");
    write(root, index.changelog, "alternate changelog\n");

    const result = run(root);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /roadmap authority must equal ROADMAP\.md/);
    assert.match(
      result.stderr,
      /status authority must equal docs\/execution\/STATUS\.md/,
    );
    assert.match(
      result.stderr,
      /changelog authority must equal docs\/execution\/CHANGELOG\.md/,
    );
  });
});

test("rejects a plan missing a required heading", () => {
  withFixture(({ root, plan }) => {
    write(root, plan.path, planMarkdown({ omitSection: "Rollback" }));

    const result = run(root);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /P-001: missing required heading ## Rollback/);
  });
});

test("rejects required plan sections without substantive content", () => {
  for (const body of [
    "",
    "   ",
    "TBD",
    "None",
    "-",
    "- TBD",
    "* **TBD**",
    "> `N/A`",
  ]) {
    withFixture(({ root, plan }) => {
      write(
        root,
        plan.path,
        planMarkdown().replace("Content for Scope.", body),
      );

      const result = run(root);
      assert.equal(result.status, 1, `body ${JSON.stringify(body)} passed`);
      assert.match(
        result.stderr,
        /P-001: required heading ## Scope must have substantive content/,
      );
    });
  }
});

test("rejects a STATUS board that omits an indexed plan and status", () => {
  withFixture(({ root }) => {
    write(
      root,
      "docs/execution/STATUS.md",
      "**Index revision:** 1\n**Global status:** `advancing`\n",
    );

    const result = run(root);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /STATUS\.md does not contain P-001 with status ready/);
  });
});

test("rejects waiting_external without a gate and resume metadata", () => {
  withFixture(({ root, index, plan }) => {
    plan.status = "waiting_external";
    index.globalStatus = "at_risk";
    saveIndex(root, index);
    write(root, plan.path, planMarkdown({ status: "waiting_external" }));
    write(
      root,
      "docs/execution/STATUS.md",
      "**Index revision:** 1\n**Global status:** `at_risk`\n| `P-001` | `waiting_external` |\n",
    );

    const result = run(root);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /P-001: waiting_external requires at least one external gate/);
    assert.match(result.stderr, /P-001: waiting_external missing Exact input/);
    assert.match(result.stderr, /P-001: waiting_external missing Parallel safe/);
  });
});

test("accepts complete waiting_external metadata", () => {
  withFixture(({ root, index, plan }) => {
    plan.status = "waiting_external";
    index.globalStatus = "at_risk";
    plan.dependencies.externalGates = ["OWNER-APPROVAL"];
    saveIndex(root, index);
    write(
      root,
      plan.path,
      `${planMarkdown({ status: "waiting_external" })}\n## Waiting external\n\n- **Exact input:** Signed approval.\n- **Owner:** Release owner.\n- **Last verified:** 2026-07-17.\n- **Evidence:** docs/evidence/approval.md.\n- **Resume condition:** Approval exists at the evidence path.\n- **Recheck:** \`test -f docs/evidence/approval.md\`.\n- **Parallel safe:** \`P-002\`.\n`,
    );
    write(
      root,
      "docs/execution/STATUS.md",
      "**Index revision:** 1\n**Global status:** `at_risk`\n| `P-001` | `waiting_external` |\n",
    );

    const result = run(root);
    assert.equal(result.status, 0, result.stderr);
  });
});

test("rejects malformed or missing archive evidence", () => {
  withFixture(({ root }) => {
    write(
      root,
      "docs/archive/MANIFEST.json",
      `${JSON.stringify(
        {
          schemaVersion: 1,
          entries: [
            {
              ...archiveMetadata,
              from: "docs/old.md",
              to: "docs/archive/plans/old.md",
              sha256: "bad",
              gitBlob: "bad",
            },
          ],
        },
        null,
        2,
      )}\n`,
    );

    const result = run(root);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /archive entry 1: sha256 must be 64 hexadecimal characters/);
    assert.match(result.stderr, /archive entry 1: gitBlob must be 40 hexadecimal characters/);
    assert.match(result.stderr, /archive entry 1: missing archived file docs\/archive\/plans\/old\.md/);
  });
});

test("rejects archive paths that escape their required locations", () => {
  withFixture(({ root }) => {
    write(root, "docs/outside.md", "not in the archive\n");
    write(
      root,
      "docs/archive/MANIFEST.json",
      `${JSON.stringify(
        {
          schemaVersion: 1,
          entries: [
            {
              ...archiveMetadata,
              from: "../outside.md",
              to: "docs/archive/../outside.md",
              sha256: "a".repeat(64),
              gitBlob: "b".repeat(40),
            },
          ],
        },
        null,
        2,
      )}\n`,
    );

    const result = run(root);
    assert.equal(result.status, 1);
    assert.match(
      result.stderr,
      /archive entry 1: from must be a repository-relative original path/,
    );
    assert.match(
      result.stderr,
      /archive entry 1: to must be a repository-relative archive path/,
    );
  });
});

test("rejects archive paths that are not exact normalized locations", () => {
  withFixture(({ root }) => {
    const contents = "preserved bytes\n";
    const digests = archiveDigests(contents);
    write(root, "docs/archive/plans/old.md", contents);
    write(
      root,
      "docs/archive/MANIFEST.json",
      `${JSON.stringify(
        {
          schemaVersion: 1,
          entries: [
            {
              ...archiveMetadata,
              from: "docs/old.md",
              to: "docs/archive/plans/./old.md",
              sha256: digests.sha256,
              gitBlob: digests.gitBlob,
            },
          ],
        },
        null,
        2,
      )}\n`,
    );

    const result = run(root);
    assert.equal(result.status, 1);
    assert.match(
      result.stderr,
      /archive entry 1: to must be a repository-relative archive path using an exact normalized path under docs\/archive\//,
    );
  });
});

test("rejects original archive paths that use normalized aliases", () => {
  withFixture(({ root }) => {
    const contents = "preserved bytes\n";
    const digests = archiveDigests(contents);
    write(root, "docs/archive/plans/old.md", contents);
    write(
      root,
      "docs/archive/MANIFEST.json",
      `${JSON.stringify(
        {
          schemaVersion: 1,
          entries: [
            {
              ...archiveMetadata,
              from: "docs/./old.md",
              to: "docs/archive/plans/old.md",
              sha256: digests.sha256,
              gitBlob: digests.gitBlob,
            },
          ],
        },
        null,
        2,
      )}\n`,
    );

    const result = run(root);
    assert.equal(result.status, 1);
    assert.match(
      result.stderr,
      /archive entry 1: from must use an exact normalized repository-relative path/,
    );
  });
});

test("rejects symbolic-link archive targets before hashing", () => {
  withFixture(({ root }) => {
    const contents = "mutable live bytes\n";
    const digests = archiveDigests(contents);
    write(root, "docs/live.md", contents);
    mkdirSync(resolve(root, "docs/archive/plans"), { recursive: true });
    symlinkSync(
      resolve(root, "docs/live.md"),
      resolve(root, "docs/archive/plans/old.md"),
    );
    write(
      root,
      "docs/archive/MANIFEST.json",
      `${JSON.stringify(
        {
          schemaVersion: 1,
          entries: [
            {
              ...archiveMetadata,
              from: "docs/old.md",
              to: "docs/archive/plans/old.md",
              sha256: digests.sha256,
              gitBlob: digests.gitBlob,
            },
          ],
        },
        null,
        2,
      )}\n`,
    );

    const result = run(root);
    assert.equal(result.status, 1);
    assert.match(
      result.stderr,
      /archive entry 1: archived target must be a regular, non-symlink file/,
    );
  });
});

test("rejects archive targets reached through a symbolic-link directory", () => {
  withFixture(({ root }) => {
    const contents = "mutable bytes outside the archive\n";
    const digests = archiveDigests(contents);
    write(root, "docs/live/old.md", contents);
    mkdirSync(resolve(root, "docs/archive"), { recursive: true });
    symlinkSync(
      resolve(root, "docs/live"),
      resolve(root, "docs/archive/linked"),
      "dir",
    );
    write(
      root,
      "docs/archive/MANIFEST.json",
      `${JSON.stringify(
        {
          schemaVersion: 1,
          entries: [
            {
              ...archiveMetadata,
              from: "docs/old.md",
              to: "docs/archive/linked/old.md",
              sha256: digests.sha256,
              gitBlob: digests.gitBlob,
            },
          ],
        },
        null,
        2,
      )}\n`,
    );

    const result = run(root);
    assert.equal(result.status, 1);
    assert.match(
      result.stderr,
      /archive entry 1: archived path must not traverse symbolic links/,
    );
  });
});

test("rejects non-regular archive targets before hashing", () => {
  withFixture(({ root }) => {
    mkdirSync(resolve(root, "docs/archive/plans/not-a-file"), {
      recursive: true,
    });
    write(
      root,
      "docs/archive/MANIFEST.json",
      `${JSON.stringify(
        {
          schemaVersion: 1,
          entries: [
            {
              ...archiveMetadata,
              from: "docs/old.md",
              to: "docs/archive/plans/not-a-file",
              sha256: "a".repeat(64),
              gitBlob: "b".repeat(40),
            },
          ],
        },
        null,
        2,
      )}\n`,
    );

    const result = run(root);
    assert.equal(result.status, 1);
    assert.match(
      result.stderr,
      /archive entry 1: archived target must be a regular, non-symlink file/,
    );
  });
});

test("rejects archive hashes that do not match the archived bytes", () => {
  withFixture(({ root }) => {
    write(root, "docs/archive/plans/old.md", "preserved bytes\n");
    write(
      root,
      "docs/archive/MANIFEST.json",
      `${JSON.stringify(
        {
          schemaVersion: 1,
          entries: [
            {
              ...archiveMetadata,
              from: "docs/old.md",
              to: "docs/archive/plans/old.md",
              sha256: "a".repeat(64),
              gitBlob: "b".repeat(40),
            },
          ],
        },
        null,
        2,
      )}\n`,
    );

    const result = run(root);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /archive entry 1: sha256 does not match archived bytes/);
    assert.match(result.stderr, /archive entry 1: gitBlob does not match archived bytes/);
  });
});

test("rejects archive entries without provenance metadata", () => {
  withFixture(({ root }) => {
    const contents = "preserved bytes\n";
    const digests = archiveDigests(contents);
    write(root, "docs/archive/plans/old.md", contents);
    write(
      root,
      "docs/archive/MANIFEST.json",
      `${JSON.stringify(
        {
          schemaVersion: 1,
          entries: [
            {
              from: "docs/old.md",
              to: "docs/archive/plans/old.md",
              sha256: digests.sha256,
              gitBlob: digests.gitBlob,
            },
          ],
        },
        null,
        2,
      )}\n`,
    );

    const result = run(root);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /archive entry 1: archivedAt or date is required/);
    assert.match(result.stderr, /archive entry 1: reason is required/);
    assert.match(
      result.stderr,
      /archive entry 1: supersededBy or supersedingPlan is required/,
    );
  });
});

test("accepts a complete archive manifest entry", () => {
  withFixture(({ root }) => {
    const contents = "preserved bytes\n";
    const digests = archiveDigests(contents);
    write(root, "docs/archive/plans/old.md", contents);
    write(
      root,
      "docs/archive/MANIFEST.json",
      `${JSON.stringify(
        {
          schemaVersion: 1,
          entries: [
            {
              ...archiveMetadata,
              from: "docs/old.md",
              to: "docs/archive/plans/old.md",
              sha256: digests.sha256,
              gitBlob: digests.gitBlob,
            },
          ],
        },
        null,
        2,
      )}\n`,
    );

    const result = run(root);
    assert.equal(result.status, 0, result.stderr);
  });
});
