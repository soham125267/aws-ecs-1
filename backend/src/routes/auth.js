const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { query } = require("../db");
const { authRequired } = require("../middleware/auth");

const router = express.Router();

function tokenFor(user) {
  return jwt.sign(
    { id: user.id, name: user.name, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "8h" }
  );
}

router.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password || password.length < 8) {
      return res.status(400).json({ message: "Name, email and password of at least 8 characters are required." });
    }

    const exists = await query("SELECT id FROM users WHERE LOWER(email)=LOWER($1)", [email]);
    if (exists.rowCount) {
      return res.status(409).json({ message: "Email already registered." });
    }

    const hash = await bcrypt.hash(password, 12);
    const result = await query(
      "INSERT INTO users(name,email,password_hash) VALUES($1,$2,$3) RETURNING id,name,email,role,created_at",
      [name.trim(), email.trim().toLowerCase(), hash]
    );

    const user = result.rows[0];
    res.status(201).json({ user, token: tokenFor(user) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Registration failed." });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await query("SELECT * FROM users WHERE LOWER(email)=LOWER($1)", [email || ""]);

    if (!result.rowCount || !(await bcrypt.compare(password || "", result.rows[0].password_hash))) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    const { password_hash, ...user } = result.rows[0];
    res.json({ user, token: tokenFor(user) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Login failed." });
  }
});

router.get("/me", authRequired, async (req, res) => {
  const result = await query(
    "SELECT id,name,email,role,created_at FROM users WHERE id=$1",
    [req.user.id]
  );
  res.json(result.rows[0]);
});

module.exports = router;
