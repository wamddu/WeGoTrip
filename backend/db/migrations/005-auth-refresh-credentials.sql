-- Separate from push devices. No user_device columns change.
-- Persist only digests of random 256-bit refresh secrets, never the raw credential.
CREATE TABLE auth_refresh_credential (
    digest VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    token_version BIGINT NOT NULL,
    authenticated_at DATETIME(6) NOT NULL,
    expires_at DATETIME(6) NOT NULL,
    consumed BIT NOT NULL DEFAULT 0,
    CONSTRAINT fk_refresh_credential_user FOREIGN KEY (user_id) REFERENCES `user`(id),
    INDEX idx_refresh_credential_expiry (expires_at),
    INDEX idx_refresh_credential_user (user_id)
);
