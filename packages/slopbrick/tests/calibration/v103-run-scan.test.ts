import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os'; import { join } from 'node:path'; import { createHash } from 'node:crypto';
import { runV103Scan } from '../../src/calibration/v103/run-scan';
const dirs: string[]=[]; afterEach(()=>{while(dirs.length)rmSync(dirs.pop()!,{recursive:true,force:true});});
describe('v10.3 complete scan run',()=>{
 it('scans a verified local selected record and writes path-free evidence',async()=>{const root=mkdtempSync(join(tmpdir(),'v103-run-'));dirs.push(root);mkdirSync(join(root,'src'));writeFileSync(join(root,'src','a.ts'),'x');const digest=createHash('sha256').update('x').digest('hex');const record={fileId:'a',sourceId:'a',repositoryId:'repo',familyId:'family',commitSha:'a'.repeat(40),normalizedPath:'src/a.ts',contentSha256:digest,language:'ts',stratum:'production',label:'verified_ai',tier:'gold',split:'test',selectionKey:'a',status:'selected' as const};const evidence=await runV103Scan({directory:root,runId:'run',records:[record],checkoutMap:{version:'v10.3',runId:'run',entries:[{repositoryId:'repo',commitSha:'a'.repeat(40),checkoutPath:root}]},chunkSize:1,timeoutMs:10,retryTimeoutMs:20,includeRules:[],excludeRules:[],invoker:async()=>({exitCode:0,json:{ok:true,issues:[]}})});expect(evidence.observations).toHaveLength(1);const text=readFileSync(join(root,'observations.jsonl'),'utf8');expect(text).not.toContain(root);});
});
