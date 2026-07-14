import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync, rmSync, statSync } from 'node:fs'; import { realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os'; import { join } from 'node:path'; import { createHash } from 'node:crypto';
import { resolveSelectedRecord } from '../../src/calibration/v103/resolver';
const dirs:string[]=[]; const sha=(s:string)=>createHash('sha256').update(s).digest('hex');
afterEach(()=>{while(dirs.length)rmSync(dirs.pop()!,{recursive:true,force:true});});
function fixture(){const root=mkdtempSync(join(tmpdir(),'v103-checkout-'));dirs.push(root);mkdirSync(join(root,'src'));writeFileSync(join(root,'src','a.ts'),'ok');const map={version:'v10.3' as const,runId:'run',entries:[{repositoryId:'repo',commitSha:'a'.repeat(40),checkoutPath:root}]};return {root,map,record:{repositoryId:'repo',commitSha:'a'.repeat(40),normalizedPath:'src/a.ts',contentSha256:sha('ok')}};}
const releaseBinding = { kind: 'release_archive' as const, assetSha256: 'b'.repeat(64), extractionPolicy: 'safe-zip-v1' as const };
describe('v10.3 checkout resolver',()=>{
 it('returns a verified internal path plus manifest-relative path',async()=>{const f=fixture();const resolved=await resolveSelectedRecord(f.record,f.map);expect(resolved).toMatchObject({normalizedPath:'src/a.ts',bytes:Buffer.from('ok')});expect(resolved.localPath).toBe(await realpath(join(f.root,'src','a.ts')));});
 it.each(['missing','traversal','symlink','hash','directory','mutation'] as const)('fails closed for %s',async kind=>{const f=fixture();if(kind==='missing')f.map.entries=[];if(kind==='traversal')f.record.normalizedPath='../a.ts';if(kind==='hash')f.record.contentSha256='0'.repeat(64);if(kind==='symlink'){const out=mkdtempSync(join(tmpdir(),'v103-out-'));dirs.push(out);writeFileSync(join(out,'x.ts'),'x');symlinkSync(join(out,'x.ts'),join(f.root,'src','link.ts'));f.record.normalizedPath='src/link.ts';f.record.contentSha256=sha('x');}if(kind==='directory'){f.record.normalizedPath='src';}if(kind==='mutation'){writeFileSync(join(f.root,'src','a.ts'),'changed');}await expect(resolveSelectedRecord(f.record,f.map)).rejects.toThrow();});

 it('matches a release selection only to the exact archive binding',async()=>{const f=fixture();f.map.entries[0] = { ...f.map.entries[0]!, materialization: releaseBinding };const record = { ...f.record, materialization: releaseBinding };await expect(resolveSelectedRecord(record,f.map)).resolves.toMatchObject({normalizedPath:'src/a.ts',bytes:Buffer.from('ok')});});

 it.each([
   ['release selection against Git checkout', { record: { ...fixture().record, materialization: releaseBinding } }],
   ['Git selection against release checkout', { map: { ...fixture().map, entries: [{ ...fixture().map.entries[0]!, materialization: releaseBinding }] } }],
   ['wrong archive digest', { record: { ...fixture().record, materialization: releaseBinding }, mapBinding: { ...releaseBinding, assetSha256: 'c'.repeat(64) } }],
   ['wrong extraction policy', { record: { ...fixture().record, materialization: releaseBinding }, mapBinding: { ...releaseBinding, extractionPolicy: 'safe-zip-v2' } }],
 ])('rejects %s',async (_name, input)=>{const f=fixture();const map = input.map ?? f.map;const record = input.record ?? f.record;if(input.mapBinding) { map.entries[0] = { ...map.entries[0]!, materialization: input.mapBinding }; }await expect(resolveSelectedRecord(record,map)).rejects.toThrow();});

 it('rejects duplicate candidate entries, non-regular files, and a symlinked checkout root',async()=>{const f=fixture();const duplicate = { ...f.map, entries: [f.map.entries[0]!, { ...f.map.entries[0]! }] };await expect(resolveSelectedRecord(f.record,duplicate)).rejects.toThrow();const directory = join(f.root,'src','directory');mkdirSync(directory);await expect(resolveSelectedRecord({ ...f.record, normalizedPath:'src/directory' },f.map)).rejects.toThrow();const outside = mkdtempSync(join(tmpdir(),'v103-outside-root-'));dirs.push(outside);mkdirSync(join(outside,'src'));writeFileSync(join(outside,'src','a.ts'),'ok');const link = join(f.root,'root-link');symlinkSync(outside,link);await expect(resolveSelectedRecord(f.record,{ ...f.map, entries:[{ ...f.map.entries[0]!, checkoutPath:link }] })).rejects.toThrow();});

 it('rejects a file mutation after a valid map was created',async()=>{const f=fixture();expect(statSync(join(f.root,'src','a.ts')).isFile()).toBe(true);const first=await resolveSelectedRecord(f.record,f.map);expect(first.bytes).toEqual(Buffer.from('ok'));writeFileSync(join(f.root,'src','a.ts'),'changed');await expect(resolveSelectedRecord(f.record,f.map)).rejects.toThrow();});
 it('fails closed for malformed records and materialization bindings',async()=>{const f=fixture();await expect(resolveSelectedRecord(null as never,f.map)).rejects.toThrow('Unable to resolve selected record');await expect(resolveSelectedRecord({ ...f.record, materialization:{ kind:'release_archive', assetSha256:'b'.repeat(64), extractionPolicy:'safe-zip-v1', extra:true } } as never,f.map)).rejects.toThrow('Unable to resolve selected record');});
});
