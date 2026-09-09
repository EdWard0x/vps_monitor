// 金额与周期格式化工具：严格保留定点字符串，不进行浮点累加或转换
import { BillingPeriod } from '@/types/api';

export const BILLING_PERIOD_LABELS: Record<BillingPeriod, string> = {
  monthly: '月',
  quarterly: '季',
  yearly: '年',
  one_time: '一次性',
};

export function formatPrice(
  amount: string | null | undefined,
  currency: string = 'USD',
  period?: BillingPeriod
): string {
  if (!amount) return '—';
  const periodText = period && BILLING_PERIOD_LABELS[period] ? ` / ${BILLING_PERIOD_LABELS[period]}` : '';
  return `${currency.toUpperCase()} ${amount}${periodText}`;
}
