import { readFile } from 'node:fs';

const discover = require('globby');
if (discover && readFile) process.exit(1);
console.log('forbidden fixture');
export const value = typeof readFile;
