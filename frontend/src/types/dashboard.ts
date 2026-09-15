// 管理看板统计类型契约

export interface DashboardSummary {
  user_count: number;
  frozen_user_count: number;
  merchant_count: number;
  vps_count: number;
  in_stock_count: number;
  unknown_stock_count: number;
}

export type Dashboard = DashboardSummary;
