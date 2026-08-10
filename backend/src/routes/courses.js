const express = require("express");
const { query } = require("../db");
const { authRequired, adminRequired } = require("../middleware/auth");

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const search = req.query.search || "";
    const category = req.query.category || "";

    const result = await query(
      `SELECT c.*,
        COUNT(DISTINCT l.id)::int AS lesson_count,
        COUNT(DISTINCT e.id)::int AS student_count
       FROM courses c
       LEFT JOIN lessons l ON l.course_id=c.id
       LEFT JOIN enrollments e ON e.course_id=c.id
       WHERE c.published=true
         AND ($1='' OR c.title ILIKE '%'||$1||'%' OR c.description ILIKE '%'||$1||'%')
         AND ($2='' OR c.category=$2)
       GROUP BY c.id
       ORDER BY c.created_at DESC`,
      [search, category]
    );

    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Could not load courses." });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const courseResult = await query("SELECT * FROM courses WHERE id=$1", [req.params.id]);
    if (!courseResult.rowCount) return res.status(404).json({ message: "Course not found." });

    const lessons = await query(
      "SELECT id,title,description,video_url,content,lesson_order,duration_minutes FROM lessons WHERE course_id=$1 ORDER BY lesson_order",
      [req.params.id]
    );

    const quiz = await query("SELECT id,title,passing_score FROM quizzes WHERE course_id=$1 LIMIT 1", [req.params.id]);

    res.json({ ...courseResult.rows[0], lessons: lessons.rows, quiz: quiz.rows[0] || null });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Could not load course." });
  }
});

