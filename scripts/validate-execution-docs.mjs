import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  readdirSync,
  readFileSync,
  realpathSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootFlagIndex = process.argv.indexOf("--root");
const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const root =
  rootFlagIndex === -1
    ? defaultRoot
    : resolve(process.argv[rootFlagIndex + 1] ?? defaultRoot);
const physicalRoot = realpathSync(root);
const indexPath = resolve(root, "docs/execution/index.json");
const errors = [];
const requiredPlanHeadings = [
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

function readText(relativePath) {
  const absolutePath = resolve(root, relativePath);
  if (!existsSync(absolutePath)) {
    errors.push(`missing required file: ${relativePath}`);
    return "";
  }
  return readFileSync(absolutePath, "utf8");
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function listMarkdownFiles(relativeDirectory) {
  const absoluteDirectory = resolve(root, relativeDirectory);
  if (!existsSync(absoluteDirectory)) {
    errors.push(`missing required directory: ${relativeDirectory}`);
    return [];
  }

  const files = [];
  const pending = [absoluteDirectory];
  while (pending.length > 0) {
    const directory = pending.pop();
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = join(directory, entry.name);
      if (entry.isDirectory()) pending.push(absolutePath);
      if (entry.isFile() && entry.name.endsWith(".md")) {
        files.push(relative(root, absolutePath).split("\\").join("/"));
      }
    }
  }
  return files.sort();
}

function hasNonPlaceholderField(markdown, label) {
  const match = markdown.match(
    new RegExp(
      `^\\s*[-*]\\s+\\*\\*${escapeRegex(label)}:\\*\\*\\s+(.+?)\\s*$`,
      "im",
    ),
  );
  if (!match) return false;
  return !/^(?:none|n\/a|tbd|[-—])\.?$/i.test(match[1].trim());
}

function isRepositoryRelativePath(value) {
  if (typeof value !== "string" || value.length === 0 || isAbsolute(value)) {
    return false;
  }
  const normalized = relative(root, resolve(root, value));
  return (
    normalized !== ".." &&
    !normalized.startsWith(
      `..${process.platform === "win32" ? "\\" : "/"}`,
    )
  );
}

function normalizedRepositoryPath(value) {
  if (!isRepositoryRelativePath(value)) return null;
  return relative(root, resolve(root, value)).split("\\").join("/");
}

function isCanonicalPlanPath(value) {
  const normalized = normalizedRepositoryPath(value);
  return (
    normalized !== null &&
    value === normalized &&
    normalized.startsWith("docs/execution/plans/") &&
    normalized.endsWith(".md")
  );
}

function hasNonemptyString(value) {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    !/^(?:none|n\/a|tbd|[-—])\.?$/i.test(value.trim())
  );
}

function hasSubstantiveMarkdown(value) {
  if (typeof value !== "string") return false;
  const normalizedLines = value
    .split(/\r?\n/)
    .map((line) =>
      line
        .trim()
        .replace(/^>\s*/, "")
        .replace(/^(?:[-+*]|\d+[.)])\s+/, "")
        .replace(/^#{1,6}\s+/, "")
        .replace(/^[*_`~]+|[*_`~]+$/g, "")
        .trim(),
    )
    .filter((line) => line.length > 0);
  return normalizedLines.some((line) => hasNonemptyString(line));
}

let index;
try {
  index = JSON.parse(readFileSync(indexPath, "utf8"));
} catch (error) {
  console.error(
    `execution docs invalid: cannot parse docs/execution/index.json: ${error.message}`,
  );
  process.exit(1);
}

const allowedPlanStatuses = new Set([
  "draft",
  "ready",
  "in_progress",
  "waiting_external",
  "done",
  "parked",
  "superseded",
  "cancelled",
]);
const allowedGlobalStatuses = new Set(["advancing", "at_risk", "paused"]);
const allowedTracks = new Set(["implementation", "company"]);

if (!allowedGlobalStatuses.has(index.globalStatus)) {
  errors.push(`unknown global status: ${String(index.globalStatus)}`);
}

if (!Array.isArray(index.plans)) {
  errors.push("index.plans must be an array");
}

