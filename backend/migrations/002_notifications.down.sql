DROP TABLE notices;

-- migrate:split
ALTER TABLE vps_detail DROP COLUMN has_stock;

-- migrate:split
ALTER TABLE users DROP COLUMN server_turbo_key, DROP COLUMN notice_enabled;
