import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os'; import { join } from 'node:path'; import { createHash } from 'node:crypto';
import { resolveSelectedRecord } from '../../src/calibration/v103/resolver';
const dirs:string[]=[]; const sha=(s:string)=>createHash('sha256').update(s).digest('hex');
afterEach(()=>{while(dirs.length)rmSync(dirs.pop()!,{recursive:true,force:true});});
function fixture(){const root=mkdtempSync(join(tmpdir(),'v103-checkout-'));dirs.push(root);mkdirSync(join(root,'src'));writeFileSync(join(root,'src','a.ts'),'ok');const map={version:'v10.3' as const,runId:'run',entries:[{repositoryId:'repo',commitSha:'a'.repeat(40),checkoutPath:root}]};return {root,map,record:{repositoryId:'repo',commitSha:'a'.repeat(40),normalizedPath:'src/a.ts',contentSha256:sha('ok')}};}
describe('v10.3 checkout resolver',()=>{
 it('returns verified bytes and manifest-relative path only',async()=>{const f=fixture();await expect(resolveSelectedRecord(f.record,f.map)).resolves.toMatchObject({normalizedPath:'src/a.ts',bytes:Buffer.from('ok')});});
 it.each(['missing','traversal','symlink','hash'] as const)('fails closed for %s',async kind=>{const f=fixture();if(kind==='missing')f.map.entries=[];if(kind==='traversal')f.record.normalizedPath='../a.ts';if(kind==='hash')f.record.contentSha256='0'.repeat(64);if(kind==='symlink'){const out=mkdtempSync(join(tmpdir(),'v103-out-'));dirs.push(out);writeFileSync(join(out,'x.ts'),'x');symlinkSync(join(out,'x.ts'),join(f.root,'src','link.ts'));f.record.normalizedPath='src/link.ts';f.record.contentSha256=sha('x');}await expect(resolveSelectedRecord(f.record,f.map)).rejects.toThrow();});
});