const plans = Array.isArray(index.plans) ? index.plans : [];
const ids = new Set();
const priorities = new Set();
const indexedPlanPaths = new Map();

for (const plan of plans) {
  if (typeof plan.id !== "string" || plan.id.length === 0) {
    errors.push("every plan requires a non-empty string id");
    continue;
  }

  if (ids.has(plan.id)) errors.push(`duplicate plan id: ${plan.id}`);
  ids.add(plan.id);

  if (!Number.isInteger(plan.priority) || plan.priority < 0) {
    errors.push(`${plan.id}: priority must be a nonnegative integer`);
  } else if (priorities.has(plan.priority)) {
    errors.push(`duplicate plan priority: ${String(plan.priority)}`);
  } else {
    priorities.add(plan.priority);
  }

  if (!allowedPlanStatuses.has(plan.status)) {
    errors.push(`${plan.id}: unknown status ${String(plan.status)}`);
  }
  if (!allowedTracks.has(plan.track)) {
    errors.push(`${plan.id}: unknown track ${String(plan.track)}`);
  }
  if (!isCanonicalPlanPath(plan.path)) {
    errors.push(
      `${plan.id}: plan path must be a normalized repository-relative Markdown path under docs/execution/plans/`,
    );
  } else if (!existsSync(resolve(root, plan.path))) {
    errors.push(`${plan.id}: missing plan path ${String(plan.path)}`);
  } else {
    const normalizedPath = normalizedRepositoryPath(plan.path);
    indexedPlanPaths.set(
      normalizedPath,
      (indexedPlanPaths.get(normalizedPath) ?? 0) + 1,
    );
  }

  const dependencies = plan.dependencies;
  if (!dependencies || typeof dependencies !== "object") {
    errors.push(`${plan.id}: dependencies must be an object`);
    continue;
  }

  for (const field of [
    "requires",
    "externalGates",
    "benefitsFrom",
    "conflictsWith",
  ]) {
    if (!Array.isArray(dependencies[field])) {
      errors.push(`${plan.id}: dependencies.${field} must be an array`);
    }
  }
}

for (const [path, count] of indexedPlanPaths) {
  if (count > 1) {
    errors.push(`plan path is indexed more than once: ${path}`);
  }
}
for (const path of listMarkdownFiles("docs/execution/plans")) {
  if (!indexedPlanPaths.has(path)) errors.push(`unindexed plan file: ${path}`);
}

for (const plan of plans) {
  if (!plan.dependencies) continue;
  for (const field of ["requires", "benefitsFrom", "conflictsWith"]) {
    for (const dependency of plan.dependencies[field] ?? []) {
      if (!ids.has(dependency)) {
        errors.push(`${plan.id}: unknown ${field} dependency ${dependency}`);
      }
      if (dependency === plan.id) {
        errors.push(`${plan.id}: cannot depend on itself via ${field}`);
      }
    }
  }
}

const visiting = new Set();
const visited = new Set();
const byId = new Map(plans.map((plan) => [plan.id, plan]));

function visit(planId, path = []) {
  if (visiting.has(planId)) {
    errors.push(`requires dependency cycle: ${[...path, planId].join(" -> ")}`);
    return;
  }
  if (visited.has(planId)) return;

  visiting.add(planId);
  for (const dependency of byId.get(planId)?.dependencies?.requires ?? []) {
    if (byId.has(dependency)) visit(dependency, [...path, planId]);
  }
  visiting.delete(planId);
  visited.add(planId);
}

for (const plan of plans) visit(plan.id);

for (const track of allowedTracks) {
  const active = plans.filter(
    (plan) => plan.track === track && plan.status === "in_progress",
  ).length;
  const limit = index.wipLimits?.[track];
  if (!Number.isInteger(limit) || limit < 0) {
    errors.push(`missing or invalid WIP limit for ${track}`);
  } else if (active > limit) {
    errors.push(`${track} WIP overflow: ${active}/${limit}`);
  }
}

if (
  index.globalStatus === "advancing" &&
  !plans.some((plan) => ["ready", "in_progress"].includes(plan.status))
) {
  errors.push("globalStatus is advancing but no plan is ready or in_progress");
}

