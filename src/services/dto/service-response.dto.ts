import { ServiceKey } from '@prisma/client';

export class ServiceResponseDto {
  id!: string;
  key!: ServiceKey;
  nameEn!: string;
  nameAr!: string;
  descriptionEn!: string;
  descriptionAr!: string;
  icon!: string;
  isActive!: boolean;
  sortOrder!: number;
}
