ALTER TABLE vps_detail DROP COLUMN collection_enabled;
-- migrate:split
ALTER TABLE merchant DROP COLUMN collection_enabled;
-- migrate:split
ALTER TABLE site_settings DROP COLUMN collection_enabled;
