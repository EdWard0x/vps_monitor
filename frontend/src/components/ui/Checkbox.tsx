import React from 'react';
import { cn } from '@/lib/utils';

export interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  description?: string;
}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, label, description, id, ...props }, ref) => {
    const inputId = id || props.name;

    return (
      <div className="flex items-start">
        <div className="flex items-center h-5">
          <input
            id={inputId}
            ref={ref}
            type="checkbox"
            className={cn(
              'h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500 focus:ring-offset-0 disabled:opacity-50 cursor-pointer',
              className
            )}
            {...props}
          />
        </div>
        {(label || description) && (
          <div className="ml-3 text-sm">
            {label && (
              <label htmlFor={inputId} className="font-medium text-gray-700 select-none cursor-pointer">
                {label}
              </label>
            )}
            {description && <p className="text-gray-500 text-xs mt-0.5">{description}</p>}
          </div>
        )}
      </div>
    );
  }
);

Checkbox.displayName = 'Checkbox';
