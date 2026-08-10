const express = require("express");
const { query } = require("../db");
const { authRequired, adminRequired } = require("../middleware/auth");

const router = express.Router();

router.use(authRequired, adminRequired);

router.get("/stats", async (req, res) => {
  const [users, courses, enrollments, attempts] = await Promise.all([
    query("SELECT COUNT(*)::int AS count FROM users"),
    query("SELECT COUNT(*)::int AS count FROM courses"),
    query("SELECT COUNT(*)::int AS count FROM enrollments"),
    query("SELECT COUNT(*)::int AS count FROM quiz_attempts")
  ]);

  res.json({
    users: users.rows[0].count,
    courses: courses.rows[0].count,
    enrollments: enrollments.rows[0].count,
    quizAttempts: attempts.rows[0].count
  });
});

router.get("/users", async (req, res) => {
  const result = await query(
    "SELECT id,name,email,role,created_at FROM users ORDER BY created_at DESC"
  );
  res.json(result.rows);
});

router.get("/courses", async (req, res) => {
  const result = await query(
    `SELECT c.*, COUNT(e.id)::int AS student_count
     FROM courses c LEFT JOIN enrollments e ON e.course_id=c.id
     GROUP BY c.id ORDER BY c.created_at DESC`
  );
  res.json(result.rows);
});

module.exports = router;
