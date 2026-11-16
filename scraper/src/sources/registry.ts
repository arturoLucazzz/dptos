/**
 * Every source `pnpm scrape` knows. Factories, so a source that is not selected
 * costs nothing.
 */

import type { SourceId } from '@/lib/listing-card';
import { naventAdapter } from './navent/adapter';
import type { SourceAdapter } from './types';

export const ADAPTERS: Partial<Record<Exclude<SourceId, 'manual'>, () => SourceAdapter>> = {
  urbania: () => naventAdapter('urbania'),
  adondevivir: () => naventAdapter('adondevivir'),
};