router.post("/:id/enroll", authRequired, async (req, res) => {
  try {
    const course = await query("SELECT id FROM courses WHERE id=$1 AND published=true", [req.params.id]);
    if (!course.rowCount) return res.status(404).json({ message: "Course not found." });

    await query(
      "INSERT INTO enrollments(user_id,course_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
      [req.user.id, req.params.id]
    );

    res.json({ message: "Enrollment successful." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Enrollment failed." });
  }
});

router.get("/:id/progress", authRequired, async (req, res) => {
  const enrolled = await query(
    "SELECT 1 FROM enrollments WHERE user_id=$1 AND course_id=$2",
    [req.user.id, req.params.id]
  );
  if (!enrolled.rowCount) return res.status(403).json({ message: "Enroll in this course first." });

  const result = await query(
    `SELECT l.id,l.title,l.lesson_order,l.duration_minutes,
            COALESCE(lp.completed,false) AS completed
     FROM lessons l
     LEFT JOIN lesson_progress lp ON lp.lesson_id=l.id AND lp.user_id=$1
     WHERE l.course_id=$2
     ORDER BY l.lesson_order`,
    [req.user.id, req.params.id]
  );

  const total = result.rowCount;
  const completed = result.rows.filter(x => x.completed).length;
  res.json({ total, completed, percentage: total ? Math.round(completed / total * 100) : 0, lessons: result.rows });
});

router.post("/:id/lessons/:lessonId/complete", authRequired, async (req, res) => {
  const ownership = await query(
    `SELECT l.id FROM lessons l
     JOIN enrollments e ON e.course_id=l.course_id
     WHERE l.id=$1 AND l.course_id=$2 AND e.user_id=$3`,
    [req.params.lessonId, req.params.id, req.user.id]
  );

  if (!ownership.rowCount) return res.status(403).json({ message: "You are not enrolled in this course." });

  await query(
    `INSERT INTO lesson_progress(user_id,lesson_id,completed,completed_at)
     VALUES($1,$2,true,CURRENT_TIMESTAMP)
     ON CONFLICT(user_id,lesson_id)
     DO UPDATE SET completed=true,completed_at=CURRENT_TIMESTAMP`,
    [req.user.id, req.params.lessonId]
  );

  res.json({ message: "Lesson marked complete." });
});

router.get("/:id/quiz", authRequired, async (req, res) => {
  const enrolled = await query(
    "SELECT 1 FROM enrollments WHERE user_id=$1 AND course_id=$2",
    [req.user.id, req.params.id]
  );
  if (!enrolled.rowCount) return res.status(403).json({ message: "Enroll in this course first." });

  const quiz = await query(
    "SELECT id,title,passing_score FROM quizzes WHERE course_id=$1 LIMIT 1",
    [req.params.id]
  );
  if (!quiz.rowCount) return res.status(404).json({ message: "Quiz not found." });

  const questions = await query(
    `SELECT id,question_text,option_a,option_b,option_c,option_d
     FROM questions WHERE quiz_id=$1 ORDER BY id`,
    [quiz.rows[0].id]
  );

  res.json({ ...quiz.rows[0], questions: questions.rows });
});

router.post("/:id/quiz/submit", authRequired, async (req, res) => {
  try {
    const { answers } = req.body;
    const quiz = await query(
      "SELECT id,passing_score FROM quizzes WHERE course_id=$1 LIMIT 1",
      [req.params.id]
    );

    if (!quiz.rowCount) return res.status(404).json({ message: "Quiz not found." });

    const questions = await query(
      "SELECT id,correct_option FROM questions WHERE quiz_id=$1",
      [quiz.rows[0].id]
    );

    let correct = 0;
    for (const q of questions.rows) {
      if (answers && answers[String(q.id)] === q.correct_option) correct++;
    }

    const score = questions.rowCount ? Math.round(correct / questions.rowCount * 100) : 0;
    const passed = score >= quiz.rows[0].passing_score;

    await query(
      "INSERT INTO quiz_attempts(user_id,quiz_id,score,passed) VALUES($1,$2,$3,$4)",
      [req.user.id, quiz.rows[0].id, score, passed]
    );

    res.json({ score, passed, correct, total: questions.rowCount, passingScore: quiz.rows[0].passing_score });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Could not submit quiz." });
  }
});

router.get("/mine/enrollments", authRequired, async (req, res) => {
  const result = await query(
    `SELECT c.id,c.title,c.description,c.category,c.level,c.instructor,c.duration_hours,c.thumbnail,
            e.enrolled_at,
            COUNT(DISTINCT l.id)::int AS lesson_count,
            COUNT(DISTINCT CASE WHEN lp.completed=true THEN lp.lesson_id END)::int AS completed_lessons
     FROM enrollments e
     JOIN courses c ON c.id=e.course_id
     LEFT JOIN lessons l ON l.course_id=c.id
     LEFT JOIN lesson_progress lp ON lp.lesson_id=l.id AND lp.user_id=e.user_id
     WHERE e.user_id=$1
     GROUP BY c.id,e.enrolled_at
     ORDER BY e.enrolled_at DESC`,
    [req.user.id]
  );

  res.json(result.rows.map(c => ({
    ...c,
    progress: c.lesson_count ? Math.round(c.completed_lessons / c.lesson_count * 100) : 0
  })));
});

router.post("/", authRequired, adminRequired, async (req, res) => {
  const { title, description, category, level, instructor, duration_hours, price, thumbnail, published } = req.body;

  if (!title || !description || !category || !instructor) {
    return res.status(400).json({ message: "Title, description, category and instructor are required." });
  }

  const result = await query(
    `INSERT INTO courses(title,description,category,level,instructor,duration_hours,price,thumbnail,published)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING *`,
    [title,description,category,level || "Beginner",instructor,Number(duration_hours)||0,Number(price)||0,thumbnail||null,Boolean(published)]
  );

  res.status(201).json(result.rows[0]);
});

router.post("/:id/lessons", authRequired, adminRequired, async (req, res) => {
  const { title, description, video_url, content, lesson_order, duration_minutes } = req.body;

  const result = await query(
    `INSERT INTO lessons(course_id,title,description,video_url,content,lesson_order,duration_minutes)
     VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [req.params.id,title,description||"",video_url||"",content||"",Number(lesson_order)||1,Number(duration_minutes)||10]
  );

  res.status(201).json(result.rows[0]);
});

router.post("/:id/quiz", authRequired, adminRequired, async (req, res) => {
  const { title, passing_score, questions = [] } = req.body;

  const client = await require("../db").pool.connect();
  try {
    await client.query("BEGIN");
    const quiz = await client.query(
      "INSERT INTO quizzes(course_id,title,passing_score) VALUES($1,$2,$3) RETURNING *",
      [req.params.id,title,Number(passing_score)||70]
    );

    for (const q of questions) {
      await client.query(
        `INSERT INTO questions(quiz_id,question_text,option_a,option_b,option_c,option_d,correct_option)
         VALUES($1,$2,$3,$4,$5,$6,$7)`,
        [quiz.rows[0].id,q.question_text,q.option_a,q.option_b,q.option_c,q.option_d,q.correct_option]
      );
    }

    await client.query("COMMIT");
    res.status(201).json(quiz.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(error);
    res.status(500).json({ message: "Could not create quiz." });
  } finally {
    client.release();
  }
});

router.patch("/:id", authRequired, adminRequired, async (req, res) => {
  const allowed = ["title","description","category","level","instructor","duration_hours","price","thumbnail","published"];
  const fields = [];
  const values = [];

  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      fields.push(`${key}=$${values.length+1}`);
      values.push(req.body[key]);
    }
  }

  if (!fields.length) return res.status(400).json({ message: "No fields to update." });

  values.push(req.params.id);
  const result = await query(
    `UPDATE courses SET ${fields.join(",")},updated_at=CURRENT_TIMESTAMP WHERE id=$${values.length} RETURNING *`,
    values
  );

  res.json(result.rows[0]);
});

module.exports = router;
