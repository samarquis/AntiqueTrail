export type CatalogHoursStatus = 'open' | 'closed' | 'unavailable';

export interface CatalogHoursDay {
  weekday: number;
  label: string;
  status: CatalogHoursStatus;
  intervals: Array<{ opensAt: string; closesAt: string }>;
}

export interface CatalogMedia {
  src: string;
  alt: string;
  kind?: 'cover' | 'gallery';
}

export interface CatalogStore {
  id: string;
  slug: string;
  name: string;
  town: string;
  state: string;
  address: string;
  area: { slug: string; label: string };
  categories: Array<{ slug: string; label: string }>;
  summary?: string | null;
  description?: string | null;
  phone?: string | null;
  website?: string | null;
  timeZone?: string | null;
  freshness?: { label: string; verifiedAt?: string | null; daysOld?: number | null };
  asOfUtc?: string | null;
  hours: CatalogHoursDay[];
  media: CatalogMedia[];
}

export interface CatalogFilters {
  q?: string;
  category?: string;
  area?: string;
}

export interface CatalogListResult {
  stores: CatalogStore[];
  asOfUtc?: string | null;
}

export type CatalogErrorCode = 'catalog_too_large' | 'not_found' | 'network' | 'unknown';

export interface CatalogError {
  code: CatalogErrorCode;
  message: string;
  retryable: boolean;
}

export interface CatalogClient {
  list(filters: CatalogFilters): Promise<CatalogListResult>;
  details(slug: string): Promise<CatalogStore | null>;
}

