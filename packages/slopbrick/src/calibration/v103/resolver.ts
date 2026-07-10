import { createHash } from 'node:crypto'; import { realpath, readFile } from 'node:fs/promises'; import { relative, resolve, sep } from 'node:path'; import { isCalibrationCheckoutMapV103 } from '@usebrick/core';
export interface SelectedResolution {repositoryId:string;commitSha:string;normalizedPath:string;contentSha256:string}
/** `localPath` is internal execution state only; canonical artifacts retain only normalizedPath. */
export async function resolveSelectedRecord(record:SelectedResolution,map:unknown):Promise<{normalizedPath:string;localPath:string;bytes:Buffer}>{
 if(!isCalibrationCheckoutMapV103(map)||record.normalizedPath.startsWith('/')||record.normalizedPath.split('/').includes('..'))throw new Error('Unable to resolve selected record');const e=map.entries.find(x=>x.repositoryId===record.repositoryId&&x.commitSha===record.commitSha);if(!e)throw new Error('Unable to resolve selected record');
 try{const root=await realpath(e.checkoutPath), file=await realpath(resolve(root,record.normalizedPath)), rel=relative(root,file);if(rel===''||rel==='..'||rel.startsWith(`..${sep}`))throw Error();const bytes=await readFile(file);if(createHash('sha256').update(bytes).digest('hex')!==record.contentSha256)throw Error();return {normalizedPath:record.normalizedPath,localPath:file,bytes};}catch{throw new Error('Unable to resolve selected record');}
}
