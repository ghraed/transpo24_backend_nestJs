import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';

import type { AuthenticatedRequest } from '../auth/auth.types';
import { AuthenticatedUserGuard } from '../auth/guards/authenticated-user.guard';
import { TripsGateway } from '../trips/trips.gateway';
import { ChatService } from './chat.service';
import { ChatRoomMessagesQueryDto } from './dto/chat-room-messages-query.dto';
import { SendChatMessageDto } from './dto/send-chat-message.dto';
import type {
  ChatMessageReadResponseDto,
  ChatMessageResponseDto,
  ChatRoomMessagesResponseDto,
  ChatRoomSummaryDto,
} from './chat.types';

@Controller('chat')
@UseGuards(AuthenticatedUserGuard)
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly tripsGateway: TripsGateway,
  ) {}

  @Get('rooms')
  async listRooms(
    @Req() request: AuthenticatedRequest,
  ): Promise<ChatRoomSummaryDto[]> {
    return this.chatService.listRooms(request.user);
  }

  @Get('rooms/by-request/:transportRequestId')
  async getRoomByRequest(
    @Req() request: AuthenticatedRequest,
    @Param('transportRequestId') transportRequestId: string,
  ): Promise<ChatRoomSummaryDto> {
    return this.chatService.getRoomByTransportRequest(
      request.user,
      transportRequestId,
    );
  }

  @Get('rooms/:roomId/messages')
  async getRoomMessages(
    @Req() request: AuthenticatedRequest,
    @Param('roomId') roomId: string,
    @Query() query: ChatRoomMessagesQueryDto,
  ): Promise<ChatRoomMessagesResponseDto> {
    return this.chatService.getRoomMessages({
      user: request.user,
      roomId,
      page: query.page ?? 1,
      limit: query.limit ?? 20,
    });
  }

  @Post('rooms/:roomId/messages')
  async sendMessage(
    @Req() request: AuthenticatedRequest,
    @Param('roomId') roomId: string,
    @Body() dto: SendChatMessageDto,
  ): Promise<ChatMessageResponseDto> {
    const created = await this.chatService.sendTextMessage({
      user: request.user,
      roomId,
      body: dto.body,
    });

    this.tripsGateway.emitChatMessageCreated(created);
    return created;
  }

  @Patch('rooms/:roomId/read')
  async markRoomRead(
    @Req() request: AuthenticatedRequest,
    @Param('roomId') roomId: string,
  ): Promise<ChatMessageReadResponseDto> {
    const result = await this.chatService.markRoomAsRead({
      user: request.user,
      roomId,
    });

    this.tripsGateway.emitChatMessageRead(result);
    return result;
  }
}
