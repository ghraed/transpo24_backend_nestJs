import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

import { ReviewDriverRequestDto } from './review-driver-request.dto';

describe('driver decline reason', () => {
  it('requires a meaningful reason that can be shown to the driver', () => {
    for (const reason of [undefined, '', '   ']) {
      const dto = plainToInstance(ReviewDriverRequestDto, {
        reason,
        rejectedDocumentIds: ['doc-1'],
      });
      expect(
        validateSync(dto).some((error) => error.property === 'reason'),
      ).toBe(true);
    }
  });

  it('trims the reason and limits it to 500 characters', () => {
    const valid = plainToInstance(ReviewDriverRequestDto, {
      reason: '  Replace the blurry ID photo.  ',
      rejectedDocumentIds: ['doc-1'],
    });
    expect(validateSync(valid)).toHaveLength(0);
    expect(valid.reason).toBe('Replace the blurry ID photo.');

    const tooLong = plainToInstance(ReviewDriverRequestDto, {
      reason: 'a'.repeat(501),
      rejectedDocumentIds: ['doc-1'],
    });
    expect(
      validateSync(tooLong).some((error) => error.property === 'reason'),
    ).toBe(true);
  });

  it('requires at least one unique document selection', () => {
    for (const rejectedDocumentIds of [undefined, [], ['doc-1', 'doc-1']]) {
      const dto = plainToInstance(ReviewDriverRequestDto, {
        reason: 'Replace the blurry file.',
        rejectedDocumentIds,
      });
      expect(
        validateSync(dto).some(
          (error) => error.property === 'rejectedDocumentIds',
        ),
      ).toBe(true);
    }
  });
});