const canonicalAuthority = {
  roadmap: "ROADMAP.md",
  status: "docs/execution/STATUS.md",
  changelog: "docs/execution/CHANGELOG.md",
};
for (const [name, expectedPath] of Object.entries(canonicalAuthority)) {
  if (index[name] !== expectedPath) {
    errors.push(`${name} authority must equal ${expectedPath}`);
  }
  if (!existsSync(resolve(root, expectedPath))) {
    errors.push(`missing ${name} authority file: ${expectedPath}`);
  }
}

const roadmap = readText("ROADMAP.md");
for (const link of [
  "docs/execution/index.json",
  "docs/execution/STATUS.md",
  "docs/execution/CHANGELOG.md",
]) {
  if (!roadmap.includes(link)) errors.push(`ROADMAP.md does not link to ${link}`);
}

const executionReadme = readText("docs/execution/README.md");
for (const link of ["../../ROADMAP.md", "index.json", "STATUS.md", "CHANGELOG.md"]) {
  if (!executionReadme.includes(link)) {
    errors.push(`docs/execution/README.md does not link to ${link}`);
  }
}

const status = readText("docs/execution/STATUS.md");
const changelog = readText("docs/execution/CHANGELOG.md");
if (!status.includes(`**Index revision:** ${String(index.revision)}`)) {
  errors.push("STATUS.md revision does not match index.json");
}
if (!status.includes(`**Global status:** \`${index.globalStatus}\``)) {
  errors.push("STATUS.md global status does not match index.json");
}
if (!changelog.includes(`## Revision ${String(index.revision)} —`)) {
  errors.push("CHANGELOG.md revision does not match index.json");
}

for (const plan of plans) {
  const planText = isCanonicalPlanPath(plan.path) ? readText(plan.path) : "";
  if (!planText.includes(`- **Status:** \`${plan.status}\``)) {
    errors.push(`${plan.id}: Markdown status does not match index.json`);
  }

  for (const heading of requiredPlanHeadings) {
    const headingMatch = new RegExp(
      `^## ${escapeRegex(heading)}\\s*$`,
      "m",
    ).exec(planText);
    if (!headingMatch) {
      errors.push(`${plan.id}: missing required heading ## ${heading}`);
      continue;
    }

    const afterHeading = planText.slice(
      headingMatch.index + headingMatch[0].length,
    );
    const nextLevelTwoHeading = /^##(?:\s|$)/m.exec(afterHeading);
    const sectionBody = afterHeading.slice(0, nextLevelTwoHeading?.index);
    if (!hasSubstantiveMarkdown(sectionBody)) {
      errors.push(
        `${plan.id}: required heading ## ${heading} must have substantive content`,
      );
    }
  }

  const statusRow = new RegExp(
    `^.*${escapeRegex(plan.id)}.*` +
      "`" +
      escapeRegex(plan.status) +
      "`.*$",
    "m",
  );
  if (!statusRow.test(status)) {
    errors.push(
      `STATUS.md does not contain ${plan.id} with status ${plan.status}`,
    );
  }

  if (plan.status === "waiting_external") {
    if ((plan.dependencies?.externalGates?.length ?? 0) === 0) {
      errors.push(
        `${plan.id}: waiting_external requires at least one external gate`,
      );
    }
    for (const label of [
      "Exact input",
      "Owner",
      "Last verified",
      "Evidence",
      "Resume condition",
      "Recheck",
      "Parallel safe",
    ]) {
      if (!hasNonPlaceholderField(planText, label)) {
        errors.push(`${plan.id}: waiting_external missing ${label}`);
      }
    }
  }
}

