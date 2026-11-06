import { SwissCarInfoCatalogService } from './swisscarinfo-catalog.service';

describe('SwissCarInfoCatalogService', () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.SWISSCARINFO_API_KEY;
  const originalUrl = process.env.SWISSCARINFO_API_URL;
  const fetchMock = jest.fn();
  const reply = (data: unknown, success = true) => ({
    ok: true,
    json: async () => ({ success, data }),
  });

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
    process.env.SWISSCARINFO_API_KEY = 'test-key';
    process.env.SWISSCARINFO_API_URL = 'https://api.swisscarinfo.ch/v3/search';
  });
  afterAll(() => {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.SWISSCARINFO_API_KEY;
    else process.env.SWISSCARINFO_API_KEY = originalKey;
    if (originalUrl === undefined) delete process.env.SWISSCARINFO_API_URL;
    else process.env.SWISSCARINFO_API_URL = originalUrl;
  });

  it('loads real provider makes once and keeps the API key on the server', async () => {
    fetchMock.mockResolvedValue(
      reply([
        { name: 'Mercedes-Benz', slug: 'mercedes-benz' },
        { name: 'BMW', slug: 'bmw' },
      ]),
    );
    const catalog = new SwissCarInfoCatalogService();
    const [first, second] = await Promise.all([
      catalog.listBrands(),
      catalog.listBrands(),
    ]);
    expect(first.map((row) => row.name)).toEqual(['BMW', 'Mercedes-Benz']);
    expect(second).toEqual(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0].pathname).toBe('/v3/brands');
    expect(fetchMock.mock.calls[0][1].headers).toEqual({
      'X-API-Key': 'test-key',
    });
    expect(JSON.stringify(first)).not.toContain('test-key');
  });

  it('keeps models under their make, deduplicates variants and searches C320 as C 320', async () => {
    fetchMock.mockResolvedValueOnce(reply([{ name: 'Mercedes-Benz' }]));
    const catalog = new SwissCarInfoCatalogService();
    const [brand] = await catalog.listBrands();
    fetchMock.mockResolvedValueOnce(
      reply([
        { identification: { make: 'MERCEDES-BENZ', commercial_name: 'C 320' } },
        { brand: 'Mercedes-Benz', model: 'C 320' },
        { brand: 'BMW', model: '320' },
        { brand: 'Mercedes-Benz', model: 'C 230' },
      ]),
    );
    const models = await catalog.listModels(brand.id, 'C320');
    expect(models.map((row) => row.name)).toEqual(['C 230', 'C 320']);
    expect(models.every((row) => row.brandId === brand.id)).toBe(true);
    const url = fetchMock.mock.calls[1][0] as URL;
    expect(url.searchParams.get('q')).toBe('Mercedes-Benz C 320');
    expect(url.searchParams.get('type')).toBe('brand_model');
    await expect(catalog.listModels('sci:invalid')).rejects.toThrow(
      'Unknown vehicle make',
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not cache provider errors and can retry', async () => {
    const catalog = new SwissCarInfoCatalogService();
    fetchMock.mockResolvedValueOnce(reply([], false));
    await expect(catalog.listBrands()).rejects.toThrow(
      'temporarily unavailable',
    );
    fetchMock.mockResolvedValueOnce(reply([{ name: 'BMW' }]));
    await expect(catalog.listBrands()).resolves.toHaveLength(1);
  });

  it('refreshes data after the cache expiry', async () => {
    const now = jest.spyOn(Date, 'now');
    now.mockReturnValue(1000);
    fetchMock.mockResolvedValue(reply([{ name: 'BMW' }]));
    const catalog = new SwissCarInfoCatalogService();
    await catalog.listBrands();
    now.mockReturnValue(1000 + 24 * 60 * 60 * 1000);
    await catalog.listBrands();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    now.mockRestore();
  });
});
