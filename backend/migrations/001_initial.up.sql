CREATE TABLE users (
    id bigserial PRIMARY KEY,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    username varchar(64) NOT NULL UNIQUE,
    nickname varchar(64) NOT NULL,
    password_hash text NOT NULL,
    role varchar(16) NOT NULL DEFAULT 'user',
    mail varchar(320) UNIQUE,
    mail_verified boolean NOT NULL DEFAULT false,
    mail_verified_at timestamptz,
    token_version bigint NOT NULL DEFAULT 1,
    CONSTRAINT ck_users_role CHECK (role IN ('user', 'admin')),
    CONSTRAINT ck_users_token_version CHECK (token_version > 0),
    CONSTRAINT ck_users_mail_verified CHECK (
        (mail_verified = false AND mail_verified_at IS NULL)
        OR (mail_verified = true AND mail IS NOT NULL AND mail_verified_at IS NOT NULL)
    )
);

-- migrate:split
CREATE INDEX idx_users_deleted_at ON users (deleted_at);

-- migrate:split
CREATE TABLE fronze (
    id bigserial PRIMARY KEY,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    user_id bigint NOT NULL UNIQUE,
    CONSTRAINT fk_fronze_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
);

-- migrate:split
CREATE INDEX idx_fronze_deleted_at ON fronze (deleted_at);

-- migrate:split
CREATE INDEX idx_fronze_active_user ON fronze (user_id) WHERE deleted_at IS NULL;

-- migrate:split
CREATE TABLE merchant (
    id bigserial PRIMARY KEY,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    code varchar(64) NOT NULL UNIQUE,
    name varchar(128) NOT NULL,
    website_url text NOT NULL,
    enabled boolean NOT NULL DEFAULT true
);

-- migrate:split
CREATE INDEX idx_merchant_deleted_at ON merchant (deleted_at);

-- migrate:split
CREATE INDEX idx_merchant_public ON merchant (enabled, updated_at DESC, id DESC) WHERE deleted_at IS NULL;

-- migrate:split
CREATE TABLE vps_detail (
    id bigserial PRIMARY KEY,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    merchant_id bigint NOT NULL,
    code varchar(64) NOT NULL,
    name varchar(128) NOT NULL,
    description text NOT NULL DEFAULT '',
    cpu_cores integer NOT NULL,
    memory_mb integer NOT NULL,
    disk_gb integer NOT NULL,
    disk_type varchar(32) NOT NULL,
    transfer_gb integer,
    port_mbps integer,
    has_ipv4 boolean NOT NULL DEFAULT false,
    ipv4_count integer NOT NULL DEFAULT 0,
    has_ipv6 boolean NOT NULL DEFAULT false,
    ipv6_count integer NOT NULL DEFAULT 0,
    price_amount numeric(20,8) NOT NULL,
    currency varchar(3) NOT NULL,
    billing_period varchar(32) NOT NULL,
    purchase_url text NOT NULL,
    enabled boolean NOT NULL DEFAULT true,
    CONSTRAINT fk_vps_merchant FOREIGN KEY (merchant_id) REFERENCES merchant(id) ON DELETE RESTRICT,
    CONSTRAINT uq_vps_merchant_code UNIQUE (merchant_id, code),
    CONSTRAINT ck_vps_cpu CHECK (cpu_cores > 0),
    CONSTRAINT ck_vps_memory CHECK (memory_mb > 0),
    CONSTRAINT ck_vps_disk CHECK (disk_gb >= 0),
    CONSTRAINT ck_vps_transfer CHECK (transfer_gb IS NULL OR transfer_gb >= 0),
    CONSTRAINT ck_vps_port CHECK (port_mbps IS NULL OR port_mbps >= 0),
    CONSTRAINT ck_vps_ip_counts CHECK (ipv4_count >= 0 AND ipv6_count >= 0),
    CONSTRAINT ck_vps_price CHECK (price_amount >= 0),
    CONSTRAINT ck_vps_currency CHECK (currency ~ '^[A-Z]{3}$')
);

-- migrate:split
CREATE INDEX idx_vps_deleted_at ON vps_detail (deleted_at);

-- migrate:split
CREATE INDEX idx_vps_merchant ON vps_detail (merchant_id, enabled, updated_at DESC, id DESC) WHERE deleted_at IS NULL;

-- migrate:split
CREATE TABLE vps_stocks (
    id bigserial PRIMARY KEY,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    vps_id bigint NOT NULL UNIQUE,
    status smallint NOT NULL DEFAULT 3,
    quantity integer,
    last_checked_at timestamptz,
    last_in_stock_at timestamptz,
    observation_version bigint NOT NULL DEFAULT 0,
    CONSTRAINT fk_stock_vps FOREIGN KEY (vps_id) REFERENCES vps_detail(id) ON DELETE RESTRICT,
    CONSTRAINT ck_stock_status CHECK (status IN (1, 2, 3)),
    CONSTRAINT ck_stock_quantity CHECK (quantity IS NULL OR quantity >= 0),
    CONSTRAINT ck_stock_observation_version CHECK (observation_version >= 0)
);

-- migrate:split
CREATE INDEX idx_stock_deleted_at ON vps_stocks (deleted_at);

-- migrate:split
CREATE INDEX idx_stock_status ON vps_stocks (status, updated_at DESC) WHERE deleted_at IS NULL;

-- migrate:split
CREATE TABLE site_settings (
    id bigserial PRIMARY KEY,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    site_name varchar(128) NOT NULL,
    registration_enabled boolean NOT NULL DEFAULT false
);

-- migrate:split
CREATE UNIQUE INDEX uq_site_settings_singleton ON site_settings ((true)) WHERE deleted_at IS NULL;

-- migrate:split
CREATE TABLE user_mail_verifications (
    id bigserial PRIMARY KEY,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    user_id bigint NOT NULL,
    mail varchar(320) NOT NULL,
    code_hash text NOT NULL,
    expires_at timestamptz NOT NULL,
    consumed_at timestamptz,
    CONSTRAINT fk_mail_verification_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT ck_mail_verification_expiry CHECK (expires_at > created_at)
);

-- migrate:split
CREATE INDEX idx_mail_verification_user ON user_mail_verifications (user_id, created_at DESC) WHERE deleted_at IS NULL;

-- migrate:split
CREATE INDEX idx_mail_verification_expiry ON user_mail_verifications (expires_at) WHERE consumed_at IS NULL AND deleted_at IS NULL;

-- migrate:split
CREATE TABLE password_reset_requests (
    id bigserial PRIMARY KEY,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    user_id bigint NOT NULL,
    code_hash text NOT NULL,
    expires_at timestamptz NOT NULL,
    consumed_at timestamptz,
    CONSTRAINT fk_password_reset_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT ck_password_reset_expiry CHECK (expires_at > created_at)
);

-- migrate:split
CREATE INDEX idx_password_reset_user ON password_reset_requests (user_id, created_at DESC) WHERE deleted_at IS NULL;

-- migrate:split
CREATE INDEX idx_password_reset_expiry ON password_reset_requests (expires_at) WHERE consumed_at IS NULL AND deleted_at IS NULL;

-- migrate:split
INSERT INTO site_settings (site_name, registration_enabled)
VALUES ('VPS Monitor', false);
