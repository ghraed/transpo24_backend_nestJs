import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  VehicleCatalogBrandDto,
  VehicleCatalogModelDto,
} from './dto/vehicle-response.dto';

const PREFIX = 'sci:';
const TTL = 24 * 60 * 60 * 1000;
const unavailable = () =>
  new ServiceUnavailableException(
    'Vehicle catalog is temporarily unavailable.',
  );

/** Small, expiring response cache. Never crawls or imports the provider database. */
@Injectable()
export class SwissCarInfoCatalogService {
  private readonly cache = new Map<
    string,
    { expires: number; data: unknown }
  >();
  private readonly pending = new Map<string, Promise<unknown>>();

  isConfigured(): boolean {
    return Boolean(process.env.SWISSCARINFO_API_KEY?.trim());
  }

  isProviderId(id: string): boolean {
    return id.startsWith(PREFIX);
  }

  async listBrands(): Promise<VehicleCatalogBrandDto[]> {
    return this.cached('brands', async () => {
      const body = await this.request('brands', { with_models: '1' });
      return this.unique(
        body.data.flatMap((row) => {
          const name = this.text(row.name);
          return name
            ? [{ id: this.id(name), name, slug: this.text(row.slug) || name }]
            : [];
        }),
      );
    });
  }

  async listModels(
    brandId: string,
    search = '',
  ): Promise<VehicleCatalogModelDto[]> {
    // Resolve against the provider list rather than accepting arbitrary encoded queries.
    const brand = (await this.listBrands()).find((item) => item.id === brandId);
    if (!brand) throw new BadRequestException('Unknown vehicle make.');
    const term = search
      .trim()
      .replace(/([a-z])(?=\d)/gi, '$1 ')
      .replace(/\s+/g, ' ');
    return this.cached(
      `models:${brandId}:${term.toLocaleLowerCase()}`,
      async () => {
        const body = await this.request('search', {
          type: 'brand_model',
          q: `${brand.name} ${term}`.trim(),
          limit: '100',
        });
        return this.unique(
          body.data.flatMap((row) => {
            const identification = row.identification as
              | Record<string, unknown>
              | undefined;
            const make =
              this.text(identification?.make) || this.text(row.brand);
            const name =
              this.text(identification?.commercial_name) ||
              this.text(row.model);
            // The provider's text search can include other manufacturers; keep this selector dependent.
            if (!name || this.normalized(make) !== this.normalized(brand.name))
              return [];
            return [
              {
                id: this.id(`${brand.name}\n${name}`),
                brandId,
                name,
                slug: name,
                bodyType: null,
              },
            ];
          }),
        );
      },
    );
  }

  private id(value: string): string {
    return PREFIX + Buffer.from(value).toString('base64url');
  }

  private text(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
  }

  private normalized(value: string): string {
    return value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  }

  private unique<T extends { name: string }>(rows: T[]): T[] {
    return [
      ...new Map(
        rows.map((row) => [row.name.trim().toLocaleLowerCase(), row]),
      ).values(),
    ].sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }));
  }

  private async request(
    path: string,
    params: Record<string, string>,
  ): Promise<{ data: Record<string, unknown>[] }> {
    if (!this.isConfigured()) throw unavailable();
    const url = new URL(
      path,
      new URL(
        '.',
        process.env.SWISSCARINFO_API_URL ||
          'https://api.swisscarinfo.ch/v3/search',
      ),
    );
    url.searchParams.set('lang', 'en');
    for (const [key, value] of Object.entries(params))
      url.searchParams.set(key, value);
    try {
      const response = await fetch(url, {
        headers: { 'X-API-Key': process.env.SWISSCARINFO_API_KEY!.trim() },
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw unavailable();
      const body = (await response.json()) as {
        success?: boolean;
        data?: unknown;
      };
      if (
        body.success !== true ||
        !Array.isArray(body.data) ||
        body.data.some(
          (row) => !row || typeof row !== 'object' || Array.isArray(row),
        )
      )
        throw unavailable();
      return { data: body.data as Record<string, unknown>[] };
    } catch {
      throw unavailable();
    }
  }

  private async cached<T>(key: string, load: () => Promise<T>): Promise<T> {
    const hit = this.cache.get(key);
    if (hit && hit.expires > Date.now()) return hit.data as T;
    const pending = this.pending.get(key);
    if (pending) return pending as Promise<T>;
    const task = load()
      .then((data) => {
        this.cache.delete(key);
        if (this.cache.size >= 200) {
          const oldest = this.cache.keys().next();
          if (!oldest.done) this.cache.delete(oldest.value);
        }
        this.cache.set(key, { data, expires: Date.now() + TTL });
        return data;
      })
      .finally(() => this.pending.delete(key));
    this.pending.set(key, task);
    return task;
  }
}
