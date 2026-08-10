const express = require("express");
const cors = require("cors");
const { waitForDatabase, query } = require("./db");
const authRoutes = require("./routes/auth");
const courseRoutes = require("./routes/courses");
const adminRoutes = require("./routes/admin");

const app = express();

app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.get("/api/health", async (req, res) => {
  try {
    await query("SELECT 1");
    res.json({ status: "UP", service: "lms-api", database: "UP", timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: "DOWN", service: "lms-api", database: "DOWN" });
  }
});

app.use("/api/auth", authRoutes);
app.use("/api/courses", courseRoutes);
app.use("/api/admin", adminRoutes);

app.use((req, res) => {
  res.status(404).json({ message: "API route not found." });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ message: "Internal server error." });
});

const PORT = process.env.PORT || 3000;

async function start() {
  await waitForDatabase();
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`LMS API listening on port ${PORT}`);
  });
}

start().catch(error => {
  console.error("Startup failed:", error);
  process.exit(1);
});
