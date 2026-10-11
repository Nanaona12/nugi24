-- Run as your LOCAL MySQL administrator, not the sync user. MySQL 8.0+.
CREATE DATABASE IF NOT EXISTS dagangpintar_backup CHARACTER SET utf8mb4;
USE dagangpintar_backup;
CREATE TABLE IF NOT EXISTS backup_history (
 tenant_id CHAR(36) NOT NULL,
 seq BIGINT UNSIGNED NOT NULL,
 table_name VARCHAR(64) NOT NULL,
 record_id VARCHAR(64) NOT NULL,
 operation VARCHAR(16) NOT NULL,
 payload JSON NOT NULL,
 previous_payload JSON,
 recorded_at VARCHAR(40) NOT NULL,
 PRIMARY KEY(tenant_id,seq),
 INDEX record_versions(tenant_id,table_name,record_id,seq)
);
CREATE OR REPLACE VIEW riwayat_transaksi AS SELECT * FROM backup_history WHERE table_name='transactions';
CREATE OR REPLACE VIEW detail_struk AS SELECT * FROM backup_history WHERE table_name='transaction_items';
CREATE OR REPLACE VIEW riwayat_po AS SELECT * FROM backup_history WHERE table_name IN ('purchase_orders','purchase_order_items');
CREATE OR REPLACE VIEW riwayat_pembukuan AS SELECT * FROM backup_history WHERE table_name='bookkeeping_entries';
-- Create a dedicated local user with your OWN strong password, then grant only:
-- GRANT SELECT, INSERT ON dagangpintar_backup.backup_history TO 'backup_sync'@'localhost';
-- No DELETE, UPDATE, DROP, or ALTER privilege for the sync user.
