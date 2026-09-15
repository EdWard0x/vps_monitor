import React from 'react';
import { PasswordResetForm } from '@/features/auth/PasswordResetForm';

export const PasswordResetPage: React.FC = () => {
  return (
    <div className="min-h-[70vh] flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <PasswordResetForm />
    </div>
  );
};
