import { Prisma } from '@prisma/client';

const CUSTOMER_PLATFORM_COMMISSION_RATE = new Prisma.Decimal('0.05');

/** The offer is the driver's service price, before the client's commission. */
export function calculateCustomerPricing(serviceAmount: Prisma.Decimal) {
  const normalizedServiceAmount = serviceAmount.toDecimalPlaces(2);
  const customerPlatformFeeAmount = normalizedServiceAmount
    .mul(CUSTOMER_PLATFORM_COMMISSION_RATE)
    .toDecimalPlaces(2);
  return {
    customerPlatformFeeAmount,
    totalAmount: normalizedServiceAmount.add(customerPlatformFeeAmount),
  };
}

export type CustomerPaymentPrice = {
  amount: Prisma.Decimal;
  customerPlatformFeeAmount: Prisma.Decimal;
};

/** Customer-facing prices include commission. Paid bookings use their snapshot. */
export function customerOfferPrice(
  serviceAmount: Prisma.Decimal,
  payment?: CustomerPaymentPrice | null,
) {
  const pricing = payment
    ? {
        totalAmount: payment.amount,
        customerPlatformFeeAmount: payment.customerPlatformFeeAmount,
      }
    : calculateCustomerPricing(serviceAmount);
  return {
    price: Number(pricing.totalAmount),
    customerPlatformFeeAmount: Number(pricing.customerPlatformFeeAmount),
  };
}
