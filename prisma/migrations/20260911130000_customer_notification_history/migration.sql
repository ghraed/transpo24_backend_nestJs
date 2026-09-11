CREATE TABLE "customer_notifications" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "type" TEXT NOT NULL, "title" TEXT NOT NULL, "body" TEXT NOT NULL,
 "data" JSONB NOT NULL, "eventKey" TEXT, "readAt" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "customer_notifications_userId_eventKey_key" ON "customer_notifications"("userId", "eventKey");
CREATE INDEX "customer_notifications_userId_createdAt_id_idx" ON "customer_notifications"("userId", "createdAt", "id");
CREATE INDEX "customer_notifications_userId_readAt_idx" ON "customer_notifications"("userId", "readAt");

-- Recover only milestones with recorded timestamps; do not invent past events.
INSERT INTO "customer_notifications" ("id", "userId", "type", "title", "body", "data", "eventKey", "createdAt")
SELECT 'history_' || md5(r.id || e.type), r."customerId", e.type, e.title, e.body,
 jsonb_build_object('requestId', r.id, 'tripId', r.id), e.type || ':' || r.id, e.at
FROM "transport_requests" r
CROSS JOIN LATERAL (VALUES
 ('DRIVER_GOING_TO_PICKUP', 'Driver confirmed', 'Your driver is assigned and heading to pickup.', r."acceptedAt"),
 ('DRIVER_ARRIVED_PICKUP', 'Driver reached pickup', 'Your driver confirmed arrival at the pickup location.', r."driverArrivedPickupAt"),
 ('ITEM_PICKED_UP', 'Pickup confirmed', 'Your driver confirmed that your items were picked up.', r."itemPickedUpAt"),
 ('DRIVER_GOING_TO_DROPOFF', 'Driver heading to dropoff', 'Pickup is complete. Your driver is on the way to the delivery location.', r."driverGoingToDropoffAt"),
 ('DRIVER_NEAR_DELIVERY', 'Driver near dropoff', 'Your driver is near the delivery location. Please prepare to receive your items.', r."nearDeliveryNotifiedAt"),
 ('ITEM_DELIVERED', 'Delivery reported by driver', 'Your driver marked the service as delivered. Review the delivery details.', r."deliveredAt"),
 ('CUSTOMER_DELIVERY_CONFIRMED', 'Delivery confirmed by you', 'You confirmed successful delivery and authorized release of the driver payment.', r."deliveryConfirmedByCustomerAt")
) AS e(type, title, body, at)
WHERE e.at IS NOT NULL;

INSERT INTO "customer_notifications" ("id", "userId", "type", "title", "body", "data", "eventKey", "createdAt")
SELECT 'offer_' || o.id, r."customerId", 'NEW_DRIVER_OFFER', 'New driver offer', 'A driver sent you an offer.',
 jsonb_build_object('requestId', r.id, 'offerId', o.id), 'NEW_DRIVER_OFFER:' || o.id, o."createdAt"
FROM "driver_offers" o JOIN "transport_requests" r ON r.id = o."requestId";
