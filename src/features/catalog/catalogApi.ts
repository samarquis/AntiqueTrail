import type { CatalogClient, CatalogFilters, CatalogListResult, CatalogStore } from './types';

type RpcClient = { rpc: (name: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string; code?: string } | null }> };

export function createCatalogClient(client: RpcClient): CatalogClient {
  return {
    async list(filters: CatalogFilters): Promise<CatalogListResult> {
      const { data, error } = await client.rpc('catalog_list', {
        p_q: filters.q ?? null,
        p_category: filters.category ?? null,
        p_area: filters.area ?? null,
      });
      if (error) throw catalogError(error);
      const payload = Array.isArray(data) ? { stores: data } : ((data ?? {}) as Record<string, unknown>);
      return {
        stores: ((payload.stores ?? payload.results ?? []) as unknown[]).map(toStore),
        asOfUtc: typeof payload.as_of_utc === 'string' ? payload.as_of_utc : undefined,
      };
    },
    async details(slug: string): Promise<CatalogStore | null> {
      const { data, error } = await client.rpc('catalog_details', { p_slug: slug });
      if (error) {
        if (error.code === 'P0002' || error.code === 'NOT_FOUND') return null;
        throw catalogError(error);
      }
      if (data == null || (Array.isArray(data) && data.length === 0)) return null;
      return toStore(Array.isArray(data) ? data[0] : data);
    },
  };
}

function catalogError(error: { message?: string; code?: string }): Error & { code?: string } {
  const result = new Error(error.code === 'catalog_too_large' ? 'Too many stores matched. Please refine your search.' : error.message || 'Catalog unavailable. Please try again.') as Error & { code?: string };
  result.code = error.code;
  return result;
}

type LooseRow = Record<string, unknown>;

function toStore(value: unknown): CatalogStore {
  const row = asRow(value);
  const area = asRow(row.area ?? { slug: row.area_slug, label: row.area_label });
  const categories = asArray(row.categories ?? row.category_labels);
  const media = asArray(row.media);
  const hours = asArray(row.hours ?? row.weekly_hours);
  return {
    id: String(row.id ?? row.store_id ?? ''),
    slug: String(row.slug ?? ''),
    name: String(row.name ?? ''),
    town: String(row.town ?? row.city ?? ''),
    state: String(row.state ?? row.state_code ?? ''),
    address: String(row.address ?? ''),
    area: { slug: String(area.slug ?? ''), label: String(area.label ?? '') },
    categories: categories.map((item) => { const category = asRow(item); return typeof item === 'string' ? { slug: item, label: item } : { slug: String(category.slug ?? ''), label: String(category.label ?? category.name ?? '') }; }),
    summary: stringOrNull(row.summary),
    description: stringOrNull(row.description),
    phone: stringOrNull(row.phone),
    website: stringOrNull(row.website),
    timeZone: stringOrNull(row.time_zone ?? row.timeZone),
    freshness: parseFreshness(row.freshness, row.verified_at),
    asOfUtc: stringOrNull(row.as_of_utc),
    hours: hours.map((value, index: number) => { const day = asRow(value); const weekday = Number(day.weekday ?? day.iso_weekday ?? index + 1); return {
      weekday,
      label: String(day.label ?? displayDay(weekday)),
      status: (day.status ?? (day.is_closed ? 'closed' : asArray(day.intervals).length ? 'open' : 'unavailable')) as 'open' | 'closed' | 'unavailable',
      intervals: asArray(day.intervals).map((value) => { const interval = asRow(value); return { opensAt: String(interval.opens_at ?? interval.opensAt ?? ''), closesAt: String(interval.closes_at ?? interval.closesAt ?? '') }; }),
    }; }),
    media: media.map((value) => { const item = asRow(value); return { src: String(item.src ?? item.path ?? ''), alt: String(item.alt ?? item.alt_text ?? ''), kind: item.kind as 'cover' | 'gallery' | undefined }; }),
  };
}

function asRow(value: unknown): LooseRow { return value && typeof value === 'object' ? value as LooseRow : {}; }
function asArray(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function stringOrNull(value: unknown): string | null { return typeof value === 'string' ? value : null; }
function parseFreshness(value: unknown, verifiedAt: unknown) {
  if (value && typeof value === 'object') {
    const row = asRow(value);
    return { label: String(row.label ?? 'Freshness unavailable'), verifiedAt: stringOrNull(row.verified_at ?? row.verifiedAt), daysOld: typeof row.days_old === 'number' ? row.days_old : null };
  }
  return typeof verifiedAt === 'string' ? { label: `Verified ${new Date(verifiedAt).toLocaleDateString()}`, verifiedAt, daysOld: null } : undefined;
}

function displayDay(weekday: number) {
  return ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][weekday - 1] ?? 'Day';
}
