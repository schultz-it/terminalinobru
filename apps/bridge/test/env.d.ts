/// <reference types="@cloudflare/vitest-pool-workers/types" />

import type { Ambiente } from '../src/index.js';

declare module 'cloudflare:test' {
  // L'augmentation di modulo richiede un'interfaccia vuota che estende i binding del Worker.
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface ProvidedEnv extends Ambiente {}
}
