import React from 'react';
import { RegisterForm } from '@/features/auth/RegisterForm';

export const RegisterPage: React.FC = () => {
  return (
    <div className="min-h-[70vh] flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <RegisterForm />
    </div>
  );
};
