-- 旧版支持 status=1、quantity=NULL，回滚时保留已确认有货的含义。
UPDATE vps_stocks SET status = 1 WHERE status = 4;

-- migrate:split
ALTER TABLE vps_stocks DROP CONSTRAINT ck_stock_status,
    ADD CONSTRAINT ck_stock_status CHECK (status IN (1, 2, 3));
