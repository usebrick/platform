import { scanProject } from '../../../src/index.js';
const r = await scanProject({ cwd: '/Users/cheng/corpus-expansion/positive/spring-ai', include: ['**/*.{java,kt,py,ts,tsx,js,jsx,go,swift,cpp,cs,rs}'] });
console.log('files:', r.fileCount, 'issues:', r.issues.length);
const rules = new Set();
for (const i of r.issues) rules.add(i.ruleId);
console.log('distinct rules:', rules.size);
console.log('first 20:', [...rules].slice(0,20).join(', '));