const archiveManifestText = readText("docs/archive/MANIFEST.json");
if (archiveManifestText) {
  let archiveManifest;
  try {
    archiveManifest = JSON.parse(archiveManifestText);
  } catch (error) {
    errors.push(`cannot parse docs/archive/MANIFEST.json: ${error.message}`);
  }

  if (archiveManifest && !Array.isArray(archiveManifest.entries)) {
    errors.push("docs/archive/MANIFEST.json entries must be an array");
  }

  for (const [entryIndex, entry] of (archiveManifest?.entries ?? []).entries()) {
    const label = `archive entry ${entryIndex + 1}`;
    const normalizedOriginalPath = normalizedRepositoryPath(entry?.from);
    const normalizedArchivePath = normalizedRepositoryPath(entry?.to);
    const isExactOriginalPath =
      normalizedOriginalPath !== null && entry.from === normalizedOriginalPath;
    const isExactArchivePath =
      normalizedArchivePath !== null &&
      entry.to === normalizedArchivePath &&
      normalizedArchivePath.startsWith("docs/archive/");
    let archivedBytes;
    if (!hasNonemptyString(entry?.archivedAt) && !hasNonemptyString(entry?.date)) {
      errors.push(`${label}: archivedAt or date is required`);
    }
    if (!hasNonemptyString(entry?.reason)) {
      errors.push(`${label}: reason is required`);
    }
    if (
      !hasNonemptyString(entry?.supersededBy) &&
      !hasNonemptyString(entry?.supersedingPlan)
    ) {
      errors.push(`${label}: supersededBy or supersedingPlan is required`);
    }
    if (!isRepositoryRelativePath(entry?.from)) {
      errors.push(`${label}: from must be a repository-relative original path`);
    } else if (!isExactOriginalPath) {
      errors.push(
        `${label}: from must use an exact normalized repository-relative path`,
      );
    }
    if (!isExactArchivePath) {
      errors.push(
        `${label}: to must be a repository-relative archive path using an exact normalized path under docs/archive/`,
      );
    } else {
      const archivedPath = resolve(root, normalizedArchivePath);
      let archivedTarget;
      try {
        archivedTarget = lstatSync(archivedPath);
      } catch (error) {
        if (error?.code === "ENOENT") {
          errors.push(`${label}: missing archived file ${entry.to}`);
        } else {
          errors.push(
            `${label}: cannot inspect archived file ${entry.to}: ${error.message}`,
          );
        }
      }

      if (
        archivedTarget &&
        (archivedTarget.isSymbolicLink() || !archivedTarget.isFile())
      ) {
        errors.push(
          `${label}: archived target must be a regular, non-symlink file`,
        );
      } else if (archivedTarget) {
        const physicalArchivePath = realpathSync(archivedPath);
        const expectedPhysicalPath = resolve(
          physicalRoot,
          normalizedArchivePath,
        );
        if (physicalArchivePath !== expectedPhysicalPath) {
          errors.push(
            `${label}: archived path must not traverse symbolic links`,
          );
        } else {
          archivedBytes = readFileSync(archivedPath);
        }
      }
    }
    if (!/^[a-f0-9]{64}$/i.test(entry?.sha256 ?? "")) {
      errors.push(`${label}: sha256 must be 64 hexadecimal characters`);
    } else if (
      archivedBytes &&
      createHash("sha256").update(archivedBytes).digest("hex") !==
        entry.sha256.toLowerCase()
    ) {
      errors.push(`${label}: sha256 does not match archived bytes`);
    }
    if (!/^[a-f0-9]{40}$/i.test(entry?.gitBlob ?? "")) {
      errors.push(`${label}: gitBlob must be 40 hexadecimal characters`);
    } else if (archivedBytes) {
      const gitBlob = createHash("sha1")
        .update(`blob ${archivedBytes.length}\0`)
        .update(archivedBytes)
        .digest("hex");
      if (gitBlob !== entry.gitBlob.toLowerCase()) {
        errors.push(`${label}: gitBlob does not match archived bytes`);
      }
    }
  }
}

if (errors.length > 0) {
  console.error(`execution docs invalid (${errors.length} error${errors.length === 1 ? "" : "s"}):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(
  `execution docs valid: ${plans.length} plans, implementation ${plans.filter((plan) => plan.track === "implementation" && plan.status === "in_progress").length}/${index.wipLimits.implementation}, company ${plans.filter((plan) => plan.track === "company" && plan.status === "in_progress").length}/${index.wipLimits.company}`,
);
