const http = require("http");
const fs = require("fs");
const path = require("path");

const root = __dirname;
const commentsFile = path.join(root, "database", "komentar.json");
const reportsFile = path.join(root, "database", "report.json");
const studentsFile = path.join(root, "database", "siswa.json");
const mimeTypes = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp"
};

function readComments() {
    try { return JSON.parse(fs.readFileSync(commentsFile, "utf8")); }
    catch { return []; }
}

function readReports() {
    try { return JSON.parse(fs.readFileSync(reportsFile, "utf8")); }
    catch { return []; }
}

function writeReports(reports) { fs.writeFileSync(reportsFile, JSON.stringify(reports, null, 2) + "\n", "utf8"); }

function readStudents() {
    try { return JSON.parse(fs.readFileSync(studentsFile, "utf8")); }
    catch { return {}; }
}

function deleteStoredFiles(storagePaths = []) {
    const imageRoot = path.join(root, "database", "image");
    for (const storagePath of storagePaths) {
        const relativePath = String(storagePath || "").replace(/^\/+/, "");
        const filePath = path.normalize(path.join(root, relativePath));
        if (relativePath.startsWith("database/image/") && filePath.startsWith(imageRoot) && fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
}

function send(response, status, data, contentType = "application/json; charset=utf-8") {
    response.writeHead(status, { "Content-Type": contentType });
    response.end(Buffer.isBuffer(data) || typeof data === "string" ? data : JSON.stringify(data));
}

function readBody(request) {
    return new Promise((resolve, reject) => {
        let body = "";
        request.on("data", (chunk) => {
            body += chunk;
            if (body.length > 30 * 1024 * 1024) request.destroy(new Error("Payload terlalu besar."));
        });
        request.on("end", () => resolve(body));
        request.on("error", reject);
    });
}

const server = http.createServer(async (request, response) => {
    try {
        if (request.method === "GET" && request.url === "/api/comments") {
            return send(response, 200, readComments());
        }

        if (request.method === "GET" && request.url === "/api/students") {
            return send(response, 200, readStudents());
        }

        if (request.method === "GET" && request.url === "/api/reports") {
            return send(response, 200, readReports());
        }

        if (request.method === "POST" && request.url === "/api/students") {
            const student = JSON.parse(await readBody(request));
            if (!/^\d{10}$/.test(student.nisn) || !student.name?.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(student.birthDate || "")) return send(response, 400, { error: "Data siswa tidak valid." });
            const students = readStudents();
            if (students[student.nisn]) return send(response, 409, { error: "NISN sudah digunakan." });
            students[student.nisn] = { name: student.name.trim(), birthDate: student.birthDate };
            fs.writeFileSync(studentsFile, JSON.stringify(students, null, 2) + "\n", "utf8");
            return send(response, 200, students);
        }

        if (request.method === "DELETE" && request.url.startsWith("/api/students/")) {
            const nisn = decodeURIComponent(request.url.slice("/api/students/".length));
            const body = JSON.parse(await readBody(request) || "{}");
            const students = readStudents();
            if (!students[nisn]) return send(response, 404, { error: "Profil siswa tidak ditemukan." });
            delete students[nisn];
            deleteStoredFiles(body.storagePaths || []);
            fs.writeFileSync(studentsFile, JSON.stringify(students, null, 2) + "\n", "utf8");
            return send(response, 200, students);
        }

        if (request.method === "DELETE" && request.url === "/api/tasks") {
            const body = JSON.parse(await readBody(request) || "{}");
            deleteStoredFiles(body.storagePaths || []);
            const comments = readComments().filter((comment) => comment.taskTitle !== body.taskTitle && comment.taskId !== body.taskId);
            fs.writeFileSync(commentsFile, JSON.stringify(comments, null, 2) + "\n", "utf8");
            return send(response, 200, { deleted: true, comments });
        }

        if (request.method === "POST" && request.url === "/api/comments") {
            const comment = JSON.parse(await readBody(request));
            if (!comment.taskId || !comment.nisn || !comment.nama || !comment.komentar) {
                return send(response, 400, { error: "Data komentar belum lengkap." });
            }
            const student = readStudents()[comment.nisn];
            if (student?.punishment === "banned") return send(response, 403, { error: "Akun ini dilarang berkomentar." });
            if (student?.punishment === "mute" && Date.now() - Date.parse(student.punishmentStartedAt || 0) < 24 * 60 * 60 * 1000) return send(response, 403, { error: "Akun ini sedang mute selama 24 jam." });
            const comments = [...readComments(), { ...comment, id: comment.id || `${Date.now()}-${Math.random().toString(36).slice(2)}`, edited: false }];
            fs.writeFileSync(commentsFile, JSON.stringify(comments, null, 2) + "\n", "utf8");
            return send(response, 200, comments);
        }

        if (request.method === "PATCH" && request.url.startsWith("/api/reports/")) {
            const reportId = decodeURIComponent(request.url.slice("/api/reports/".length));
            const action = JSON.parse(await readBody(request));
            const reports = readReports();
            const report = reports.find((item) => item.id === reportId);
            if (!report) return send(response, 404, { error: "Laporan tidak ditemukan." });
            if (!["accepted", "rejected"].includes(action.status)) return send(response, 400, { error: "Status laporan tidak valid." });
            if (action.status === "accepted" && !["mute", "banned"].includes(action.punishment)) return send(response, 400, { error: "Pilih satu hukuman." });

            report.status = action.status;
            report.diprosesTanggal = new Date().toISOString();
            if (action.status === "accepted") {
                const targetNisn = report.komentar?.nisn;
                const students = readStudents();
                if (students[targetNisn]) {
                    students[targetNisn].punishment = action.punishment;
                    students[targetNisn].punishmentStartedAt = new Date().toISOString();
                    fs.writeFileSync(studentsFile, JSON.stringify(students, null, 2) + "\n", "utf8");
                }
                const comments = readComments().filter((comment) => comment.id !== report.komentar.id && comment.parentId !== report.komentar.id);
                fs.writeFileSync(commentsFile, JSON.stringify(comments, null, 2) + "\n", "utf8");
                report.aksi = action.punishment === "mute" ? "Mute selama 24 Jam" : "Banned permanent";
            }
            writeReports(reports);
            return send(response, 200, { reports, students: readStudents(), comments: readComments() });
        }

        if (request.method === "PATCH" && request.url === "/api/students/punishments") {
            const body = JSON.parse(await readBody(request));
            const students = readStudents();
            (body.nisns || []).forEach((nisn) => {
                if (students[nisn]) {
                    delete students[nisn].punishment;
                    delete students[nisn].punishmentStartedAt;
                }
            });
            fs.writeFileSync(studentsFile, JSON.stringify(students, null, 2) + "\n", "utf8");
            return send(response, 200, students);
        }

        if (request.method === "PATCH" && request.url.startsWith("/api/comments/")) {
            const commentId = decodeURIComponent(request.url.slice("/api/comments/".length));
            const update = JSON.parse(await readBody(request));
            const comments = readComments();
            const comment = comments.find((item) => item.id === commentId);
            if (!comment || !update.komentar?.trim()) return send(response, 404, { error: "Komentar tidak ditemukan." });
            comment.komentar = update.komentar.trim();
            comment.edited = true;
            fs.writeFileSync(commentsFile, JSON.stringify(comments, null, 2) + "\n", "utf8");
            return send(response, 200, comments);
        }

        if (request.method === "DELETE" && request.url.startsWith("/api/comments/")) {
            const commentId = decodeURIComponent(request.url.slice("/api/comments/".length));
            const comments = readComments();
            const remaining = comments.filter((item) => item.id !== commentId && item.parentId !== commentId);
            if (remaining.length === comments.length) return send(response, 404, { error: "Komentar tidak ditemukan." });
            fs.writeFileSync(commentsFile, JSON.stringify(remaining, null, 2) + "\n", "utf8");
            return send(response, 200, remaining);
        }

        if (request.method === "POST" && request.url === "/api/reports") {
            const report = JSON.parse(await readBody(request));
            const comment = report.comment || report.komentar;
            const reporter = report.pelapor || report.reporter;
            const reason = typeof report.alasan === "string" ? report.alasan.trim() : "";
            if (!comment || !reporter || !reason) return send(response, 400, { error: "Data laporan belum lengkap." });
            const normalizedComment = { ...comment, id: comment.id || `${comment.taskId || "comment"}-${Date.now()}` };
            const normalizedReporter = { nisn: reporter.nisn || reporter.key || "unknown", nama: reporter.nama || reporter.name || "Siswa" };
            const reports = [...readReports(), { ...report, komentar: normalizedComment, pelapor: normalizedReporter, alasan: reason, id: report.id || `${Date.now()}-${Math.random().toString(36).slice(2)}`, status: "pending", tanggal: report.tanggal || new Date().toISOString() }];
            writeReports(reports);
            return send(response, 200, reports);
        }

        if (request.method === "POST" && request.url === "/api/upload") {
            const upload = JSON.parse(await readBody(request));
            if (!upload.subject || !upload.fileName || !upload.data?.startsWith("data:")) {
                return send(response, 400, { error: "Data file belum lengkap." });
            }
            const safeSubject = upload.subject.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "mapel";
            const safeName = path.basename(upload.fileName).replace(/[^a-zA-Z0-9._()-]/g, "-");
            const match = upload.data.match(/^data:[^;]+;base64,(.+)$/);
            if (!match) return send(response, 400, { error: "Format gambar tidak valid." });
            const folder = path.join(root, "database", "image", safeSubject);
            fs.mkdirSync(folder, { recursive: true });
            fs.writeFileSync(path.join(folder, safeName), Buffer.from(match[1], "base64"));
            return send(response, 200, { storagePath: `database/image/${safeSubject}/${safeName}` });
        }

        if (request.method === "DELETE" && request.url === "/api/upload") {
            const upload = JSON.parse(await readBody(request));
            const relativePath = String(upload.storagePath || "").replace(/^\/+/, "");
            const filePath = path.normalize(path.join(root, relativePath));
            if (!relativePath.startsWith("database/image/") || !filePath.startsWith(path.join(root, "database", "image"))) {
                return send(response, 400, { error: "Lokasi file tidak valid." });
            }
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            return send(response, 200, { deleted: true });
        }

        const requestedPath = request.url === "/" ? "/index.html" : request.url;
        const filePath = path.normalize(path.join(root, requestedPath));
        if (!filePath.startsWith(root) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
            return send(response, 404, { error: "Not found" });
        }
        send(response, 200, fs.readFileSync(filePath), mimeTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream");
    } catch (error) {
        send(response, 500, { error: error.message || "Server error." });
    }
});


