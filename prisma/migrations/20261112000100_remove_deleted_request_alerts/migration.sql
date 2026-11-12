-- Alerts cannot open requests that customers have deleted. Remove older
-- alerts left behind before request deletion started cleaning them up.
DELETE FROM "customer_notifications" AS n
USING "transport_requests" AS r
WHERE r.id = COALESCE(
    n.data->>'requestId',
    n.data->>'tripId',
    n.data->>'transportRequestId'
  )
  AND r."customerId" = n."userId"
  AND r."deletedByCustomerAt" IS NOT NULL;
