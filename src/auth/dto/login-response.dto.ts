export interface LoginResponseDto {
  accessToken: string;
  user: {
    id: string;
    name: string;
    email: string;
    role: 'CUSTOMER' | 'DRIVER';
  };
  driver?: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string;
    countryCode: string | null;
    city: string | null;
    status: string;
    isProfileCompleted: boolean;
  };
  nextStep?: 'COMPLETE_PROFILE' | 'ADD_VEHICLE_DOCUMENTS' | 'UPLOAD_DOCUMENTS';
}
