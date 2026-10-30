// Lets Node run the api/ files in tests: "./x.js" imports resolve to "./x.ts".
import { register } from 'node:module';
register('./ts-resolver.mjs', import.meta.url);
