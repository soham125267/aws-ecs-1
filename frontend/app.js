const API = "/api";
let token = localStorage.getItem("lms_token");
let currentUser = JSON.parse(localStorage.getItem("lms_user") || "null");

function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}

async function api(path, options = {}) {
  const headers = {"Content-Type": "application/json", ...(options.headers || {})};
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(API + path, {...options, headers});
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "Request failed");
  return data;
}

function toast(message) {
  const el = document.getElementById("toast");
  el.textContent = message;
  el.style.display = "block";
  setTimeout(() => el.style.display = "none", 2800);
}

function refreshNav() {
  document.getElementById("loginNav").classList.toggle("hidden", !!currentUser);
  document.getElementById("logoutNav").classList.toggle("hidden", !currentUser);
  document.querySelectorAll(".auth-only").forEach(x => x.classList.toggle("hidden", !currentUser));
  document.querySelectorAll(".admin-only").forEach(x => x.classList.toggle("hidden", currentUser?.role !== "admin"));
}

function setUser(data) {
  token = data.token;
  currentUser = data.user;
  localStorage.setItem("lms_token", token);
  localStorage.setItem("lms_user", JSON.stringify(currentUser));
  refreshNav();
}

function logout() {
  localStorage.removeItem("lms_token");
  localStorage.removeItem("lms_user");
  token = null;
  currentUser = null;
  refreshNav();
  showHome();
  toast("Logged out.");
}

function showHome() {
  refreshNav();
  document.getElementById("app").innerHTML = `
    <section class="hero">
      <div>
        <span class="badge">AWS-ready LMS platform</span>
        <h1>Learn. Practice. Track. Grow.</h1>
        <p>A full-stack Learning Management System with authentication, courses, lessons, progress tracking, quizzes and administration. We will containerize this application and deploy it to AWS ECS Fargate.</p>
        <div class="actions">
          <button class="btn" onclick="showCourses()">Explore Courses</button>
          ${currentUser ? `<button class="btn secondary" onclick="showDashboard()">Open My Learning</button>` : `<button class="btn secondary" onclick="openAuth('register')">Create Account</button>`}
        </div>
      </div>
      <div class="hero-card">
        <h3>Application architecture</h3>
        <p>Browser → Nginx → Node.js API → PostgreSQL</p>
        <p>Docker → ECR → ECS Fargate → ALB → RDS</p>
        <p>CloudWatch will be used for application logs in the AWS deployment.</p>
      </div>
    </section>
    <section class="section">
      <div class="section-title"><h2>What this LMS includes</h2></div>
      <div class="grid">
        ${feature("🎓","Course Management","Publish courses, organize lessons and manage training content.")}
        ${feature("📈","Learning Progress","Track completed lessons and course completion percentage.")}
        ${feature("🧠","Quizzes","Take quizzes, calculate scores and store attempts.")}
      </div>
    </section>`;
}

function feature(icon,title,text){
  return `<div class="card"><div class="card-body"><div style="font-size:35px">${icon}</div><h3>${title}</h3><p class="muted">${text}</p></div></div>`;
}

async function showCourses() {
  document.getElementById("app").innerHTML = `
    <section class="section">
      <div class="section-title">
        <div><h2>Course Catalog</h2><p class="muted">Explore published learning programs.</p></div>
        <input class="search" id="courseSearch" placeholder="Search courses..." oninput="loadCourses()">
      </div>
      <div id="courseGrid" class="grid"></div>
    </section>`;
  await loadCourses();
}

async function loadCourses() {
  const search = document.getElementById("courseSearch")?.value || "";
  const courses = await api(`/courses?search=${encodeURIComponent(search)}`);
  const grid = document.getElementById("courseGrid");
  if (!grid) return;
  grid.innerHTML = courses.length ? courses.map(courseCard).join("") : `<div class="empty">No courses found.</div>`;
}

function courseCard(c) {
  return `<article class="card">
    <img class="thumb" src="${esc(c.thumbnail || 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=900&q=80')}" alt="">
    <div class="card-body">
      <span class="badge">${esc(c.category)}</span>
      <h3>${esc(c.title)}</h3>
      <p class="muted">${esc(c.description).slice(0,150)}...</p>
      <div class="meta"><span>${esc(c.level)}</span><span>${c.lesson_count} lessons</span><span>${c.duration_hours} hrs</span></div>
      <strong>${Number(c.price) === 0 ? "Free" : "$" + c.price}</strong>
      <div class="actions"><button class="btn" onclick="showCourse(${c.id})">View Course</button></div>
    </div>
  </article>`;
}

