import { EggAppConfig, EggAppInfo, PowerPartial } from 'egg';
import * as path from 'path';

// 从仓库根目录加载 .env（前后端分离后 server 在 server/ 子目录）
require('dotenv').config({ path: path.resolve(process.cwd(), '..', '.env') });

export default (appInfo: EggAppInfo): any => {
  const config = {} as PowerPartial<EggAppConfig>;

  config.keys = appInfo.name + '_rag_kb_qa_2026';

  config.security = {
    csrf: { enable: false },
  };

  config.multipart = {
    mode: 'file',
    fileSize: '50mb',
    whitelist: ['.txt', '.md', '.pdf', '.doc', '.docx', '.html'],
  };

  config.sequelize = {
    dialect: 'mysql',
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: Number(process.env.MYSQL_PORT) || 3306,
    database: process.env.MYSQL_DATABASE || 'rag_kb',
    username: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '123456',
    timezone: '+08:00',
    define: {
      timestamps: true,
      underscored: true,
      freezeTableName: true,
    },
    // 启动时自动建表/同步表结构（不删数据，仅 alter）
    sync: { force: false, alter: true },
  };

  const ragConfig = {
    lancedbPath: process.env.LANCEDB_PATH || '.lancedb-data',

    embedding: {
      provider: 'openai-compatible' as const,
      baseUrl: process.env.EMBEDDING_BASE_URL || 'http://localhost:11434/v1',
      apiKey: process.env.EMBEDDING_API_KEY || 'no-key',
      model: process.env.EMBEDDING_MODEL || 'nomic-embed-text',
      dimensions: Number(process.env.EMBEDDING_DIMENSIONS) || 768,
    },

    llm: {
      provider: 'openai-compatible' as const,
      baseUrl: process.env.LLM_BASE_URL || 'http://localhost:11434/v1',
      apiKey: process.env.LLM_API_KEY || 'no-key',
      model: process.env.LLM_MODEL || 'qwen2.5',
      maxTokens: Number(process.env.LLM_MAX_TOKENS) || 2048,
    },

    chunk: {
      splitByHeading: process.env.CHUNK_SPLIT_BY_HEADING !== 'false',
      maxLength: Number(process.env.CHUNK_MAX_LENGTH) || 500,
      overlap: Number(process.env.CHUNK_OVERLAP) || 50,
    },

    retrieval: {
      topK: Number(process.env.RETRIEVAL_TOP_K) || 5,
    },
  };

  return {
    ...config,
    rag: ragConfig,
  };
};
