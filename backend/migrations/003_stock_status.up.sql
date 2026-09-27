ALTER TABLE vps_stocks DROP CONSTRAINT ck_stock_status,
    ADD CONSTRAINT ck_stock_status CHECK (status IN (1, 2, 3, 4));
