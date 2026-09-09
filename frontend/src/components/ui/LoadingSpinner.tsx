import React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export const LoadingSpinner: React.FC<{ className?: string; label?: string }> = ({
  className,
  label = '加载中...',
}) => {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-gray-500">
      <Loader2 className={cn('w-8 h-8 animate-spin text-brand-600 mb-2', className)} />
      <span className="text-xs text-gray-400">{label}</span>
    </div>
  );
};
