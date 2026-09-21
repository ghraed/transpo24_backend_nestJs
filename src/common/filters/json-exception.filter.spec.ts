import { ConflictException } from '@nestjs/common';
import { JsonExceptionFilter } from './json-exception.filter';

it('preserves the request conflict code in the HTTP response', () => {
  const response = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  new JsonExceptionFilter().catch(
    new ConflictException({
      code: 'REQUEST_DETAILS_CHANGED',
      message: 'Review updated details.',
    }),
    {
      switchToHttp: () => ({
        getResponse: () => response,
        getRequest: () => ({ url: '/driver/requests/request/offers' }),
      }),
    } as never,
  );
  expect(response.status).toHaveBeenCalledWith(409);
  expect(response.json).toHaveBeenCalledWith(
    expect.objectContaining({
      code: 'REQUEST_DETAILS_CHANGED',
      message: 'Review updated details.',
    }),
  );
});
