/// <reference types="@cloudflare/vitest-pool-workers/types" />

import type { D1Migration } from 'cloudflare:test';
import type { Ambiente } from '../src/ambiente.js';

declare global {
  namespace Cloudflare {
    /** `env` dei test: i binding del Worker più le migrazioni passate da vitest.config.ts. */
    interface Env extends Ambiente {
      MIGRAZIONI: D1Migration[];
    }
  }
}
