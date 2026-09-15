ALTER TABLE site_settings ADD COLUMN collection_enabled boolean NOT NULL DEFAULT false;
-- migrate:split
ALTER TABLE merchant ADD COLUMN collection_enabled boolean NOT NULL DEFAULT false;
-- migrate:split
ALTER TABLE vps_detail ADD COLUMN collection_enabled boolean NOT NULL DEFAULT false;
