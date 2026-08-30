const ADMIN_NISN = "ADMIN2026";
const DB_KEY = "taskCenterDatabase";
const SESSION_KEY = "taskCenterSession";
const COMMENT_KEY = "taskCenterComments";

const defaultStudents = {
    "1234567890": { name: "Nama Siswa 1" }
};

const defaultAdmin = { username: "ADMIN2026", password: "admin123" };

const defaultSubjects = [
    ["Pendidikan Pancasila", "🏛️", [["Tugas Pendidikan Pancasila 01", "30 Agustus 2026"], ["Tugas Pendidikan Pancasila 02", "5 September 2026"]]],
    ["Sosiologi", "👥", [["Tugas Sosiologi 01", "1 September 2026"], ["Tugas Sosiologi 02", "8 September 2026"]]],
    ["Matematika", "📐", [["Latihan Matematika 01", "2 September 2026"], ["Latihan Matematika 02", "9 September 2026"]]],
    ["Matematika TKA", "📊", [["Latihan TKA Matematika 01", "3 September 2026"], ["Latihan TKA Matematika 02", "10 September 2026"]]],
    ["Seni Budaya", "🎨", [["Tugas Seni Budaya 01", "4 September 2026"]]],
    ["PJOK", "🏃", [["Tugas PJOK 01", "5 September 2026"]]],
    ["Bahasa Sunda", "🗣️", [["Tugas Bahasa Sunda 01", "6 September 2026"]]],
    ["Akuntansi", "🧮", [["Latihan Akuntansi 01", "7 September 2026"]]],
    ["Ekonomi", "💰", [["Tugas Ekonomi 01", "8 September 2026"]]],
    ["Sejarah", "📜", [["Tugas Sejarah 01", "9 September 2026"], ["Tugas Sejarah 02", "16 September 2026"], ["Tugas Sejarah 03", "23 September 2026"]]],
    ["Pendidikan Agama Islam", "🕌", [["Tugas PAI 01", "10 September 2026"]]],
    ["Geografi", "🌍", [["Tugas Geografi 01", "11 September 2026"]]],
    ["Informatika", "💻", [["Tugas Informatika 01", "12 September 2026"]]],
    ["Bahasa Indonesia", "📖", [["Tugas Bahasa Indonesia 01", "13 September 2026"]]],
    ["Bahasa Inggris", "🇬🇧", [["English Assignment 01", "14 September 2026"]]]
];

let adminConfig = { ...defaultAdmin };
let database = null;
let currentStudent = null;
let currentSubject = null;
let currentTask = null;
let uploadInProgress = null;
let confirmationResolver = null;
let activeReport = null;
const $ = (id) => document.getElementById(id);

