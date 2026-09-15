ALTER TABLE password_reset_requests DROP COLUMN failed_attempts, DROP COLUMN public_id;
-- migrate:split
ALTER TABLE user_mail_verifications DROP COLUMN failed_attempts, DROP COLUMN public_id;
