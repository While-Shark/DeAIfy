CREATE TABLE IF NOT EXISTS api_keys (
 id CHAR(36) PRIMARY KEY, user_id CHAR(36) NOT NULL,
 project VARCHAR(64) NOT NULL, token_hash CHAR(64) NOT NULL UNIQUE,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 revoked_at DATETIME(3) NULL,
 INDEX idx_api_key_owner(user_id,revoked_at),
 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;
