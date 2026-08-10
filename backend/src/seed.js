const bcrypt = require("bcryptjs");
const { query, waitForDatabase } = require("./db");

async function seed() {
  await waitForDatabase();

  const adminHash = await bcrypt.hash("Admin@123", 12);
  const learnerHash = await bcrypt.hash("Learner@123", 12);

  await query(
    `INSERT INTO users(name,email,password_hash,role)
     VALUES($1,$2,$3,'admin')
     ON CONFLICT(email) DO NOTHING`,
    ["LMS Administrator", "admin@lms.local", adminHash]
  );

  await query(
    `INSERT INTO users(name,email,password_hash,role)
     VALUES($1,$2,$3,'learner')
     ON CONFLICT(email) DO NOTHING`,
    ["Demo Learner", "learner@lms.local", learnerHash]
  );

  const course = await query(
    `INSERT INTO courses(title,description,category,level,instructor,duration_hours,price,thumbnail,published)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,true)
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [
      "AWS Cloud & DevOps Fundamentals",
      "A practical introduction to cloud computing, containers, Docker, Amazon ECR, ECS, Fargate and deployment architecture.",
      "Cloud",
      "Beginner",
      "LMS Academy",
      12,
      0,
      "https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=900&q=80"
    ]
  );

  let courseId;
  if (course.rowCount) {
    courseId = course.rows[0].id;
  } else {
    const existing = await query("SELECT id FROM courses WHERE title=$1 LIMIT 1", ["AWS Cloud & DevOps Fundamentals"]);
    courseId = existing.rows[0].id;
  }

  const lessonCount = await query("SELECT COUNT(*)::int AS count FROM lessons WHERE course_id=$1", [courseId]);
  if (lessonCount.rows[0].count === 0) {
    const lessons = [
      ["Introduction to Cloud Computing", "Understand cloud models and core AWS concepts.", 1, 35],
      ["Docker Fundamentals", "Learn images, containers, Dockerfiles and registries.", 2, 45],
      ["Amazon ECR", "Store and manage container images in AWS.", 3, 35],
      ["Amazon ECS", "Understand clusters, tasks, services and task definitions.", 4, 50],
      ["AWS Fargate", "Run containers without managing EC2 servers.", 5, 40],
      ["Application Load Balancer", "Route HTTP traffic to containerized services.", 6, 45],
      ["Production Deployment", "Combine ECR, ECS, networking, logs and scaling.", 7, 60]
    ];

    for (const [title, desc, order, mins] of lessons) {
      await query(
        `INSERT INTO lessons(course_id,title,description,content,lesson_order,duration_minutes)
         VALUES($1,$2,$3,$4,$5,$6)`,
        [courseId,title,desc,`${title}\n\nThis lesson is part of the LMS demonstration application.`,order,mins]
      );
    }
  }

  const quizExists = await query("SELECT id FROM quizzes WHERE course_id=$1 LIMIT 1", [courseId]);
  if (!quizExists.rowCount) {
    const quiz = await query(
      "INSERT INTO quizzes(course_id,title,passing_score) VALUES($1,$2,$3) RETURNING id",
      [courseId, "AWS & ECS Fundamentals Quiz", 70]
    );

    const questions = [
      ["What service stores Docker images in AWS?", "Amazon ECR", "Amazon ECS", "Amazon RDS", "Amazon S3", "A"],
      ["What does ECS manage?", "Containerized applications", "DNS records only", "Email", "Source code only", "A"],
      ["What does Fargate remove the need to manage?", "EC2 servers", "Docker images", "Databases", "IAM users", "A"],
      ["What is a task definition?", "A blueprint for an ECS task", "A database table", "A DNS zone", "A Git branch", "A"],
      ["Which service is commonly used for HTTP load balancing?", "Application Load Balancer", "RDS", "ECR", "CloudTrail", "A"]
    ];

    for (const q of questions) {
      await query(
        `INSERT INTO questions(quiz_id,question_text,option_a,option_b,option_c,option_d,correct_option)
         VALUES($1,$2,$3,$4,$5,$6,$7)`,
        [quiz.rows[0].id, ...q]
      );
    }
  }

  console.log("Seed completed.");
  process.exit(0);
}

seed().catch(error => {
  console.error(error);
  process.exit(1);
});
