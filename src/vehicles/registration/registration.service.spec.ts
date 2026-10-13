import sharp from 'sharp';
import {
  RegistrationService,
  MAX_REGISTRATION_IMAGE_BYTES,
} from './registration.service';
import { QwenRegistrationProvider } from './qwen-registration.provider';

describe('registration image processing', () => {
  const provider = { assertConfigured: jest.fn(), extract: jest.fn() };
  const service = new RegistrationService(
    provider as unknown as QwenRegistrationProvider,
  );
  const file = (buffer: Buffer) =>
    ({
      buffer,
      originalname: 'card.exe',
      mimetype: 'text/plain',
    }) as Express.Multer.File;
  const image = (width = 256, height = 128) =>
    sharp({ create: { width, height, channels: 3, background: '#ffffff' } })
      .png()
      .toBuffer();
  beforeEach(() => {
    jest.clearAllMocks();
    provider.extract.mockResolvedValue({ status: 'partial' });
  });
  it('decodes actual content, auto-orients and strips metadata, then clears buffers', async () => {
    const buffer = await sharp(await image())
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toBuffer();
    const uploaded = file(buffer);
    provider.extract.mockImplementation(async (images: Buffer[]) => {
      const metadata = await sharp(images[0]).metadata();
      expect(metadata.format).toBe('jpeg');
      expect(metadata.width).toBe(128);
      expect(metadata.height).toBe(256);
      expect(metadata.exif).toBeUndefined();
      expect(metadata.orientation).toBeUndefined();
      return { status: 'partial' };
    });
    await service.extract([uploaded]);
    expect(buffer.every((v) => v === 0)).toBe(true);
    expect(uploaded.buffer.length).toBe(0);
  });
  it('supports two sides and bounds output dimensions', async () => {
    provider.extract.mockImplementation(async (images: Buffer[]) => {
      expect(images).toHaveLength(2);
      expect((await sharp(images[0]).metadata()).width).toBe(3000);
      return { status: 'partial' };
    });
    await service.extract([file(await image(5000, 100)), file(await image())]);
  });
  it.each([
    Buffer.from('not an image'),
    Buffer.from('<svg></svg>'),
    Buffer.alloc(MAX_REGISTRATION_IMAGE_BYTES + 1),
  ])('rejects invalid content/size', async (buffer) => {
    await expect(
      service.extract([file(Buffer.from(buffer))]),
    ).rejects.toThrow();
    expect(provider.extract).not.toHaveBeenCalled();
  });
  it('rejects too many, missing, tiny and excessive dimension images', async () => {
    await expect(service.extract([])).rejects.toThrow();
    await expect(
      service.extract([
        file(await image()),
        file(await image()),
        file(await image()),
      ]),
    ).rejects.toThrow();
    await expect(
      service.extract([file(await image(32, 128))]),
    ).rejects.toThrow();
    await expect(
      service.extract([file(await image(12001, 64))]),
    ).rejects.toThrow();
  });
  it('cleans raw and normalized buffers when the provider fails', async () => {
    const uploaded = file(await image());
    let normalized: Buffer[] = [];
    provider.extract.mockImplementation((images: Buffer[]) => {
      normalized = [...images];
      throw new Error('provider failed');
    });
    await expect(service.extract([uploaded])).rejects.toThrow();
    expect(uploaded.buffer.length).toBe(0);
    expect(normalized[0].every((v) => v === 0)).toBe(true);
  });
  it('cleans uploads when configuration is unavailable', async () => {
    const uploaded = file(await image());
    provider.assertConfigured.mockImplementationOnce(() => {
      throw new Error();
    });
    await expect(service.extract([uploaded])).rejects.toThrow();
    expect(uploaded.buffer.length).toBe(0);
  });
  it('rejects APNG animation chunks even when a decoder would expose only the first frame', async () => {
    const png = await image();
    const chunk = Buffer.alloc(20);
    chunk.writeUInt32BE(8, 0);
    chunk.write('acTL', 4);
    chunk.writeUInt32BE(2, 8);
    const animated = Buffer.concat([
      png.subarray(0, 33),
      chunk,
      png.subarray(33),
    ]);
    await expect(service.extract([file(animated)])).rejects.toThrow();
    expect(provider.extract).not.toHaveBeenCalled();
  });
  it('rejects decoded pixel limits independently of compressed file size', async () => {
    const compressed = await image(7000, 7000);
    expect(compressed.length).toBeLessThan(MAX_REGISTRATION_IMAGE_BYTES);
    await expect(service.extract([file(compressed)])).rejects.toThrow();
    expect(provider.extract).not.toHaveBeenCalled();
  });
});
