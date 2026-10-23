import { ConflictException, ForbiddenException } from '@nestjs/common';
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

it('preserves the authoritative chat unlock deadline through the HTTP filter', () => {
  const response = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  const timing = {
    availableAt: '2026-10-23T12:10:00Z',
    serverTime: '2026-10-23T12:08:00Z',
  };
  new JsonExceptionFilter().catch(
    new ForbiddenException({
      code: 'CHAT_PAYMENT_WINDOW',
      message: 'Pending',
      ...timing,
    }),
    {
      switchToHttp: () => ({
        getResponse: () => response,
        getRequest: () => ({ url: '/chat/rooms/by-request/request' }),
      }),
    } as never,
  );
  expect(response.status).toHaveBeenCalledWith(403);
  expect(response.json).toHaveBeenCalledWith(expect.objectContaining(timing));
});