async function showCourse(id) {
  const c = await api(`/courses/${id}`);
  document.getElementById("app").innerHTML = `
    <section class="section">
      <div class="course-detail">
        <div class="panel">
          <span class="badge">${esc(c.category)}</span>
          <h1>${esc(c.title)}</h1>
          <p class="muted">${esc(c.description)}</p>
          <div class="meta"><span>Instructor: ${esc(c.instructor)}</span><span>${esc(c.level)}</span><span>${c.duration_hours} hours</span></div>
          <h2>Course Curriculum</h2>
          ${c.lessons.map((l,i)=>`<div class="lesson"><div><div class="lesson-title">${i+1}. ${esc(l.title)}</div><div class="muted">${esc(l.description || "")}</div></div><span>${l.duration_minutes} min</span></div>`).join("")}
        </div>
        <aside class="panel">
          <img class="thumb" src="${esc(c.thumbnail || '')}" alt="">
          <h2>${Number(c.price) === 0 ? "Free" : "$"+c.price}</h2>
          <p class="muted">Lifetime access to course content.</p>
          <button class="btn" style="width:100%" onclick="enroll(${c.id})">${currentUser ? "Enroll Now" : "Login to Enroll"}</button>
          ${c.quiz ? `<button class="btn secondary" style="width:100%;margin-top:10px" onclick="showQuiz(${c.id})">View Quiz</button>` : ""}
        </aside>
      </div>
    </section>`;
}

async function enroll(id) {
  if (!currentUser) return openAuth("login");
  try { await api(`/courses/${id}/enroll`, {method:"POST"}); toast("Enrollment successful!"); showDashboard(); }
  catch(e){toast(e.message)}
}

function openAuth(mode) {
  const login = mode === "login";
  document.getElementById("app").innerHTML = `
    <div class="form-wrap">
      <h2>${login ? "Welcome Back" : "Create Learner Account"}</h2>
      <p class="muted">${login ? "Sign in to continue learning." : "Create your LMS account."}</p>
      ${!login ? `<div class="field"><label>Name</label><input id="name" placeholder="Your name"></div>` : ""}
      <div class="field"><label>Email</label><input id="email" type="email" placeholder="you@example.com"></div>
      <div class="field"><label>Password</label><input id="password" type="password" placeholder="Minimum 8 characters"></div>
      <button class="btn" onclick="${login ? "login()" : "register()"}">${login ? "Login" : "Register"}</button>
      <p class="muted">${login ? `New learner? <a href="#" onclick="openAuth('register');return false">Create account</a>` : `Already registered? <a href="#" onclick="openAuth('login');return false">Login</a>`}</p>
      <p class="muted" style="font-size:12px">Demo learner: learner@lms.local / Learner@123</p>
    </div>`;
}

async function login() {
  try {
    const data = await api("/auth/login",{method:"POST",body:JSON.stringify({email:email.value,password:password.value})});
    setUser(data); toast(`Welcome ${data.user.name}`); showHome();
  } catch(e){toast(e.message)}
}

async function register() {
  try {
    const data = await api("/auth/register",{method:"POST",body:JSON.stringify({name:name.value,email:email.value,password:password.value})});
    setUser(data); toast("Account created."); showHome();
  } catch(e){toast(e.message)}
}

async function showDashboard() {
  if (!currentUser) return openAuth("login");
  const courses = await api("/courses/mine/enrollments");
  document.getElementById("app").innerHTML = `
    <section class="section">
      <div class="section-title"><div><h2>My Learning</h2><p class="muted">Welcome back, ${esc(currentUser.name)}.</p></div></div>
      ${courses.length ? `<div class="grid">${courses.map(c=>`
        <article class="card"><div class="card-body">
          <span class="badge">${esc(c.category)}</span><h3>${esc(c.title)}</h3>
          <p class="muted">${esc(c.instructor)}</p>
          <div class="progress"><div style="width:${c.progress}%"></div></div>
          <p>${c.progress}% complete · ${c.completed_lessons}/${c.lesson_count} lessons</p>
          <div class="actions"><button class="btn" onclick="showLearning(${c.id})">Continue Learning</button></div>
        </div></article>`).join("")}</div>` : `<div class="empty"><h3>No enrolled courses yet.</h3><button class="btn" onclick="showCourses()">Browse Courses</button></div>`}
    </section>`;
}

