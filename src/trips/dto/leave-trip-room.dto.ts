import { IsString, IsNotEmpty } from 'class-validator';

export class LeaveTripRoomDto {
  @IsString()
  @IsNotEmpty()
  tripId!: string;
}
