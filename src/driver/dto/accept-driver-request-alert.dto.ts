import { IsBoolean, IsOptional } from 'class-validator';

export class AcceptDriverRequestAlertDto {
  @IsOptional()
  @IsBoolean()
  acknowledgeOutsideWorkingHours?: boolean;
}
