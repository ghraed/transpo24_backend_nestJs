/** Fixed business minimums. USD/EUR are explicitly set by the platform owner.
 * Gulf-currency floors are rounded up from the USD minimum at their USD pegs.
 * These are pricing rules, not live exchange quotes.
 */
export const MINIMUM_OFFER_AMOUNTS: Readonly<Record<string, number>> =
  Object.freeze({
    CHF: 15,
    USD: 18.32,
    EUR: 18.32,
    AED: 67.29,
    SAR: 68.7,
    QAR: 66.69,
  });