async function showLearning(courseId) {
  const c = await api(`/courses/${courseId}`);
  const p = await api(`/courses/${courseId}/progress`);
  document.getElementById("app").innerHTML = `
    <section class="section">
      <div class="section-title"><div><h2>${esc(c.title)}</h2><p class="muted">${p.percentage}% complete</p></div><button class="btn" onclick="showQuiz(${courseId})">Take Quiz</button></div>
      <div class="panel">
        <div class="progress"><div style="width:${p.percentage}%"></div></div>
        ${p.lessons.map((l,i)=>`
          <div class="lesson">
            <div><div class="lesson-title">${i+1}. ${esc(l.title)}</div><div class="muted">${l.duration_minutes} minutes</div></div>
            ${l.completed ? `<span class="badge">Completed</span>` : `<button class="btn small success" onclick="completeLesson(${courseId},${l.id})">Mark Complete</button>`}
          </div>`).join("")}
      </div>
    </section>`;
}

async function completeLesson(courseId,lessonId){
  try{await api(`/courses/${courseId}/lessons/${lessonId}/complete`,{method:"POST"});toast("Lesson completed.");showLearning(courseId)}
  catch(e){toast(e.message)}
}

async function showQuiz(courseId) {
  try {
    const q = await api(`/courses/${courseId}/quiz`);
    document.getElementById("app").innerHTML = `
      <section class="section"><div class="panel">
        <h2>${esc(q.title)}</h2><p class="muted">Passing score: ${q.passing_score}%</p>
        <form id="quizForm">
          ${q.questions.map((x,i)=>`<div style="margin:25px 0"><h3>${i+1}. ${esc(x.question_text)}</h3>
            ${["A","B","C","D"].map(o=>`<label class="quiz-option"><input type="radio" name="q${x.id}" value="${o}"> ${o}. ${esc(x["option_"+o.toLowerCase()])}</label>`).join("")}
          </div>`).join("")}
          <button class="btn" type="submit">Submit Quiz</button>
        </form>
        <div id="quizResult"></div>
      </div></section>`;
    document.getElementById("quizForm").onsubmit = async (e)=>{
      e.preventDefault();
      const answers={};
      q.questions.forEach(x=>{const selected=document.querySelector(`input[name="q${x.id}"]:checked`);if(selected)answers[x.id]=selected.value});
      try{
        const result=await api(`/courses/${courseId}/quiz/submit`,{method:"POST",body:JSON.stringify({answers})});
        document.getElementById("quizResult").innerHTML=`<div class="panel" style="margin-top:20px"><h2>Score: ${result.score}%</h2><p>${result.passed?"Congratulations! You passed.":"You did not pass this attempt. Review the lessons and try again."}</p></div>`;
      }catch(err){toast(err.message)}
    };
  } catch(e){toast(e.message)}
}

async function showAdmin(){
  if(currentUser?.role!=="admin") return toast("Admin access required.");
  const s=await api("/admin/stats");
  const courses=await api("/admin/courses");
  document.getElementById("app").innerHTML=`
    <section class="section">
      <div class="section-title"><div><h2>Admin Dashboard</h2><p class="muted">Manage the LMS platform.</p></div><button class="btn" onclick="showCreateCourse()">Create Course</button></div>
      <div class="dashboard-grid">
        ${stat("Users",s.users)}${stat("Courses",s.courses)}${stat("Enrollments",s.enrollments)}${stat("Quiz Attempts",s.quizAttempts)}
      </div>
      <div class="table-wrap"><table class="table"><thead><tr><th>Course</th><th>Category</th><th>Students</th><th>Status</th><th>Action</th></tr></thead><tbody>
      ${courses.map(c=>`<tr><td>${esc(c.title)}</td><td>${esc(c.category)}</td><td>${c.student_count}</td><td>${c.published?"Published":"Draft"}</td><td><button class="btn small" onclick="showAdminCourse(${c.id})">Manage</button></td></tr>`).join("")}
      </tbody></table></div>
    </section>`;
}

function stat(label,num){return `<div class="stat"><div class="muted">${label}</div><div class="num">${num}</div></div>`}