function escapeHtml(value = "") {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function slugify(value = "") {
    return String(value)
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "mapel";
}

function encryptStudentCode(name, birthDate) {
    const source = `${name.trim().toLowerCase()}|${birthDate}`;
    let hash = 2166136261;
    for (const character of source) {
        hash ^= character.charCodeAt(0);
        hash = Math.imul(hash, 16777619);
    }
    return String(Math.abs(hash)).slice(-10).padStart(10, "0");
}

function decryptStudentCode(code, students = database.students) {
    const student = students[code];
    return student ? { name: student.name, birthDate: student.birthDate || null } : null;
}

function formatCommentTimestamp(date = new Date()) {
    return `${date.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })} ${date.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", hour12: false })}`;
}

function createDatabase() {
    const subjects = defaultSubjects.map(([name, icon, tasks]) => ({
        id: crypto.randomUUID(), name, icon,
        tasks: tasks.map(([title, deadline]) => ({ id: crypto.randomUUID(), title, deadline }))
    }));
    return { students: { ...defaultStudents }, subjects, submissions: {} };
}

function getDatabase() {
    const stored = localStorage.getItem(DB_KEY);
    if (stored) return JSON.parse(stored);
    const databaseObject = createDatabase();
    saveDatabase(databaseObject);
    return databaseObject;
}

function saveDatabase(databaseObject) { localStorage.setItem(DB_KEY, JSON.stringify(databaseObject)); }

async function callApi(url, options = {}) {
    const response = await fetch(url, {
        headers: { "Content-Type": "application/json", ...(options.headers || {}) },
        ...options
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Server penyimpanan tidak merespons.");
    return result;
}

function readJsonFile(url, fallback) {
    return fetch(url)
        .then((response) => response.ok ? response.json() : fallback)
        .catch(() => fallback);
}

async function initConfig() {
    const adminData = await readJsonFile("./database/admin.json", defaultAdmin);
    if (adminData && adminData.username) adminConfig = adminData;
    localStorage.setItem("taskCenterAdmin", JSON.stringify(adminConfig));

    const studentData = await readJsonFile("/api/students", await readJsonFile("./database/siswa.json", defaultStudents));
    if (studentData && typeof studentData === "object" && Object.keys(studentData).length) {
        database = getDatabase();
        database.students = { ...studentData };
        saveDatabase(database);
    }

    const comments = await readJsonFile("/api/comments", await readJsonFile("./database/komentar.json", []));
    if (Array.isArray(comments)) localStorage.setItem(COMMENT_KEY, JSON.stringify(comments));

    database = getDatabase();
    const savedSession = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
    if (savedSession?.role === "admin") showAdmin();
    else if (savedSession?.role === "student" && database.students[savedSession.nisn]) showDashboard(savedSession.nisn);
    else setPage("login-page");
}

function setPage(page) {
    ["login-page", "dashboard-page", "task-page", "task-detail-page", "admin-page", "admin-task-page", "admin-task-detail-page"].forEach((id) => {
        const el = $(id);
        if (el) el.style.display = id === page ? "block" : "none";
    });
}

function showToast(message, type = "success") {
    const toastContainer = $("toastContainer");
    if (!toastContainer) return;
    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <span class="toast-icon"><i class="fa-solid ${type === "success" ? "fa-check" : type === "error" ? "fa-xmark" : "fa-info"}"></i></span>
        <span>${message}</span>
    `;
    toastContainer.appendChild(toast);
    setTimeout(() => {
        toast.classList.add("hide");
        setTimeout(() => toast.remove(), 280);
    }, 2200);
}

function confirmAction(message, title = "Lanjutkan aksi ini?", actionLabel = "Lanjutkan") {
    return new Promise((resolve) => {
        confirmationResolver = resolve;
        $("confirmTitle").textContent = title;
        $("confirmMessage").textContent = message;
        $("confirmAccept").textContent = actionLabel;
        $("confirm-modal").classList.add("open");
        $("confirm-modal").setAttribute("aria-hidden", "false");
        $("confirmAccept").focus();
    });
}

function closeConfirmation(accepted) {
    $("confirm-modal").classList.remove("open");
    $("confirm-modal").setAttribute("aria-hidden", "true");
    if (confirmationResolver) confirmationResolver(accepted);
    confirmationResolver = null;
}

function getComments(taskId) {
    const allComments = JSON.parse(localStorage.getItem(COMMENT_KEY) || "[]");
    return allComments.filter((comment) => comment.taskId === taskId || (currentTask && comment.taskTitle === currentTask.title));
}

async function refreshComments() {
    try {
        const comments = await callApi("/api/comments", { headers: {} });
        localStorage.setItem(COMMENT_KEY, JSON.stringify(comments));
        renderComments();
    } catch {
        renderComments();
    }
}

function renderComments() {
    const list = $("commentList");
    if (!list || !currentTask) return;
    const comments = getComments(currentTask.id);
    if (!comments.length) {
        list.innerHTML = '<p class="empty-comment">Belum ada komentar untuk tugas ini.</p>';
        return;
    }

    const roots = comments.filter((comment) => !comment.parentId);
    const replies = (commentId) => comments.filter((comment) => comment.parentId === commentId);
    const countReplies = (commentId) => replies(commentId).reduce((total, reply) => total + 1 + countReplies(reply.id), 0);
    const renderReply = (reply) => `
        <div class="reply-item" data-comment-id="${reply.id}">
            <div class="comment-top"><div><strong>${escapeHtml(reply.nama)}</strong>${reply.edited ? '<small class="edited-label">(edited)</small>' : ""}</div><span>${escapeHtml(reply.tanggal)}</span></div>
            <p>${escapeHtml(reply.komentar)}</p>
            <button type="button" class="comment-menu-toggle" aria-label="Opsi komentar">&#8230;</button>
            <div class="comment-actions" hidden><button type="button" data-comment-action="reply"><i class="fa-solid fa-reply"></i> Balas</button>${reply.nisn === currentStudent ? '<button type="button" data-comment-action="edit"><i class="fa-solid fa-pen"></i> Edit</button><button type="button" data-comment-action="delete"><i class="fa-solid fa-trash"></i> Hapus</button>' : '<button type="button" data-comment-action="report"><i class="fa-solid fa-flag"></i> Laporkan</button>'}</div>
            <form class="reply-form" hidden><textarea rows="2" placeholder="@${escapeHtml(reply.nama)} tulis balasan..." required></textarea><button type="submit" class="primary-btn">Kirim balasan</button></form>
            ${replies(reply.id).length ? `<div class="nested-replies">${replies(reply.id).map(renderReply).join("")}</div>` : ""}
        </div>`;
    list.innerHTML = roots.map((comment) => `
        <article class="comment-item" data-comment-id="${comment.id}">
            <div class="comment-top">
                <div><strong>${escapeHtml(comment.nama)}</strong>${comment.edited ? '<small class="edited-label">(edited)</small>' : ""}</div>
                <span>${escapeHtml(comment.tanggal)}</span>
            </div>
            <p>${escapeHtml(comment.komentar)}</p>
            <button type="button" class="comment-menu-toggle" aria-label="Opsi komentar">&#8230;</button>
            <div class="comment-actions" hidden>
                <button type="button" data-comment-action="reply"><i class="fa-solid fa-reply"></i> Balas</button>
                ${comment.nisn === currentStudent ? '<button type="button" data-comment-action="edit"><i class="fa-solid fa-pen"></i> Edit</button><button type="button" data-comment-action="delete"><i class="fa-solid fa-trash"></i> Hapus</button>' : '<button type="button" data-comment-action="report"><i class="fa-solid fa-flag"></i> Laporkan</button>'}
            </div>
            ${countReplies(comment.id) ? `<button type="button" class="replies-toggle" data-comment-action="toggle-replies"><i class="fa-solid fa-comments"></i> ${countReplies(comment.id)} balasan</button>` : ""}
            <div class="reply-list" hidden>${replies(comment.id).map(renderReply).join("")}</div>
            <form class="reply-form" hidden><textarea rows="2" placeholder="@${escapeHtml(comment.nama)} tulis balasan..." required></textarea><button type="submit" class="primary-btn">Kirim balasan</button></form>
        </article>
    `).join("");
}

function renderAdminComments() {
    const list = $("adminCommentList");
    if (!list || !currentTask) return;
    const comments = getComments(currentTask.id);
    const replies = (commentId) => comments.filter((comment) => comment.parentId === commentId);
    const countReplies = (commentId) => replies(commentId).reduce((total, reply) => total + 1 + countReplies(reply.id), 0);
    const renderReply = (reply) => `<div class="reply-item" data-comment-id="${escapeHtml(reply.id)}">
        <div class="comment-top"><div><strong>${reply.role === "admin" ? "♛ " : ""}${escapeHtml(reply.nama)}</strong>${reply.role === "admin" ? '<small class="admin-role-label">(ADMIN)</small>' : ""}${reply.edited ? '<small class="edited-label">(edited)</small>' : ""}</div><span>${escapeHtml(reply.tanggal)}</span></div>
        <p>${escapeHtml(reply.komentar)}</p>
        <button type="button" class="comment-menu-toggle" aria-label="Opsi komentar">&#8230;</button>
        <div class="comment-actions" hidden><button type="button" data-admin-comment-action="reply"><i class="fa-solid fa-reply"></i> Balas</button>${reply.nisn === adminConfig.username ? '<button type="button" data-admin-comment-action="delete"><i class="fa-solid fa-trash"></i> Hapus komentar saya</button>' : reply.role !== "admin" ? '<button type="button" data-admin-comment-action="delete"><i class="fa-solid fa-trash"></i> Hapus komentar siswa</button>' : ""}</div>
        <form class="reply-form" hidden><textarea rows="2" placeholder="@${escapeHtml(reply.nama)} tulis balasan..." required></textarea><button type="submit" class="primary-btn">Kirim balasan</button></form>
        ${replies(reply.id).length ? `<div class="nested-replies">${replies(reply.id).map(renderReply).join("")}</div>` : ""}
    </div>`;
    const roots = comments.filter((comment) => !comment.parentId);
    list.innerHTML = roots.length ? roots.map((comment) => {
        const isAdmin = comment.role === "admin" || comment.nisn === adminConfig.username;
        return `<article class="comment-item admin-comment-item" data-comment-id="${escapeHtml(comment.id)}">
            <div class="comment-top"><div><strong>${isAdmin ? "♛ " : ""}${escapeHtml(comment.nama)}</strong>${isAdmin ? '<small class="admin-role-label">(ADMIN)</small>' : ""}${comment.edited ? '<small class="edited-label">(edited)</small>' : ""}</div><span>${escapeHtml(comment.tanggal)}</span></div>
            <p>${escapeHtml(comment.komentar)}</p>
            <button type="button" class="comment-menu-toggle" aria-label="Opsi komentar">&#8230;</button>
            <div class="comment-actions" hidden><button type="button" data-admin-comment-action="reply"><i class="fa-solid fa-reply"></i> Balas</button>${comment.nisn === adminConfig.username ? '<button type="button" data-admin-comment-action="delete"><i class="fa-solid fa-trash"></i> Hapus komentar saya</button>' : !isAdmin ? '<button type="button" data-admin-comment-action="delete"><i class="fa-solid fa-trash"></i> Hapus komentar siswa</button>' : ""}</div>
            ${countReplies(comment.id) ? `<button type="button" class="replies-toggle" data-admin-comment-action="toggle-replies"><i class="fa-solid fa-comments"></i> ${countReplies(comment.id)} balasan</button>` : ""}
            <div class="reply-list" hidden>${replies(comment.id).map(renderReply).join("")}</div>
            <form class="reply-form" hidden><textarea rows="2" placeholder="@${escapeHtml(comment.nama)} tulis balasan..." required></textarea><button type="submit" class="primary-btn">Kirim balasan</button></form>
        </article>`;
    }).join("") : '<p class="empty-comment">Belum ada komentar untuk tugas ini.</p>';
}

async function refreshReports() {
    try {
        const reports = await callApi("/api/reports", { headers: {} });
        localStorage.setItem("taskCenterReports", JSON.stringify(reports));
        renderReports(reports);
        renderPunishedStudents();
    } catch { renderReports([]); }
}

function renderReports(reports = JSON.parse(localStorage.getItem("taskCenterReports") || "[]")) {
    const list = $("reportList");
    if (!list) return;
    const pending = reports.filter((report) => !report.status || report.status === "pending");
    list.innerHTML = pending.length ? pending.map((report) => `<article class="report-card" data-report-id="${escapeHtml(report.id)}"><div class="report-card-head"><strong>${escapeHtml(report.komentar?.nama || "Siswa")}</strong><span>${escapeHtml(report.tanggal || "-")}</span></div><p class="report-quote">“${escapeHtml(report.komentar?.komentar || "") }”</p><p><b>Pelapor:</b> ${escapeHtml(report.pelapor?.nama || "-")} <span class="report-reason"><b>Alasan:</b> ${escapeHtml(report.alasan)}</span></p><div class="report-actions"><button type="button" class="report-accept" data-report-action="accept">Terima laporan</button><button type="button" class="report-reject" data-report-action="reject">Tolak laporan</button></div></article>`).join("") : '<p class="empty-comment">Belum ada laporan baru.</p>';
}

function renderPunishedStudents() {
    const list = $("punishedStudentList");
    if (!list) return;
    const punished = Object.entries(database.students).filter(([, student]) => student.punishment);
    list.innerHTML = punished.length ? punished.map(([nisn, student]) => `<label class="punished-student"><input type="checkbox" value="${nisn}"><span>${escapeHtml(student.name)} <em class="punishment-${student.punishment}">(${student.punishment === "mute" ? "Mute" : "Banned"})</em><small>${nisn}</small></span></label>`).join("") : '<p class="empty-comment">Belum ada siswa yang terkena hukuman.</p>';
    syncPunishmentButton();
}

function syncPunishmentButton() {
    const button = $("removePunishments");
    const list = $("punishedStudentList");
    if (button) button.disabled = !list || !list.querySelector("input[type=checkbox]:checked");
}

function saveCommentList(comments) {
    localStorage.setItem(COMMENT_KEY, JSON.stringify(comments));
    renderComments();
}

function openReport(comment) {
    $("reportForm").dataset.comment = JSON.stringify(comment);
    $("reportedCommentText").textContent = `“${comment.komentar}” oleh ${comment.nama}`;
    $("reportReason").value = "";
    $("otherReason").value = "";
    $("otherReasonLabel").hidden = true;
    $("report-modal").classList.add("open");
    $("report-modal").setAttribute("aria-hidden", "false");
}

function closeReport() {
    $("report-modal").classList.remove("open");
    $("report-modal").setAttribute("aria-hidden", "true");
}

function getStudentName(nisn) {
    return database?.students?.[nisn]?.name || "Siswa";
}

function getStudentPunishment(nisn) {
    const student = database?.students?.[nisn];
    if (!student?.punishment) return null;
    if (student.punishment === "mute" && Date.now() - Date.parse(student.punishmentStartedAt || 0) >= 24 * 60 * 60 * 1000) {
        delete student.punishment;
        return null;
    }
    return student.punishment;
}

function canComment(nisn = currentStudent) {
    const punishment = getStudentPunishment(nisn);
    if (punishment === "mute") { showToast("Kamu sedang mute selama 24 jam.", "error"); return false; }
    if (punishment === "banned") { showToast("Akun kamu dilarang berkomentar.", "error"); return false; }
    return true;
}

function getSubmission(taskId) {
    const stored = database.submissions[currentStudent]?.[taskId] || { status: "Belum Selesai", file: null };
    if (!uploadInProgress || uploadInProgress.taskId !== taskId) return stored;
    return {
        ...stored,
        file: {
            ...(stored.file || {}),
            name: uploadInProgress.fileName,
            type: uploadInProgress.fileType,
            data: uploadInProgress.previewUrl,
            uploading: true
        }
    };
}

function renderTasks() {
    const list = $("taskList");
    if (!list || !currentSubject) return;
    list.innerHTML = "";
    currentSubject.tasks.forEach((task, index) => {
        const submission = getSubmission(task.id);
        const card = document.createElement("button");
        card.className = "task-card task-card-button";
        card.type = "button";
        card.innerHTML = `<span class="task-number">TUGAS ${String(index + 1).padStart(2, "0")}</span><h3>${task.title}</h3><p class="deadline"><i class="fa-regular fa-calendar"></i> Deadline: ${task.deadline}</p><span class="task-status ${submission.status === "Selesai" ? "completed" : "unfinished"}">${submission.status}</span>${submission.file ? `<span class="file-chip"><i class="fa-regular fa-image"></i> ${submission.file.name}</span>` : ""}`;
        card.addEventListener("click", () => openTask(task.id));
        list.appendChild(card);
    });
}

function openTask(taskId) {
    currentTask = currentSubject.tasks.find((task) => task.id === taskId);
    $("detailIcon").textContent = currentSubject.icon;
    $("detailSubjectLabel").textContent = currentSubject.name;
    $("detailTitle").textContent = currentTask.title;
    $("detailDeadline").textContent = currentTask.deadline;
    renderTaskDetail();
    renderComments();
    setPage("task-detail-page");
    refreshComments();
}

function renderTaskDetail() {
    if (!currentTask) return;
    const submission = getSubmission(currentTask.id);
    const completed = submission.status === "Selesai";
    const isUploading = uploadInProgress && uploadInProgress.taskId === currentTask.id;
    $("detailStatus").textContent = submission.status;
    $("detailStatus").className = `task-status ${completed ? "completed" : "unfinished"}`;

    if (submission.file) {
        $("uploadInfo").innerHTML = `<button type="button" class="file-link"><i class="fa-regular fa-image"></i> ${submission.file.name}</button>`;
    } else {
        $("uploadInfo").innerHTML = "Belum ada file dipilih.";
    }

    if (!completed && submission.file) {
        $("uploadInfo").innerHTML += `<button type="button" class="remove-file-btn" id="removeFileBtn"><i class="fa-solid fa-trash"></i> Hapus file</button>`;
    }

    $("uploadPanel").classList.toggle("uploading", isUploading);
    $("finishTaskBtn").disabled = false;
    $("finishTaskBtn").style.display = completed ? "none" : "inline-block";
    $("cancelTaskBtn").style.display = completed ? "inline-block" : "none";
}

function resetUploadInputs() {
    $("cameraInput").value = "";
    $("fileInput").value = "";
}

function normalizeStudentName(name) {
    return String(name || "Siswa")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-");
}

function generateRenamedFile(file, studentName = "Siswa") {
    const extension = (file.name.split(".").pop() || "jpg").toLowerCase();
    const cleanName = normalizeStudentName(studentName) || "siswa";
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    return `${cleanName}(${stamp}).${extension}`;
}

function saveUpload(file) {
    if (!currentStudent || !currentTask) return;

    const taskId = currentTask.id;
    const studentName = getStudentName(currentStudent);
    const renamedFile = generateRenamedFile(file, studentName);
    const previewUrl = URL.createObjectURL(file);
    uploadInProgress = { taskId, fileName: renamedFile, fileType: file.type || "image/*", previewUrl };
    renderTaskDetail();

    const reader = new FileReader();
    reader.onload = () => {
        database.submissions[currentStudent] ||= {};
        const previous = database.submissions[currentStudent][taskId] || { status: "Belum Selesai", file: null };

        database.submissions[currentStudent][taskId] = {
            ...previous,
            file: {
                name: renamedFile,
                type: file.type || "image/*",
                data: reader.result,
                storagePath: `database/image/${slugify(currentSubject.name)}/${renamedFile}`
            }
        };

        callApi("/api/upload", {
            method: "POST",
            body: JSON.stringify({
                subject: currentSubject.name,
                fileName: renamedFile,
                data: reader.result
            })
        }).then((result) => {
            database.submissions[currentStudent][taskId].file.data = `/${result.storagePath}`;
            saveDatabase(database);
            if (uploadInProgress && uploadInProgress.taskId === taskId) URL.revokeObjectURL(uploadInProgress.previewUrl);
            uploadInProgress = null;
            resetUploadInputs();
            renderTaskDetail();
            renderTasks();
            showToast("File berhasil disimpan ke database.");
        }).catch((error) => {
            if (uploadInProgress && uploadInProgress.taskId === taskId) URL.revokeObjectURL(uploadInProgress.previewUrl);
            uploadInProgress = null;
            resetUploadInputs();
            renderTaskDetail();
            showToast(error.message, "error");
        });
    };

    reader.onerror = () => {
        if (uploadInProgress && uploadInProgress.taskId === taskId) URL.revokeObjectURL(uploadInProgress.previewUrl);
        uploadInProgress = null;
        resetUploadInputs();
        renderTaskDetail();
        showToast("Upload gagal, silakan coba lagi.", "error");
    };

    reader.readAsDataURL(file);
}

async function finishTask() {
    if (!currentStudent || !currentTask) return;
    const submission = getSubmission(currentTask.id);

    if (submission.status === "Selesai") {
        showToast("Tugas ini sudah selesai.", "info");
        return;
    }

    if (!await confirmAction("Status tugas akan diubah menjadi selesai.", "Tandai tugas sebagai selesai?", "Ya, tandai selesai")) return;

    database.submissions[currentStudent] ||= {};
    database.submissions[currentStudent][currentTask.id] = { ...submission, status: "Selesai" };
    saveDatabase(database);
    renderTaskDetail();
    renderTasks();
    showToast("Tugas berhasil ditandai selesai.");
}

function showDashboard(nisn) {
    currentStudent = nisn;
    database = getDatabase();
    const student = database.students[nisn];
    $("dashboardName").textContent = student.name;
    $("dashboardNisn").textContent = "KEY: " + nisn;
    setPage("dashboard-page");
    renderSubjects();
}

function renderSubjects() {
    const list = $("subjectList");
    list.innerHTML = "";
    database.subjects.forEach((subject) => {
        const card = document.createElement("div");
        card.className = "subject-card";
        card.innerHTML = `<div class="subject-icon">${subject.icon}</div><div class="subject-info"><strong>${subject.name}</strong><small>${subject.tasks.length} Tugas</small></div><div class="arrow">›</div>`;
        card.addEventListener("click", () => openSubject(subject.id));
        list.appendChild(card);
    });
}

function openSubject(subjectId) {
    currentSubject = database.subjects.find((subject) => subject.id === subjectId);
    $("taskIcon").textContent = currentSubject.icon;
    $("taskSubject").textContent = currentSubject.name;
    setPage("task-page");
    renderTasks();
}

function showAdmin() {
    database = getDatabase();
    setPage("admin-page");
    renderStudentList();
    renderAdminSubjects();
    populateSubjectOptions();
    refreshReports();
}

function renderStudentList() {
    $("studentList").innerHTML = Object.entries(database.students).map(([nisn, student]) => `<div class="student-row"><span><strong>${student.name}</strong><small>${nisn}</small></span><button class="delete-btn" data-delete-student="${nisn}" title="Hapus siswa"><i class="fa-solid fa-trash"></i></button></div>`).join("");
}

function populateSubjectOptions() {
    $("taskSubjectName").innerHTML = `<option value="" disabled selected>Pilih mata pelajaran</option>${database.subjects.map((subject) => `<option value="${subject.id}">${subject.name}</option>`).join("")}`;
}

function renderAdminSubjects() {
    $("adminSubjectList").innerHTML = database.subjects.map((subject) => `<button type="button" class="subject-card admin-subject-card" data-admin-subject="${subject.id}"><span class="subject-icon">${subject.icon}</span><span class="subject-info"><strong>${subject.name}</strong><small>${subject.tasks.length} Tugas</small></span><span class="arrow">›</span></button>`).join("");
}

function openAdminSubject(subjectId) {
    currentSubject = database.subjects.find((subject) => subject.id === subjectId);
    $("adminTaskIcon").textContent = currentSubject.icon;
    $("adminTaskSubject").textContent = currentSubject.name;
    $("adminTaskList").innerHTML = currentSubject.tasks.length ? currentSubject.tasks.map((task, index) => `<div class="task-card admin-task-card"><button type="button" class="admin-task-open" data-admin-task="${task.id}"><span class="task-number">TUGAS ${String(index + 1).padStart(2, "0")}</span><h3>${task.title}</h3><p class="deadline"><i class="fa-regular fa-calendar"></i> Deadline: ${task.deadline}</p></button><button type="button" class="delete-task-btn" data-delete-task="${task.id}"><i class="fa-solid fa-trash"></i> Hapus tugas</button></div>`).join("") : `<div class="empty-task"><h3>Belum ada tugas</h3></div>`;
    setPage("admin-task-page");
}

function openAdminTask(taskId) {
    currentTask = currentSubject.tasks.find((task) => task.id === taskId);
    $("adminDetailIcon").textContent = currentSubject.icon;
    $("adminDetailSubjectLabel").textContent = currentSubject.name;
    $("adminDetailTitle").textContent = currentTask.title;
    $("adminDetailDeadline").textContent = currentTask.deadline;
    $("adminCommentAuthor").textContent = adminConfig.username;
    renderAdminComments();
    setPage("admin-task-detail-page");
    refreshComments().then(renderAdminComments);
}

function backToAdminTasks() { openAdminSubject(currentSubject.id); }

function backToAdminSubjects() { showAdmin(); }

function showStudentLogin() {
    $("loginForm").hidden = false;
    $("adminLoginForm").hidden = true;
    $("loginError").textContent = "";
    $("adminLoginError").textContent = "";
}

function showAdminLogin() {
    $("loginForm").hidden = true;
    $("adminLoginForm").hidden = false;
    $("loginError").textContent = "";
    $("adminLoginError").textContent = "";
}

$("loginForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const nisn = $("nisn").value.trim();

    if (database.students[nisn]) {
        localStorage.setItem(SESSION_KEY, JSON.stringify({ role: "student", nisn }));
        showDashboard(nisn);
        return;
    }

    $("loginError").textContent = "NISN tidak ditemukan.";
});

$("adminLoginForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const username = $("adminUsername").value.trim();
    const password = $("adminPassword").value.trim();

    if (username === adminConfig.username && password === adminConfig.password) {
        localStorage.setItem(SESSION_KEY, JSON.stringify({ role: "admin" }));
        showAdmin();
        return;
    }

    $("adminLoginError").textContent = "Username atau password admin tidak valid.";
});

$("adminLoginLink").addEventListener("click", showAdminLogin);
$("studentLoginLink").addEventListener("click", showStudentLogin);

$("studentForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const name = $("studentName").value.trim();
    const birthDate = $("studentBirthDate").value;
    const code = encryptStudentCode(name, birthDate);
    if (database.students[code] || code === ADMIN_NISN) { $("adminMessage").textContent = "Kode siswa sudah digunakan, coba data lain."; return; }
    const button = event.target.querySelector("button[type=submit]");
    button.disabled = true;
    callApi("/api/students", { method: "POST", body: JSON.stringify({ nisn: code, name, birthDate }) })
        .then((students) => {
            database.students = students;
            saveDatabase(database);
            event.target.reset();
            renderStudentList();
            $("generatedStudentCode").innerHTML = `<span>Kode login siswa</span><strong>${code}</strong><button type="button" id="copyStudentCode" class="copy-code-btn"><i class="fa-regular fa-copy"></i> Salin</button>`;
            $("generatedStudentCode").hidden = false;
            $("copyStudentCode").addEventListener("click", () => navigator.clipboard.writeText(code).then(() => showToast("Kode berhasil disalin.")));
            $("adminMessage").textContent = "Profil siswa berhasil disimpan ke siswa.json.";
        })
        .catch((error) => { $("adminMessage").textContent = error.message; })
        .finally(() => { button.disabled = false; });
});

$("taskForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const subject = database.subjects.find((item) => item.id === $("taskSubjectName").value);
    if (!subject) return;
    subject.tasks.push({ id: crypto.randomUUID(), title: $("newTaskTitle").value.trim(), deadline: new Date($("newTaskDeadline").value).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" }) });
    saveDatabase(database); event.target.reset(); $("adminMessage").textContent = "Tugas berhasil ditambahkan untuk semua siswa terdaftar.";
    renderAdminSubjects(); populateSubjectOptions();
});

$("studentList").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-delete-student]");
    if (!button) return;
    if (!await confirmAction("Profil, submission, dan file tugas siswa ini akan dihapus permanen.", "Hapus profil siswa?", "Ya, hapus")) return;
    const nisn = button.dataset.deleteStudent;
    const storagePaths = Object.values(database.submissions[nisn] || {}).map((submission) => submission.file?.storagePath).filter(Boolean);
    button.disabled = true;
    callApi(`/api/students/${encodeURIComponent(nisn)}`, { method: "DELETE", body: JSON.stringify({ storagePaths }) })
        .then((students) => {
            database.students = students;
            delete database.submissions[nisn];
            saveDatabase(database);
            renderStudentList();
            $("adminMessage").textContent = "Profil siswa dan file tugasnya berhasil dihapus.";
        })
        .catch((error) => { button.disabled = false; $("adminMessage").textContent = error.message; });
});

$("adminSubjectList").addEventListener("click", (event) => {
    const card = event.target.closest("[data-admin-subject]");
    if (card) openAdminSubject(card.dataset.adminSubject);
});

$("adminTaskList").addEventListener("click", async (event) => {
    const openButton = event.target.closest("[data-admin-task]");
    if (openButton) {
        openAdminTask(openButton.dataset.adminTask);
        return;
    }
    const button = event.target.closest("[data-delete-task]");
    if (!button) return;
    if (!await confirmAction("Tugas, komentar, dan semua file siswa terkait akan dihapus permanen.", "Hapus tugas?", "Ya, hapus tugas")) return;
    const task = currentSubject.tasks.find((item) => item.id === button.dataset.deleteTask);
    const storagePaths = Object.values(database.submissions || {}).flatMap((studentSubmissions) => [studentSubmissions[task.id]?.file?.storagePath]).filter(Boolean);
    button.disabled = true;
    callApi("/api/tasks", { method: "DELETE", body: JSON.stringify({ taskId: task.id, taskTitle: task.title, storagePaths }) })
        .then((result) => {
            currentSubject.tasks = currentSubject.tasks.filter((item) => item.id !== task.id);
            Object.values(database.submissions || {}).forEach((studentSubmissions) => delete studentSubmissions[task.id]);
            saveDatabase(database);
            localStorage.setItem(COMMENT_KEY, JSON.stringify(result.comments));
            openAdminSubject(currentSubject.id);
        })
        .catch((error) => { button.disabled = false; showToast(error.message, "error"); });
});

$("cameraInput").addEventListener("change", (event) => event.target.files[0] && saveUpload(event.target.files[0]));
$("fileInput").addEventListener("change", (event) => event.target.files[0] && saveUpload(event.target.files[0]));
$("finishTaskBtn").addEventListener("click", finishTask);
$("cancelTaskBtn").addEventListener("click", async () => {
    if (!currentStudent || !currentTask) return;
    if (!await confirmAction("Status akan kembali menjadi belum selesai dan file yang sudah tersimpan ikut dihapus.", "Batalkan tugas?", "Ya, batalkan")) return;
    const submission = getSubmission(currentTask.id);
    const clearSubmission = () => {
        database.submissions[currentStudent][currentTask.id] = { ...submission, file: null, status: "Belum Selesai" };
        saveDatabase(database); renderTaskDetail(); renderTasks(); showToast("Tugas dibatalkan dan file berhasil dihapus.");
    };
    if (submission.file?.storagePath) {
        callApi("/api/upload", { method: "DELETE", body: JSON.stringify({ storagePath: submission.file.storagePath }) })
            .then(clearSubmission)
            .catch((error) => showToast(error.message, "error"));
    } else clearSubmission();
});
$("uploadInfo").addEventListener("click", async (event) => {
    const removeButton = event.target.closest("#removeFileBtn");
    if (removeButton) {
        if (!currentStudent || !currentTask) return;
        if (!await confirmAction("File tugas yang sudah tersimpan tidak dapat dipulihkan setelah dihapus.", "Hapus file tugas?", "Ya, hapus file")) return;
        const submission = getSubmission(currentTask.id);
        const clearFile = () => {
            database.submissions[currentStudent][currentTask.id] = { ...submission, file: null, status: "Belum Selesai" };
            saveDatabase(database); resetUploadInputs(); renderTaskDetail(); renderTasks(); showToast("File berhasil dihapus.");
        };
        if (submission.file?.storagePath) {
            callApi("/api/upload", { method: "DELETE", body: JSON.stringify({ storagePath: submission.file.storagePath }) })
                .then(clearFile)
                .catch((error) => showToast(error.message, "error"));
        } else clearFile();
        return;
    }

    const file = getSubmission(currentTask.id).file;
    if (!file) return;
    $("previewImage").src = file.data; $("previewFileName").textContent = file.name; $("preview-modal").classList.add("open"); $("preview-modal").setAttribute("aria-hidden", "false");
});
$("closePreview").addEventListener("click", closePreview);
$("preview-modal").addEventListener("click", (event) => event.target === $("preview-modal") && closePreview());
function closePreview() { $("preview-modal").classList.remove("open"); $("preview-modal").setAttribute("aria-hidden", "true"); $("previewImage").removeAttribute("src"); }
function backToDashboard() { setPage("dashboard-page"); renderSubjects(); }
function backToTasks() { setPage("task-page"); renderTasks(); }
function logout() { localStorage.removeItem(SESSION_KEY); currentStudent = null; $("nisn").value = ""; $("adminUsername").value = ""; $("adminPassword").value = ""; showStudentLogin(); setPage("login-page"); }

$("commentForm").addEventListener("submit", (event) => {
    event.preventDefault();
    if (!currentStudent || !currentTask) return;
    if (!canComment()) return;

    const text = $("commentInput").value.trim();
    if (!text) {
        showToast("Komentar tidak boleh kosong.", "error");
        return;
    }

    const comment = {
        taskId: currentTask.id,
        taskTitle: currentTask.title,
        nisn: currentStudent,
        nama: getStudentName(currentStudent),
        tanggal: formatCommentTimestamp(),
        komentar: text
    };

    const submitButton = event.target.querySelector("button[type=submit]");
    submitButton.disabled = true;
    callApi("/api/comments", { method: "POST", body: JSON.stringify(comment) })
        .then((comments) => {
            localStorage.setItem(COMMENT_KEY, JSON.stringify(comments));
            $("commentInput").value = "";
            renderComments();
            showToast("Komentar berhasil disimpan.");
        })
        .catch((error) => showToast(error.message, "error"))
        .finally(() => { submitButton.disabled = false; });
});

$("adminCommentForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const text = $("adminCommentInput").value.trim();
    if (!text || !currentTask) return;
    const button = event.target.querySelector("button[type=submit]");
    const comment = { taskId: currentTask.id, taskTitle: currentTask.title, nisn: adminConfig.username, nama: adminConfig.username, role: "admin", tanggal: formatCommentTimestamp(), komentar: text };
    button.disabled = true;
    callApi("/api/comments", { method: "POST", body: JSON.stringify(comment) })
        .then((comments) => { localStorage.setItem(COMMENT_KEY, JSON.stringify(comments)); $("adminCommentInput").value = ""; renderAdminComments(); showToast("Komentar admin berhasil disimpan."); })
        .catch((error) => showToast(error.message, "error"))
        .finally(() => { button.disabled = false; });
});


$("commentList").addEventListener("click", async (event) => {
    const menuToggle = event.target.closest(".comment-menu-toggle");
    if (menuToggle) {
        const actions = menuToggle.nextElementSibling;
        actions.hidden = !actions.hidden;
        menuToggle.classList.toggle("active", !actions.hidden);
        return;
    }
    const actionButton = event.target.closest("[data-comment-action]");
    if (!actionButton) return;
    const item = actionButton.closest("[data-comment-id]");
    const comments = getComments(currentTask.id);
    const comment = comments.find((entry) => entry.id === item.dataset.commentId);
    if (!comment) return;
    const action = actionButton.dataset.commentAction;

    if (action === "toggle-replies") {
        const replyList = item.querySelector(".reply-list");
        replyList.hidden = !replyList.hidden;
        return;
    }
    if (action === "reply") {
        const form = item.querySelector(".reply-form");
        form.hidden = !form.hidden;
        if (!form.hidden) form.querySelector("textarea").focus();
        return;
    }
    if (action === "report") return openReport(comment);
    if (action === "delete") {
        if (!await confirmAction("Komentar ini beserta seluruh balasannya akan dihapus.", "Hapus komentar?", "Ya, hapus")) return;
        callApi(`/api/comments/${encodeURIComponent(comment.id)}`, { method: "DELETE" })
            .then(saveCommentList)
            .then(() => showToast("Komentar berhasil dihapus."))
            .catch((error) => showToast(error.message, "error"));
    }
    if (action === "edit") {
        const updatedText = prompt("Edit komentar:", comment.komentar);
        if (!updatedText?.trim() || updatedText.trim() === comment.komentar) return;
        callApi(`/api/comments/${encodeURIComponent(comment.id)}`, { method: "PATCH", body: JSON.stringify({ komentar: updatedText }) })
            .then(saveCommentList)
            .then(() => showToast("Komentar berhasil diedit."))
            .catch((error) => showToast(error.message, "error"));
    }
});

$("commentList").addEventListener("submit", (event) => {
    if (!event.target.matches(".reply-form")) return;
    event.preventDefault();
    if (!canComment()) return;
    const parent = event.target.closest("[data-comment-id]");
    const parentComment = getComments(currentTask.id).find((comment) => comment.id === parent.dataset.commentId);
    const text = event.target.querySelector("textarea").value.trim();
    if (!text || !parentComment) return;
    const reply = {
        taskId: currentTask.id,
        taskTitle: currentTask.title,
        parentId: parentComment.id,
        nisn: currentStudent,
        nama: getStudentName(currentStudent),
        tanggal: formatCommentTimestamp(),
        komentar: `@${parentComment.nama} ${text.replace(/^@[^ ]+\s*/, "")}`
    };
    const button = event.target.querySelector("button[type=submit]");
    button.disabled = true;
    callApi("/api/comments", { method: "POST", body: JSON.stringify(reply) })
        .then(saveCommentList)
        .then(() => showToast("Balasan berhasil dikirim."))
        .catch((error) => showToast(error.message, "error"))
        .finally(() => { button.disabled = false; });
});

$("adminCommentList").addEventListener("click", async (event) => {
    const menuToggle = event.target.closest(".comment-menu-toggle");
    if (menuToggle) {
        const actions = menuToggle.nextElementSibling;
        actions.hidden = !actions.hidden;
        menuToggle.classList.toggle("active", !actions.hidden);
        return;
    }

    const actionButton = event.target.closest("[data-admin-comment-action]");
    if (!actionButton) return;
    const item = actionButton.closest("[data-comment-id]");
    const comment = getComments(currentTask.id).find((entry) => entry.id === item.dataset.commentId);
    if (!comment) return;
    const action = actionButton.dataset.adminCommentAction;
    if (action === "toggle-replies") {
        const replyList = item.querySelector(".reply-list");
        replyList.hidden = !replyList.hidden;
        return;
    }
    if (action === "reply") {
        const form = item.querySelector(".reply-form");
        form.hidden = !form.hidden;
        if (!form.hidden) form.querySelector("textarea").focus();
        return;
    }
    const isOwnAdminComment = comment.nisn === adminConfig.username;
    const isStudentComment = comment.role !== "admin" && !isOwnAdminComment;
    if (action !== "delete" || (!isOwnAdminComment && !isStudentComment)) return;
    const deleteMessage = isOwnAdminComment ? "Komentar admin ini beserta seluruh balasannya akan dihapus." : "Komentar siswa ini beserta seluruh balasannya akan dihapus.";
    const deleteTitle = isOwnAdminComment ? "Hapus komentar saya?" : "Hapus komentar siswa?";
    if (!await confirmAction(deleteMessage, deleteTitle, "Ya, hapus")) return;
    callApi(`/api/comments/${encodeURIComponent(comment.id)}`, { method: "DELETE" })
        .then((comments) => {
            localStorage.setItem(COMMENT_KEY, JSON.stringify(comments));
            renderAdminComments();
            showToast(isOwnAdminComment ? "Komentar admin berhasil dihapus." : "Komentar siswa berhasil dihapus.");
        })
        .catch((error) => showToast(error.message, "error"));
});

$("adminCommentList").addEventListener("submit", (event) => {
    if (!event.target.matches(".reply-form")) return;
    event.preventDefault();
    const item = event.target.closest("[data-comment-id]");
    const parentComment = getComments(currentTask.id).find((comment) => comment.id === item.dataset.commentId);
    const text = event.target.querySelector("textarea").value.trim();
    if (!parentComment || !text) return;
    const reply = { taskId: currentTask.id, taskTitle: currentTask.title, parentId: parentComment.id, nisn: adminConfig.username, nama: adminConfig.username, role: "admin", tanggal: formatCommentTimestamp(), komentar: `@${parentComment.nama} ${text.replace(/^@[^ ]+\s*/, "")}` };
    const button = event.target.querySelector("button[type=submit]");
    button.disabled = true;
    callApi("/api/comments", { method: "POST", body: JSON.stringify(reply) })
        .then((comments) => { localStorage.setItem(COMMENT_KEY, JSON.stringify(comments)); renderAdminComments(); showToast("Balasan admin berhasil dikirim."); })
        .catch((error) => showToast(error.message, "error"))
        .finally(() => { button.disabled = false; });
});

$("refreshReports").addEventListener("click", refreshReports);
$("reportList").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-report-action]");
    if (!button) return;
    const report = JSON.parse(JSON.stringify(JSON.parse(localStorage.getItem("taskCenterReports") || "[]").find((item) => item.id === button.closest("[data-report-id]").dataset.reportId)));
    if (!report) return;
    if (button.dataset.reportAction === "reject") {
        try {
            const reports = await callApi(`/api/reports/${encodeURIComponent(report.id)}`, { method: "PATCH", body: JSON.stringify({ status: "rejected" }) }).then((result) => result.reports);
            localStorage.setItem("taskCenterReports", JSON.stringify(reports));
            renderReports(reports);
            showToast("Laporan ditolak.");
        } catch (error) { showToast(error.message, "error"); }
        return;
    }
    activeReport = report;
    $("punishmentForm").reset();
    $("punishment-modal").classList.add("open");
    $("punishment-modal").setAttribute("aria-hidden", "false");
});

function closePunishment() {
    $("punishment-modal").classList.remove("open");
    $("punishment-modal").setAttribute("aria-hidden", "true");
    activeReport = null;
}

$("punishmentForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const punishment = event.target.elements.punishment.value;
    if (!activeReport || !punishment) return;
    try {
        const result = await callApi(`/api/reports/${encodeURIComponent(activeReport.id)}`, { method: "PATCH", body: JSON.stringify({ status: "accepted", punishment }) });
        localStorage.setItem("taskCenterReports", JSON.stringify(result.reports));
        database.students = result.students;
        saveDatabase(database);
        closePunishment();
        renderReports(result.reports);
        renderPunishedStudents();
        showToast("Laporan diterima dan hukuman diterapkan.");
    } catch (error) { showToast(error.message, "error"); }
});

$("closePunishment").addEventListener("click", closePunishment);
$("punishment-modal").addEventListener("click", (event) => event.target === $("punishment-modal") && closePunishment());
$("punishedStudentList").addEventListener("change", syncPunishmentButton);
$("punishedStudentList").addEventListener("click", () => setTimeout(syncPunishmentButton, 0));
$("removePunishments").addEventListener("click", async () => {
    const nisns = [...$("punishedStudentList").querySelectorAll("input:checked")].map((input) => input.value);
    if (!nisns.length) return;
    if (!await confirmAction("Status mute atau banned siswa terpilih akan dihapus.", "Hapus hukuman?", "Ya, hapus hukuman")) return;
    try {
        const students = await callApi("/api/students/punishments", { method: "PATCH", body: JSON.stringify({ nisns }) });
        database.students = students;
        saveDatabase(database);
        renderPunishedStudents();
        showToast("Hukuman siswa berhasil dihapus.");
    } catch (error) { showToast(error.message, "error"); }
});

$("reportReason").addEventListener("change", (event) => {
    $("otherReasonLabel").hidden = event.target.value !== "other";
    $("otherReason").required = event.target.value === "other";
});
$("reportForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const comment = JSON.parse(event.target.dataset.comment || "null");
    const session = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
    const reporterNisn = currentStudent || session?.nisn;
    const selectedReason = $("reportReason").value;
    const reason = selectedReason === "other" ? $("otherReason").value.trim() : selectedReason;
    if (!comment || !reporterNisn || !reason) {
        showToast("Lengkapi alasan laporan terlebih dahulu.", "error");
        return;
    }
    const report = {
        comment: { ...comment, id: comment.id || `${comment.taskId || "comment"}-${Date.now()}` },
        pelapor: { nisn: reporterNisn, nama: getStudentName(reporterNisn) },
        alasan: reason,
        tanggal: formatCommentTimestamp()
    };
    const button = event.target.querySelector("button[type=submit]");
    button.disabled = true;
    callApi("/api/reports", { method: "POST", body: JSON.stringify(report) })
        .then(() => { closeReport(); showToast("Laporan berhasil dikirim."); })
        .catch((error) => showToast(error.message, "error"))
        .finally(() => { button.disabled = false; });
});

$("closeReport").addEventListener("click", closeReport);
$("report-modal").addEventListener("click", (event) => event.target === $("report-modal") && closeReport());
$("confirmCancel").addEventListener("click", () => closeConfirmation(false));
$("confirmAccept").addEventListener("click", () => closeConfirmation(true));
$("confirm-modal").addEventListener("click", (event) => event.target === $("confirm-modal") && closeConfirmation(false));
document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && $("confirm-modal").classList.contains("open")) closeConfirmation(false);
});

initConfig();
