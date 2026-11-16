/**
 * Every source `pnpm scrape` knows. Factories, so a source that is not selected
 * costs nothing.
 */

import type { SourceId } from '@/lib/listing-card';
import type { SourceAdapter } from './types';
import { createUrbaniaAdapter } from './urbania';

export const ADAPTERS: Partial<Record<Exclude<SourceId, 'manual'>, () => SourceAdapter>> = {
  urbania: createUrbaniaAdapter,
};
