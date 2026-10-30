import { Transform } from 'class-transformer';
import { IsEmail, IsOptional } from 'class-validator';

export class CreateStripeConnectAccountDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() || undefined : value,
  )
  @IsOptional()
  @IsEmail()
  email?: string;
}
