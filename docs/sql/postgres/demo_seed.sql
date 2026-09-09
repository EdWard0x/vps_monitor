-- PostgreSQL demo data ONLY. Requires 001_init.up.sql on a fresh database.
-- Not a production migration. Requires: psql -v allow_demo_seed=true ...
-- Re-running or targeting occupied tables fails rather than overwriting data.
\set ON_ERROR_STOP on
\if :{?allow_demo_seed}
\else
  DO $$ BEGIN RAISE EXCEPTION 'Missing -v allow_demo_seed=true; no demo data written'; END $$;
\endif
\if :allow_demo_seed
\else
  DO $$ BEGIN RAISE EXCEPTION 'allow_demo_seed must be true; no demo data written'; END $$;
\endif

BEGIN;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM merchant) OR EXISTS (SELECT 1 FROM users)
       OR EXISTS (SELECT 1 FROM vps_detail) OR EXISTS (SELECT 1 FROM comments) THEN
        RAISE EXCEPTION 'Demo seed requires empty business tables; no existing rows are overwritten';
    END IF;
END $$;

-- URL is intentionally the user-provided demo value. No remote site was queried.
INSERT INTO merchant (id,code,name,website_url,enabled,created_at,updated_at) VALUES
    (1,'dmit','DMIT（模拟）','https://dmit.tio',true,'2026-09-06T03:00:00Z',CURRENT_TIMESTAMP);

-- Disabled fixtures only. The marker is deliberately not a usable password hash.
-- The authentication service must reject unsupported hash formats safely.
-- Create a separate real admin via the planned admin CLI; no reusable password is shipped.
INSERT INTO users (id,username,nickname,password_hash,role,enabled,created_at,updated_at) VALUES
    (101,'demo_alice','小陈','!disabled-demo-account!','user',false,'2026-09-06T03:00:00Z',CURRENT_TIMESTAMP),
    (102,'demo_bob','云上旅人','!disabled-demo-account!','user',false,'2026-09-06T03:00:00Z',CURRENT_TIMESTAMP),
    (103,'demo_admin','演示管理员','!disabled-demo-account!','admin',false,'2026-09-06T03:00:00Z',CURRENT_TIMESTAMP);

INSERT INTO vps_detail (id,merchant_id,code,name,description,cpu_cores,memory_mb,disk_gb,disk_type,transfer_gb,port_mbps,price_amount,currency,billing_period,enabled,created_at,updated_at) VALUES
    (1001,1,'demo-lax-mini','DMIT LAX Mini（模拟）','模拟洛杉矶套餐；指标与价格仅供前端开发，不代表实际商品。',1,1024,20,'ssd',1000,1000,9.90,'USD','monthly',true,'2026-09-06T03:10:00Z',CURRENT_TIMESTAMP),
    (1002,1,'demo-hkg-standard','DMIT HKG Standard（模拟）','模拟香港套餐；演示缺货状态。',2,2048,40,'nvme',2000,1000,19.90,'USD','monthly',true,'2026-09-06T03:11:00Z',CURRENT_TIMESTAMP),
    (1003,1,'demo-tyo-pro','DMIT TYO Pro（模拟）','模拟东京套餐；演示不限流量、网口未知及库存无法识别。',4,4096,80,'nvme',0,NULL,29.90,'USD','monthly',true,'2026-09-06T03:12:00Z',CURRENT_TIMESTAMP);

INSERT INTO vps_monitor_configs (vps_id,source_url,collector_code,poll_interval_seconds,timeout_seconds,enabled,next_check_at) VALUES
    (1001,'https://dmit.tio/cart/1','mock',300,15,true,CURRENT_TIMESTAMP),
    (1002,'https://dmit.tio/cart/2','mock',300,15,true,CURRENT_TIMESTAMP),
    (1003,'https://dmit.tio/cart/3','mock',300,15,true,CURRENT_TIMESTAMP);

INSERT INTO vps_stocks (vps_id,status,quantity,last_checked_at,last_in_stock_at,last_error_code) VALUES
    (1001,1,5,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,NULL),
    (1002,2,0,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP - INTERVAL '2 hours',NULL),
    (1003,3,NULL,CURRENT_TIMESTAMP,NULL,'PARSE_UNRECOGNIZED');

-- Insert parents before children. User disablement does not hide historical comments.
INSERT INTO comments (id,vps_id,user_id,user_nickname,content,is_anonymous,visibility,parent_id,root_id,depth,created_at,updated_at) VALUES
    (5001,1001,101,'小陈','这款的价格和配置看起来不错，先关注库存。',false,1,NULL,NULL,0,'2026-09-06T03:50:00Z','2026-09-06T03:50:00Z'),
    (5004,1001,102,'云上旅人','这是一条待审核的模拟评论。',true,2,NULL,NULL,0,'2026-09-06T03:56:00Z','2026-09-06T03:56:00Z'),
    (5005,1001,101,'小陈','这是一条已隐藏的模拟评论。',false,3,NULL,NULL,0,'2026-09-06T03:57:00Z','2026-09-06T03:57:00Z'),
    (5006,1001,102,'云上旅人','',true,4,NULL,NULL,0,'2026-09-06T03:58:00Z','2026-09-06T03:58:00Z'),
    (5010,1002,102,'云上旅人','暂时缺货，等下次检查。',false,1,NULL,NULL,0,'2026-09-06T03:55:00Z','2026-09-06T03:55:00Z');

INSERT INTO comments (id,vps_id,user_id,user_nickname,content,is_anonymous,visibility,parent_id,root_id,depth,created_at,updated_at) VALUES
    (5002,1001,102,'云上旅人','我也在关注这款。',true,1,5001,5001,1,'2026-09-06T03:52:00Z','2026-09-06T03:52:00Z'),
    (5007,1001,101,'小陈','父评论删除后，这条公开回复仍然保留。',false,1,5006,5006,1,'2026-09-06T03:59:00Z','2026-09-06T03:59:00Z');

INSERT INTO comments (id,vps_id,user_id,user_nickname,content,is_anonymous,visibility,parent_id,root_id,depth,created_at,updated_at) VALUES
    (5003,1001,101,'小陈','可以在页面查看最近一次检查时间。',false,1,5002,5001,2,'2026-09-06T03:54:00Z','2026-09-06T03:54:00Z');

-- Explicit seed IDs do not advance identity sequences; synchronize them here.
SELECT setval(pg_get_serial_sequence('merchant','id'),(SELECT MAX(id) FROM merchant),true);
SELECT setval(pg_get_serial_sequence('users','id'),(SELECT MAX(id) FROM users),true);
SELECT setval(pg_get_serial_sequence('vps_detail','id'),(SELECT MAX(id) FROM vps_detail),true);
SELECT setval(pg_get_serial_sequence('comments','id'),(SELECT MAX(id) FROM comments),true);
COMMIT;
