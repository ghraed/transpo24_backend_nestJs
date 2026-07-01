export interface RegisterDriverResponseDto {
  accessToken: string;
  user: {
    id: string;
    email: string;
    role: 'CUSTOMER' | 'DRIVER';
  };
  driver: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string;
    countryCode: string | null;
    countryCodes: string[];
    city: string | null;
    cities: string[];
    status: string;
    isProfileCompleted: boolean;
  };
  nextStep: 'COMPLETE_PROFILE' | 'ADD_VEHICLE_DOCUMENTS';
}
