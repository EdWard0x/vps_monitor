import React from 'react';
import { LoginForm } from '@/features/auth/LoginForm';

export const LoginPage: React.FC = () => {
  return (
    <div className="min-h-[70vh] flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <LoginForm />
    </div>
  );
};
