CREATE TABLE IF NOT EXISTS users (
 id CHAR(36) PRIMARY KEY, email VARCHAR(191) NOT NULL UNIQUE,
 password_hash VARCHAR(255) NOT NULL, role ENUM('user','admin') NOT NULL DEFAULT 'user',
 is_disabled BOOLEAN NOT NULL DEFAULT FALSE,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS wallets (
 user_id CHAR(36) PRIMARY KEY, credits BIGINT NOT NULL DEFAULT 0,
 updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
 FOREIGN KEY(user_id) REFERENCES users(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS sessions (
 token_hash CHAR(64) PRIMARY KEY,user_id CHAR(36) NOT NULL,
 expires_at DATETIME(3) NOT NULL,created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 INDEX idx_session_user(user_id),FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS email_codes (
 id CHAR(36) PRIMARY KEY,email VARCHAR(191) NOT NULL,
 code_digest CHAR(64) NOT NULL,expires_at DATETIME(3) NOT NULL,
 attempts SMALLINT UNSIGNED NOT NULL DEFAULT 0,
 consumed BOOLEAN NOT NULL DEFAULT FALSE, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 INDEX idx_email_codes(email,created_at)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS password_reset_codes (
 id CHAR(36) PRIMARY KEY,
 user_id CHAR(36) NOT NULL,
 code_digest CHAR(64) NOT NULL,
 attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
 consumed BOOLEAN NOT NULL DEFAULT FALSE,
 expires_at DATETIME(3) NOT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 INDEX idx_reset_code_user(user_id,created_at),
 FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS daily_quota (
 user_id CHAR(36) NOT NULL,quota_date DATE NOT NULL,used SMALLINT UNSIGNED NOT NULL DEFAULT 0,
 PRIMARY KEY(user_id,quota_date),FOREIGN KEY(user_id) REFERENCES users(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS plans (
 id CHAR(36) PRIMARY KEY,title VARCHAR(100) NOT NULL,
 base_price_fen INT UNSIGNED NOT NULL,discount_bps SMALLINT UNSIGNED NOT NULL DEFAULT 10000,
 credits INT UNSIGNED NOT NULL,bonus_credits INT UNSIGNED NOT NULL DEFAULT 0,
 discount_starts_at DATETIME(3) NULL,discount_ends_at DATETIME(3) NULL,
 active BOOLEAN NOT NULL DEFAULT TRUE,sort_order INT NOT NULL DEFAULT 0,
 version INT UNSIGNED NOT NULL DEFAULT 1,created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS orders (
 id CHAR(32) PRIMARY KEY,user_id CHAR(36) NOT NULL,plan_id CHAR(36) NOT NULL,
 title_snapshot VARCHAR(100) NOT NULL,
 original_price_fen INT UNSIGNED NOT NULL,price_fen INT UNSIGNED NOT NULL,
 credits_snapshot INT UNSIGNED NOT NULL,discount_bps SMALLINT UNSIGNED NOT NULL,
 provider ENUM('xunhu','creem') NOT NULL DEFAULT 'xunhu',
 provider_product_id VARCHAR(96) NULL,
 provider_amount_minor INT UNSIGNED NULL,
 provider_currency CHAR(3) NULL,
 provider_order_id VARCHAR(96) NULL UNIQUE,
 provider_transaction_id VARCHAR(96) NULL UNIQUE,
 state ENUM('pending','paid','refunded','failed') NOT NULL DEFAULT 'pending',
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),paid_at DATETIME(3) NULL,
 FOREIGN KEY(user_id) REFERENCES users(id),FOREIGN KEY(plan_id) REFERENCES plans(id),
 INDEX idx_order_user(user_id,created_at)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS processing_jobs (
 id CHAR(36) PRIMARY KEY,user_id CHAR(36) NOT NULL,
 idempotency_key VARCHAR(80) NOT NULL,
 state ENUM('reserved','complete','reversed') NOT NULL DEFAULT 'reserved',
 source ENUM('free','credits') NOT NULL,quota_date DATE NOT NULL,
 filename VARCHAR(160) NOT NULL DEFAULT '',mime VARCHAR(32) NOT NULL DEFAULT '',
 byte_count INT UNSIGNED NOT NULL DEFAULT 0,expires_at DATETIME(3) NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
 UNIQUE KEY idx_job_unique(user_id,idempotency_key),
 INDEX idx_job_stale(state,created_at),FOREIGN KEY(user_id) REFERENCES users(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS credit_ledger (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,user_id CHAR(36) NOT NULL,
 delta BIGINT NOT NULL,kind ENUM('purchase','consume','reversal','refund','admin_adjustment') NOT NULL,
 reference_id VARCHAR(80) NOT NULL,created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 UNIQUE KEY idx_ledger_unique(kind,reference_id),INDEX idx_ledger_user(user_id,created_at),
 FOREIGN KEY(user_id) REFERENCES users(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS audit_logs (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,actor_id CHAR(36) NULL,
 action VARCHAR(90) NOT NULL,target_id VARCHAR(90) NOT NULL,detail VARCHAR(1000) NOT NULL DEFAULT '',
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),INDEX idx_audit_date(created_at)
) ENGINE=InnoDB;
INSERT IGNORE INTO plans(id,title,base_price_fen,discount_bps,credits,bonus_credits,sort_order)
VALUES
 ('plan-starter','体验包',990,10000,20,0,10),
 ('plan-creator','创作者包',2990,9000,70,0,20),
 ('plan-pro','专业包',5990,9000,160,0,30),
 ('plan-studio','工作室包',9990,10000,300,0,40);
