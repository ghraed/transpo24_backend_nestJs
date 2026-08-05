export interface PhoneAuthResponseDto {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    name: string;
    email: string;
    phoneNumber: string;
    role: 'CUSTOMER';
  };
  isNewUser: boolean;
  profileCompleted: boolean;
}
