const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000
});

pool.on("error", (err) => {
  console.error("Unexpected PostgreSQL pool error:", err);
});

async function query(text, params = []) {
  return pool.query(text, params);
}

async function waitForDatabase(retries = 20) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await pool.query("SELECT 1");
      console.log("Database connection established.");
      return;
    } catch (error) {
      console.log(`Database unavailable. Retry ${attempt}/${retries}...`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  throw new Error("Could not connect to PostgreSQL.");
}

module.exports = { pool, query, waitForDatabase };
