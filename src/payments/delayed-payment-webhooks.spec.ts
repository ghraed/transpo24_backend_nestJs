import { PaymentsService } from './payments.service';

function fixture(account = 'acct_driver') {
  const db = {
    paymentHold: {
      update: jest.fn(),
      findUnique: jest.fn().mockResolvedValue({
        requestId: 'trip',
        confirmationStartedAt: new Date(),
        stripeAccountId: 'acct_driver',
      }),
    },
    additionalCharge: { findUnique: jest.fn().mockResolvedValue(null) },
    $transaction: jest.fn(),
  };
  const stripe = {
    constructWebhookEvent: jest.fn().mockReturnValue({
      type: 'payment_intent.succeeded',
      account,
      data: { object: { id: 'pi_booking', status: 'succeeded' } },
    }),
  };
  const bookings = { process: jest.fn() };
  const service = new PaymentsService(
    db as never,
    stripe as never,
    {} as never,
    undefined,
    bookings as never,
  );
  return { db, stripe, bookings, service };
}

it('reconciles delayed payment webhooks through the account-scoped booking state machine', async () => {
  const x = fixture();
  await x.service.handleStripeWebhook(Buffer.from('{}'), 'sig', true);
  await x.service.handleStripeWebhook(Buffer.from('{}'), 'sig', true);
  expect(x.bookings.process).toHaveBeenCalledTimes(2);
  expect(x.bookings.process).toHaveBeenCalledWith('trip');
  expect(x.db.paymentHold.update).not.toHaveBeenCalled();
});

it('ignores a signed delayed payment event from a different connected account', async () => {
  const x = fixture('acct_other');
  await x.service.handleStripeWebhook(Buffer.from('{}'), 'sig', true);
  expect(x.bookings.process).not.toHaveBeenCalled();
});

it('retries failed reconciliation instead of acknowledging a lost update', async () => {
  const x = fixture();
  x.bookings.process.mockRejectedValueOnce(new Error('database unavailable'));
  await expect(
    x.service.handleStripeWebhook(Buffer.from('{}'), 'sig', true),
  ).rejects.toThrow('database unavailable');
});
