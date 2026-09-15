// 站点设置类型契约
import { Timestamp } from './common';

export interface PublicSettings {
  site_name: string;
  registration_enabled: boolean;
}

export type Settings = PublicSettings;
export type SettingsPublic = PublicSettings;

export interface AdminSettings {
  settings: PublicSettings;
  collection_enabled: boolean;
  collector_implemented: boolean;
  updated_at: Timestamp;
}

export type SettingsAdmin = AdminSettings;

export interface AdminSettingsUpdateInput {
  site_name?: string;
  registration_enabled?: boolean;
  collection_enabled?: boolean;
}
