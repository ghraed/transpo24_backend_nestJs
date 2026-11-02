# Driver offer minimums

Minimum offers are fixed platform pricing rules, independent of Stripe fees and
live foreign exchange rates. The owner selected fixed USD/EUR floors.

| Currency | Minimum service offer |
| --- | ---: |
| CHF | 15.00 |
| USD | 18.32 |
| EUR | 18.32 |
| AED | 67.29 |
| SAR | 68.70 |
| QAR | 66.69 |

The Gulf-currency floors are rounded up from USD 18.32 at their USD pegs.
The minimum applies to the original service offer, before the client's 5% fee.
For example, CHF 15 yields CHF 15.75 charged to the client, CHF 12.75 driver
net after the 15% commission, and CHF 3.00 gross platform revenue. Processing
costs are covered by the platform under the platform-paid Stripe account policy.

The driver app shows the minimum beside the price input. A finite price below
the minimum, including zero or a negative number, is raised on blur or Submit.
The popup states the minimum and that the price was adjusted. The driver must
acknowledge it, review the price and tap Submit to send the offer. Empty and
nonnumeric entries retain their normal validation. Valid prices stay unchanged.

The backend derives currency from the saved driver country and rejects lower
prices with `MINIMUM_OFFER_PRICE`, including the minimum and currency in the
response. It never silently sends a more expensive offer on an old client's
behalf. Both `/driver` and `/drive` aliases use the same validation.

Keep `src/driver/offer-minimum.ts` and the driver app's
`src/lib/offer-minimum.ts` aligned when changing pricing. Backend regression tests
cover each currency's boundary and attempts to override currency. Driver screen
tests cover correction on blur and Submit, popup acknowledgement, unchanged
valid values, and input validation. Deploy backend before the driver update.
