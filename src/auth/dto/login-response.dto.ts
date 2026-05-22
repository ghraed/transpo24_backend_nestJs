export interface LoginResponseDto {
  accessToken: string;
  user: {
    id: string;
    name: string;
    email: string;
  };
}
