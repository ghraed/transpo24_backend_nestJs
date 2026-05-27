import { IsString, IsNotEmpty } from 'class-validator';

export class JoinTripRoomDto {
  @IsString()
  @IsNotEmpty()
  tripId!: string;
}
