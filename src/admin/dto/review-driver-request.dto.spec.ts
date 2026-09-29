import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

import { ReviewDriverRequestDto } from './review-driver-request.dto';

describe('driver decline reason', () => {
  it('requires a meaningful reason that can be shown to the driver', () => {
    for (const reason of [undefined, '', '   ']) {
      const dto = plainToInstance(ReviewDriverRequestDto, { reason });
      expect(
        validateSync(dto).some((error) => error.property === 'reason'),
      ).toBe(true);
    }
  });

  it('trims the reason and limits it to 500 characters', () => {
    const valid = plainToInstance(ReviewDriverRequestDto, {
      reason: '  Replace the blurry ID photo.  ',
    });
    expect(validateSync(valid)).toHaveLength(0);
    expect(valid.reason).toBe('Replace the blurry ID photo.');

    const tooLong = plainToInstance(ReviewDriverRequestDto, {
      reason: 'a'.repeat(501),
    });
    expect(
      validateSync(tooLong).some((error) => error.property === 'reason'),
    ).toBe(true);
  });
});
