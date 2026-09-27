ALTER TABLE users
    ADD COLUMN notice_enabled boolean NOT NULL DEFAULT false,
    ADD COLUMN server_turbo_key varchar(64) NOT NULL DEFAULT '';

-- migrate:split
ALTER TABLE vps_detail ADD COLUMN has_stock boolean NOT NULL DEFAULT false;

-- migrate:split
CREATE TABLE notices (
    id bigserial PRIMARY KEY,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    user_id bigint NOT NULL,
    vps_id bigint NOT NULL,
    merchant_id bigint NOT NULL,
    send_notice_times bigint NOT NULL DEFAULT 0,
    send_at timestamptz,
    CONSTRAINT fk_notices_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_notices_vps FOREIGN KEY (vps_id) REFERENCES vps_detail(id) ON DELETE RESTRICT,
    CONSTRAINT fk_notices_merchant FOREIGN KEY (merchant_id) REFERENCES merchant(id) ON DELETE RESTRICT,
    CONSTRAINT uniq_notice_user_vps UNIQUE (user_id, vps_id),
    CONSTRAINT ck_notices_send_times CHECK (send_notice_times >= 0)
);

-- migrate:split
CREATE INDEX idx_notices_deleted_at ON notices (deleted_at);

-- migrate:split
CREATE INDEX idx_notices_vps_id ON notices (vps_id);

-- migrate:split
CREATE INDEX idx_notices_merchant_id ON notices (merchant_id);
