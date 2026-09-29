import { ServicesService } from './services.service';

describe('ServicesService', () => {
  it('returns active catalog entries in database order with a restricted projection', async () => {
    const rows = [{ id: 'first' }, { id: 'second' }];
    const findMany = jest.fn().mockResolvedValue(rows);
    const service = new ServicesService({ service: { findMany } } as never);
    await expect(service.listActiveServices()).resolves.toBe(rows);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
      }),
    );
    expect(findMany.mock.calls[0][0].select).toEqual({
      id: true,
      key: true,
      nameEn: true,
      nameAr: true,
      descriptionEn: true,
      descriptionAr: true,
      icon: true,
      isActive: true,
      sortOrder: true,
    });
  });

  it('returns an empty catalog and propagates database failures', async () => {
    const findMany = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error('database unavailable'));
    const service = new ServicesService({ service: { findMany } } as never);
    await expect(service.listActiveServices()).resolves.toEqual([]);
    await expect(service.listActiveServices()).rejects.toThrow(
      'database unavailable',
    );
  });
});
