import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Server, Socket } from 'socket.io';

import { AuthService } from '../auth/auth.service';
import { DriverArrivedPickupDto } from './dto/driver-arrived-pickup.dto';
import { DriverLocationUpdateDto } from './dto/driver-location-update.dto';
import { JoinTripRoomDto } from './dto/join-trip-room.dto';
import { LeaveTripRoomDto } from './dto/leave-trip-room.dto';
import { TripsService } from './trips.service';
import {
  AdditionalChargeAddedPayload,
  DriverNearDeliveryPayload,
  DriverStartedDeliveryPayload,
  ItemDeliveredPayload,
  ItemPickedUpPayload,
  OfferAcceptedPayload,
  OfferNewPayload,
  OfferRejectedPayload,
  PaymentCancelledPayload,
  PaymentCapturedPayload,
  PaymentHeldPayload,
  RequestDeletedPayload,
  RequestDriverSelectedPayload,
  RequestNewPayload,
  TripStatusUpdatedPayload,
} from './trips.types';

type SocketUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
};

type SocketDebugPingPayload = {
  timestamp?: string;
  tripId?: string;
  note?: string;
};

type SocketDebugPongPayload = {
  ok: true;
  serverTime: string;
  socketId: string;
  userId: string;
  role: UserRole;
  tripId: string | null;
  note: string | null;
};

