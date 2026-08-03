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
  const hours = mapHours(row);
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
    freshness: parseFreshness(row.freshness ?? row.freshness_state, row.verified_at ?? row.oldest_verified_at),
    asOfUtc: stringOrNull(row.as_of_utc),
    hours,
    media: media.map((value) => { const item = asRow(value); return { src: String(item.src ?? item.path ?? item.asset_path ?? ''), alt: String(item.alt ?? item.alt_text ?? ''), kind: item.kind as 'cover' | 'gallery' | undefined }; }),
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
  const state = typeof value === 'string' ? value : undefined;
  return typeof verifiedAt === 'string' ? { label: state ? freshnessStateLabel(state) : `Verified ${new Date(verifiedAt).toLocaleDateString()}`, verifiedAt, daysOld: null } : state ? { label: freshnessStateLabel(state), verifiedAt: null, daysOld: null } : undefined;
}

function freshnessStateLabel(state: string) { return state === 'current' ? 'Verified recently' : state === 'overdue' ? 'Verification overdue' : 'Freshness unavailable'; }

function mapHours(row: LooseRow): CatalogStore['hours'] {
  const raw = row.hours ?? row.weekly_hours;
  if (raw && !Array.isArray(raw) && typeof raw === 'object') {
    const today = asRow(raw);
    const weekday = Number(today.weekday ?? 1);
    return [{ weekday, label: displayDay(weekday), status: today.hours_state === 'unavailable' ? 'unavailable' : today.is_closed ? 'closed' : 'open', intervals: asArray(today.intervals).map((value) => { const interval = asRow(value); return { opensAt: String(interval.opens_at ?? ''), closesAt: String(interval.closes_at ?? '') }; }) }];
  }
  const grouped = new Map<number, { closed: boolean; intervals: Array<{ opensAt: string; closesAt: string }> }>();
  for (const value of asArray(raw)) { const item = asRow(value); const weekday = Number(item.weekday ?? item.iso_weekday ?? 0); if (!weekday) continue; const existing = grouped.get(weekday) ?? { closed: Boolean(item.is_closed), intervals: [] }; if (!item.is_closed && item.opens_at && item.closes_at) existing.intervals.push({ opensAt: String(item.opens_at), closesAt: String(item.closes_at) }); grouped.set(weekday, existing); }
  return [...grouped.entries()].sort(([a], [b]) => a - b).map(([weekday, day]) => ({ weekday, label: displayDay(weekday), status: day.closed ? 'closed' : day.intervals.length ? 'open' : 'unavailable', intervals: day.intervals }));
}

function displayDay(weekday: number) {
  return ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][weekday - 1] ?? 'Day';
}
