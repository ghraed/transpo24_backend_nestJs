export interface AdminUserResponseDto {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN';
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}
