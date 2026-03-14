import { EggAppConfig, PowerPartial } from 'egg';

export default () => {
  const config = {} as PowerPartial<EggAppConfig>;

  config.sequelize = {
    dialect: 'mysql',
    host: '127.0.0.1',
    port: 3306,
    database: 'rag_kb',
    username: 'root',
    password: process.env.MYSQL_PASSWORD || '123456',
    sync: { force: false, alter: true },
  };

  return config;
};
