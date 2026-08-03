import { describe, expect, it, vi } from 'vitest';
import { createCatalogClient } from './catalogApi';

describe('catalog RPC client', () => {
  it('uses one bounded list RPC and maps the complete projection', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { as_of_utc: '2026-01-01T00:00:00Z', stores: [{ id: '1', slug: 'oak-mall', name: 'Oak Mall', area_slug: 'topeka-ks', area_label: 'Topeka', categories: [{ slug: 'vintage', label: 'Vintage' }], hours: [], media: [] }] }, error: null });
    const result = await createCatalogClient({ rpc }).list({ q: 'oak', category: 'vintage', area: 'topeka-ks' });
    expect(rpc).toHaveBeenCalledWith('catalog_list', { p_q: 'oak', p_category: 'vintage', p_area: 'topeka-ks' });
    expect(result.stores[0].name).toBe('Oak Mall');
    expect(result.asOfUtc).toBe('2026-01-01T00:00:00Z');
  });

  it('maps not-found details to null and does not leak row errors', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: 'NOT_FOUND' } });
    await expect(createCatalogClient({ rpc }).details('hidden-store')).resolves.toBeNull();
  });
});

