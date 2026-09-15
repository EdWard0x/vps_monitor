ALTER TABLE user_mail_verifications ADD COLUMN public_id uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE;
-- migrate:split
ALTER TABLE user_mail_verifications ADD COLUMN failed_attempts integer NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0);
-- migrate:split
ALTER TABLE password_reset_requests ADD COLUMN public_id uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE;
-- migrate:split
ALTER TABLE password_reset_requests ADD COLUMN failed_attempts integer NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0);
