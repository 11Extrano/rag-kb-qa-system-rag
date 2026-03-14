-- 创建数据库（若不存在）
CREATE DATABASE IF NOT EXISTS rag_kb
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE rag_kb;

-- 文档表：每个上传文件一条记录
CREATE TABLE IF NOT EXISTS documents (
  id INT NOT NULL AUTO_INCREMENT,
  doc_id VARCHAR(36) NOT NULL,
  filename VARCHAR(255) NOT NULL,
  original_content LONGTEXT NOT NULL,
  status ENUM('uploaded', 'cleaning', 'cleaned', 'splitting', 'completed', 'failed') NOT NULL DEFAULT 'uploaded',
  created_at DATETIME(6) NULL,
  updated_at DATETIME(6) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY documents_doc_id (doc_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 片段表：每个文档可对应多条 chunk
CREATE TABLE IF NOT EXISTS chunks (
  id INT NOT NULL AUTO_INCREMENT,
  chunk_id VARCHAR(36) NOT NULL,
  doc_id VARCHAR(36) NOT NULL,
  text MEDIUMTEXT NOT NULL,
  metadata JSON NULL,
  created_at DATETIME(6) NULL,
  updated_at DATETIME(6) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY chunks_chunk_id (chunk_id),
  KEY chunks_doc_id (doc_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
