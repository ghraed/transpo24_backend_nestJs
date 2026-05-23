export interface RegisterResponseDto {
  message: string;
  user: {
    id: string;
    name: string;
    email: string;
    role: 'CUSTOMER' | 'DRIVER';
  };
}
