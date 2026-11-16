import mysql from "mysql2/promise";

const globalForMySQL = globalThis as unknown as { mysqlPool?: mysql.Pool };

export const pool = globalForMySQL.mysqlPool ?? mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "smart_emergency",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  dateStrings: true
});

if (process.env.NODE_ENV !== "production") globalForMySQL.mysqlPool = pool;