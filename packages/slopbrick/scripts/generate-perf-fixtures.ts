import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const FIXTURE_DIR = resolve(process.cwd(), 'tests', 'perf', 'fixtures');

const SLOP_CLASS_POOL = [
  'p-[13px]',
  'm-[20px]',
  'w-[100px]',
  'h-[50px]',
  'text-[15px]',
  'outline-none',
  'flex items-center justify-center min-h-screen text-center',
];

const TOKEN_CLASS_POOL = [
  'p-4',
  'm-4',
  'w-full',
  'h-10',
  'text-sm',
  'rounded-md',
  'bg-blue-500',
];

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(arr: readonly T[]): T {
  return arr[randomInt(0, arr.length - 1)];
}

function sampleClasses(count: number): string {
  const classes: string[] = [];
  for (let i = 0; i < count; i++) {
    classes.push(Math.random() < 0.3 ? pick(SLOP_CLASS_POOL) : pick(TOKEN_CLASS_POOL));
  }
  return classes.join(' ');
}

function generateComponent(index: number, nodeCount: number): string {
  const className = sampleClasses(randomInt(1, 5));
  const hookCount = randomInt(0, Math.min(3, Math.floor(nodeCount / 20)));
  const hooks: string[] = [];
  for (let i = 0; i < hookCount; i++) {
    hooks.push(`const [state${i}, setState${i}] = useState(${i});`);
  }
  const hookLines = hooks.length > 0 ? `  ${hooks.join('\n  ')}\n` : '';

  // Build nested JSX to approximate the requested AST node count.
  let jsx = `<div className="${className}">hello ${index}</div>`;
  let remaining = nodeCount;
  // Each wrapper adds roughly 3 AST nodes (open tag, close tag, attribute name+value).
  while (remaining > 30) {
    const wrapperClass = sampleClasses(randomInt(1, 3));
    jsx = `<div className="${wrapperClass}">${jsx}</div>`;
    remaining -= 20;
  }

  return `export function PerfComponent${index}() {
${hookLines}  return (
    ${jsx}
  );
}
`;
}

export function generatePerfFixtures(
  targetDir: string,
  componentCount = 2000,
): { componentCount: number; filesCreated: number } {
  mkdirSync(targetDir, { recursive: true });

  // Clear existing fixtures.
  for (const entry of readdirSync(targetDir, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.tsx')) {
      rmSync(join(targetDir, entry.name));
    }
  }

  const componentsPerFile = 10;
  const filesCreated = Math.ceil(componentCount / componentsPerFile);

  for (let fileIndex = 0; fileIndex < filesCreated; fileIndex++) {
    const parts: string[] = [];
    for (let i = 0; i < componentsPerFile; i++) {
      const componentIndex = fileIndex * componentsPerFile + i;
      if (componentIndex >= componentCount) break;

      const bucket = Math.random();
      let nodeCount: number;
      if (bucket < 0.6) {
        nodeCount = randomInt(50, 100);
      } else if (bucket < 0.9) {
        nodeCount = randomInt(100, 500);
      } else {
        nodeCount = randomInt(500, 1000);
      }

      parts.push(generateComponent(componentIndex, nodeCount));
    }
    writeFileSync(join(targetDir, `perf-${String(fileIndex).padStart(4, '0')}.tsx`), parts.join('\n'));
  }

  return { componentCount, filesCreated };
}

function main(): void {
  const { componentCount, filesCreated } = generatePerfFixtures(FIXTURE_DIR);
  console.log(`Generated ${componentCount} components across ${filesCreated} files in ${FIXTURE_DIR}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