@WebSocketGateway({ cors: { origin: true, credentials: true } })
export class TripsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(TripsGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly authService: AuthService,
    private readonly tripsService: TripsService,
  ) {}

  handleConnection(client: Socket): void {
    const token = this.getSocketToken(client);

    if (!token) {
      this.logger.warn(
        `Socket connection rejected: missing token (socketId=${client.id})`,
      );
      client.disconnect();
      return;
    }

    const user = this.authService.getUserFromAccessToken(token);

    if (!user) {
      this.logger.warn(
        `Socket connection rejected: invalid token (socketId=${client.id})`,
      );
      client.disconnect();
      return;
    }

    client.data.user = user;
    this.logger.log(
      `Socket connected: socketId=${client.id}, userId=${user.id}, role=${user.role}`,
    );
    void client.join(this.getUserRoom(user));
  }

  handleDisconnect(client: Socket): void {
    this.logger.log(`Socket disconnected: socketId=${client.id}`);
  }

  @SubscribeMessage('joinTripRoom')
  async joinTripRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: JoinTripRoomDto,
  ): Promise<{ tripId: string; room: string }> {
    try {
      const user = this.getAuthenticatedSocketUser(client);
      await this.tripsService.joinTripRoom({
        userId: user.id,
        role: user.role,
        tripId: payload.tripId,
      });
      const room = this.getTripRoom(payload.tripId);
      await client.join(room);
      return { tripId: payload.tripId, room };
    } catch (error) {
      throw this.toWsException(error);
    }
  }

  @SubscribeMessage('leaveTripRoom')
  async leaveTripRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: LeaveTripRoomDto,
  ): Promise<{ tripId: string; room: string }> {
    try {
      const room = this.getTripRoom(payload.tripId);
      await client.leave(room);
      return { tripId: payload.tripId, room };
    } catch (error) {
      throw this.toWsException(error);
    }
  }

  @SubscribeMessage('driverLocationUpdate')
  async driverLocationUpdate(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: DriverLocationUpdateDto,
  ): Promise<void> {
    try {
      const user = this.getAuthenticatedSocketUser(client);
      if (user.role !== UserRole.DRIVER) {
        throw new WsException('Driver access is required.');
      }

      const updated = await this.tripsService.updateDriverLocation({
        driverId: user.id,
        tripId: payload.tripId,
        latitude: payload.latitude,
        longitude: payload.longitude,
        heading: payload.heading,
        speed: payload.speed,
        accuracy: payload.accuracy,
      });

      this.server
        .to(this.getTripRoom(payload.tripId))
        .emit('driverLocationUpdated', updated.location);
      if (updated.nearDelivery) {
        this.server
          .to(this.getTripRoom(payload.tripId))
          .emit('driverNearDelivery', updated.nearDelivery);
      }
    } catch (error) {
      throw this.toWsException(error);
    }
  }

  @SubscribeMessage('driverArrivedPickup')
  async driverArrivedPickup(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: DriverArrivedPickupDto,
  ): Promise<void> {
    try {
      const user = this.getAuthenticatedSocketUser(client);
      if (user.role !== UserRole.DRIVER) {
        throw new WsException('Driver access is required.');
      }

      const result = await this.tripsService.markDriverArrivedAtPickup({
        driverId: user.id,
        tripId: payload.tripId,
        latitude: payload.latitude,
        longitude: payload.longitude,
      });

      this.server
        .to(this.getTripRoom(payload.tripId))
        .emit('driverArrivedPickupConfirmed', result.arrival);
      this.server
        .to(this.getTripRoom(payload.tripId))
        .emit('tripStatusUpdated', result.status);
    } catch (error) {
      throw this.toWsException(error);
    }
  }

  @SubscribeMessage('socketDebugPing')
  async socketDebugPing(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: SocketDebugPingPayload,
  ): Promise<SocketDebugPongPayload> {
    try {
      const user = this.getAuthenticatedSocketUser(client);
      const tripId =
        typeof payload?.tripId === 'string' ? payload.tripId.trim() : '';
      const note = typeof payload?.note === 'string' ? payload.note.trim() : '';

      const response: SocketDebugPongPayload = {
        ok: true,
        serverTime: new Date().toISOString(),
        socketId: client.id,
        userId: user.id,
        role: user.role,
        tripId: tripId || null,
        note: note || null,
      };

      client.emit('socketDebugPong', response);
      return response;
    } catch (error) {
      throw this.toWsException(error);
    }
  }

  emitRequestNew(driverId: string, payload: RequestNewPayload): void {
    this.server.to(this.getDriverRoom(driverId)).emit('requestNew', payload);
  }

  emitRequestDeleted(driverId: string, payload: RequestDeletedPayload): void {
    this.server
      .to(this.getDriverRoom(driverId))
      .emit('requestDeleted', payload);
  }

  emitOfferNew(customerId: string, payload: OfferNewPayload): void {
    this.server.to(this.getCustomerRoom(customerId)).emit('offerNew', payload);
  }

  emitRequestDriverSelected(
    customerId: string,
    payload: RequestDriverSelectedPayload,
  ): void {
    this.server
      .to(this.getCustomerRoom(customerId))
      .emit('requestDriverSelected', payload);
  }

  emitOfferRejected(payload: OfferRejectedPayload): void {
    this.server
      .to(this.getDriverRoom(payload.driverId))
      .emit('offerRejected', payload);
  }

  emitPaymentHeld(customerId: string, payload: PaymentHeldPayload): void {
    this.server
      .to(this.getCustomerRoom(customerId))
      .emit('paymentHeld', payload);
    this.server
      .to(this.getTripRoom(payload.requestId))
      .emit('paymentHeld', payload);
  }

  emitPaymentCaptured(
    customerId: string,
    payload: PaymentCapturedPayload,
  ): void {
    this.server
      .to(this.getCustomerRoom(customerId))
      .emit('paymentCaptured', payload);
    this.server
      .to(this.getTripRoom(payload.requestId))
      .emit('paymentCaptured', payload);
  }

  emitPaymentCancelled(
    customerId: string,
    payload: PaymentCancelledPayload,
  ): void {
    this.server
      .to(this.getCustomerRoom(customerId))
      .emit('paymentCancelled', payload);
    this.server
      .to(this.getTripRoom(payload.requestId))
      .emit('paymentCancelled', payload);
  }

  emitAdditionalChargeAdded(
    customerId: string,
    payload: AdditionalChargeAddedPayload,
  ): void {
    this.server
      .to(this.getCustomerRoom(customerId))
      .emit('additionalChargeAdded', payload);
    this.server
      .to(this.getTripRoom(payload.requestId))
      .emit('additionalChargeAdded', payload);
  }

  getDriverConnectionCount(driverId: string): number {
    const room = this.server.sockets.adapter.rooms.get(
      this.getDriverRoom(driverId),
    );
    return room?.size ?? 0;
  }

  emitOfferAccepted(
    payload: OfferAcceptedPayload,
    tripStatus: TripStatusUpdatedPayload,
  ): void {
    this.server
      .to(this.getDriverRoom(payload.driverId))
      .emit('offerAccepted', payload);
    this.server
      .to(this.getTripRoom(payload.tripId))
      .emit('tripStatusUpdated', tripStatus);
  }

  emitItemPickedUp(
    payload: ItemPickedUpPayload,
    tripStatus: TripStatusUpdatedPayload,
  ): void {
    this.server
      .to(this.getTripRoom(payload.tripId))
      .emit('itemPickedUp', payload);
    this.server
      .to(this.getTripRoom(payload.tripId))
      .emit('tripStatusUpdated', tripStatus);
  }

  emitDriverStartedDelivery(
    payload: DriverStartedDeliveryPayload,
    tripStatus: TripStatusUpdatedPayload,
  ): void {
    this.server
      .to(this.getTripRoom(payload.tripId))
      .emit('driverStartedDelivery', payload);
    this.server
      .to(this.getTripRoom(payload.tripId))
      .emit('tripStatusUpdated', tripStatus);
  }

  emitItemDelivered(
    payload: ItemDeliveredPayload,
    tripStatus: TripStatusUpdatedPayload,
  ): void {
    this.server
      .to(this.getTripRoom(payload.tripId))
      .emit('itemDelivered', payload);
    this.server
      .to(this.getTripRoom(payload.tripId))
      .emit('tripStatusUpdated', tripStatus);
  }

  emitDriverNearDelivery(payload: DriverNearDeliveryPayload): void {
    this.server
      .to(this.getTripRoom(payload.tripId))
      .emit('driverNearDelivery', payload);
  }
  private getAuthenticatedSocketUser(client: Socket): SocketUser {
    const user = client.data.user as SocketUser | undefined;

    if (!user) {
      throw new WsException('Unauthorized socket connection.');
    }

    return user;
  }

  private getSocketToken(client: Socket): string | null {
    const authToken = client.handshake.auth?.token;
    if (typeof authToken === 'string' && authToken.trim()) {
      return authToken.trim();
    }

    const rawAuthorization = client.handshake.headers.authorization;
    if (
      typeof rawAuthorization === 'string' &&
      rawAuthorization.startsWith('Bearer ')
    ) {
      return rawAuthorization.slice('Bearer '.length).trim();
    }

    return null;
  }

  private getTripRoom(tripId: string): string {
    return `trip_${tripId}`;
  }

  private getDriverRoom(driverId: string): string {
    return `driver_${driverId}`;
  }

  private getCustomerRoom(customerId: string): string {
    return `customer_${customerId}`;
  }

  private getUserRoom(user: SocketUser): string {
    if (user.role === UserRole.CUSTOMER) {
      return this.getCustomerRoom(user.id);
    }

    return this.getDriverRoom(user.id);
  }

  private toWsException(error: unknown): WsException {
    if (error instanceof WsException) {
      return error;
    }

    if (error instanceof Error) {
      return new WsException(error.message);
    }

    return new WsException('Socket operation failed.');
  }
}
