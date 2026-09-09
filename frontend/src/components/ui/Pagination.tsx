import React from 'react';
import { Button } from './Button';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (newPage: number) => void;
  disabled?: boolean;
}

export const Pagination: React.FC<PaginationProps> = ({
  page,
  pageSize,
  total,
  onPageChange,
  disabled = false,
}) => {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  if (totalPages <= 1) {
    return (
      <div className="text-xs text-gray-500 py-2 text-right">
        共 {total} 项
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between py-3 px-2 border-t border-gray-100 flex-wrap gap-2">
      <div className="text-xs text-gray-500">
        共 <span className="font-semibold text-gray-700">{total}</span> 项，第{' '}
        <span className="font-semibold text-gray-700">{page}</span> / {totalPages} 页
      </div>
      <div className="flex items-center space-x-1">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1 || disabled}
          onClick={() => onPageChange(page - 1)}
          aria-label="上一页"
        >
          <ChevronLeft className="w-4 h-4 mr-1" />
          上一页
        </Button>
        <div className="hidden sm:flex items-center space-x-1 px-2 text-sm text-gray-700">
          <span>{page}</span>
          <span className="text-gray-400">/</span>
          <span>{totalPages}</span>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= totalPages || disabled}
          onClick={() => onPageChange(page + 1)}
          aria-label="下一页"
        >
          下一页
          <ChevronRight className="w-4 h-4 ml-1" />
        </Button>
      </div>
    </div>
  );
};
