import { ChatReportReason } from '@prisma/client';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateChatReportDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  messageId?: string;

  @IsEnum(ChatReportReason)
  reason!: ChatReportReason;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  details?: string;
}
