import {
  ChatMessageSenderRole,
  ChatReportReason,
  ChatReportStatus,
  UserRole,
} from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class AdminChatReportsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @IsEnum(ChatReportStatus)
  status?: ChatReportStatus;

  @IsOptional()
  @IsEnum(ChatReportReason)
  reason?: ChatReportReason;
}

export class UpdateAdminChatReportDto {
  @IsEnum(ChatReportStatus)
  status!: ChatReportStatus;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  resolutionNote?: string;
}

export interface AdminChatReportPartyDto {
  id: string;
  name: string;
  email: string;
  phoneNumber: string | null;
  role: UserRole;
}

export interface AdminChatReportItemDto {
  id: string;
  reason: ChatReportReason;
  details: string | null;
  status: ChatReportStatus;
  resolutionNote: string | null;
  resolvedById: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  transportRequestId: string;
  roomId: string;
  reporter: AdminChatReportPartyDto;
  reportedUser: AdminChatReportPartyDto;
  message: {
    id: string;
    senderRole: ChatMessageSenderRole;
    body: string | null;
    createdAt: string;
  } | null;
}

export interface AdminChatReportsListResponseDto {
  items: AdminChatReportItemDto[];
  total: number;
  pendingCount: number;
  page: number;
  limit: number;
}
