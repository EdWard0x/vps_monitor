-- DESTRUCTIVE: drops all application tables and their data.
-- Only for a disposable, dedicated development database.
-- This file owns its transaction. It intentionally does not use CASCADE.
BEGIN;
DROP TABLE site_settings;
DROP TABLE comments;
DROP TABLE vps_stocks;
DROP TABLE vps_monitor_configs;
DROP TABLE user_sessions;
DROP TABLE vps_detail;
DROP TABLE users;
DROP TABLE merchant;
DROP TABLE schema_migrations;
COMMIT;