function showCreateCourse(){
  document.getElementById("app").innerHTML=`<section class="section"><div class="form-wrap"><h2>Create Course</h2>
    ${field("title","Course title")} ${field("category","Category","Cloud")} ${field("instructor","Instructor","LMS Academy")}
    ${field("level","Level","Beginner")} ${field("duration","Duration hours","10")} ${field("price","Price","0")}
    <div class="field"><label>Description</label><textarea id="description"></textarea></div>
    <div class="field"><label>Thumbnail URL</label><input id="thumbnail"></div>
    <div class="field"><label><input type="checkbox" id="published" checked> Publish immediately</label></div>
    <button class="btn" onclick="createCourse()">Create Course</button>
  </div></section>`;
}
function field(id,label,placeholder=""){return `<div class="field"><label>${label}</label><input id="${id}" placeholder="${placeholder}"></div>`}

async function createCourse(){
  try{
    const c=await api("/courses",{method:"POST",body:JSON.stringify({
      title:title.value,description:description.value,category:category.value,instructor:instructor.value,
      level:level.value,duration_hours:duration.value,price:price.value,thumbnail:thumbnail.value,published:published.checked
    })});
    toast("Course created.");
    showAdminCourse(c.id);
  }catch(e){toast(e.message)}
}

async function showAdminCourse(id){
  const c=await api(`/courses/${id}`);
  document.getElementById("app").innerHTML=`<section class="section"><div class="section-title"><div><h2>Manage: ${esc(c.title)}</h2><p class="muted">${c.published?"Published":"Draft"}</p></div><button class="btn" onclick="showAdmin()">Back to Admin</button></div>
    <div class="grid">
      <div class="panel"><h3>Add Lesson</h3>
        ${field("ltitle","Lesson title")} ${field("lorder","Lesson order","1")} ${field("lduration","Duration minutes","20")}
        <div class="field"><label>Description</label><textarea id="ldesc"></textarea></div>
        <div class="field"><label>Content</label><textarea id="lcontent"></textarea></div>
        <button class="btn" onclick="addLesson(${id})">Add Lesson</button>
      </div>
      <div class="panel"><h3>Add Quiz</h3>
        ${field("qtitle","Quiz title","Course quiz")} ${field("passing","Passing score","70")}
        <p class="muted">For this admin demo, create a quiz with five default questions.</p>
        <button class="btn" onclick="addDefaultQuiz(${id})">Create Quiz</button>
      </div>
      <div class="panel"><h3>Lessons</h3>${c.lessons.map(l=>`<div class="lesson"><span>${l.lesson_order}. ${esc(l.title)}</span><span>${l.duration_minutes}m</span></div>`).join("")}</div>
    </div>
  </section>`;
}

async function addLesson(id){
  try{await api(`/courses/${id}/lessons`,{method:"POST",body:JSON.stringify({title:ltitle.value,description:ldesc.value,content:lcontent.value,lesson_order:lorder.value,duration_minutes:lduration.value})});toast("Lesson added.");showAdminCourse(id)}
  catch(e){toast(e.message)}
}

async function addDefaultQuiz(id){
  try{
    await api(`/courses/${id}/quiz`,{method:"POST",body:JSON.stringify({
      title:qtitle.value||"Course Quiz",passing_score:Number(passing.value)||70,
      questions:[
        {question_text:"What is the main goal of this course?",option_a:"Learning",option_b:"Nothing",option_c:"Testing",option_d:"None",correct_option:"A"},
        {question_text:"Which activity helps learners progress?",option_a:"Completing lessons",option_b:"Ignoring lessons",option_c:"Skipping everything",option_d:"None",correct_option:"A"},
        {question_text:"What is a quiz score?",option_a:"A measure of answers",option_b:"A course name",option_c:"A username",option_d:"A server",correct_option:"A"},
        {question_text:"Which platform feature tracks progress?",option_a:"Lesson progress",option_b:"Logo",option_c:"Footer",option_d:"Theme",correct_option:"A"},
        {question_text:"Who manages published learning content?",option_a:"Admin",option_b:"Anonymous user",option_c:"Browser",option_d:"Database",correct_option:"A"}
      ]
    })});toast("Quiz created.");showAdminCourse(id)
  }catch(e){toast(e.message)}
}

refreshNav();
showHome();
