const path = require("path");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "public")));

let users = []; 
// users: [{ id, name, role: "admin" | "user", selected: null | string }]

let adminSocketId = null;
let adminName = null;

function emitState() {
  io.emit("playersUpdate", {
    players: users.map(u => ({
      name: u.name,
      role: u.role,
      selected: u.selected
    })),
    admin: adminName ? { name: adminName } : null
  });
}

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // Her yeni bağlanana admin var mı bilgisi yolla
  socket.emit("adminStatus", { adminTaken: !!adminSocketId, adminName });

  socket.on("join", ({ name, role }) => {
    const cleanName = String(name || "").trim();
    let desiredRole = role === "admin" ? "admin" : "user";

    if (!cleanName) return;

    // admin zaten varsa, admin isteğini reddet -> user'a düşür
    if (desiredRole === "admin" && adminSocketId) {
      desiredRole = "user";
    }

    // aynı isimle tekrar giriş olmasın (istersen kaldırırız)
    if (users.some(u => u.name.toLowerCase() === cleanName.toLowerCase())) {
      socket.emit("joinError", { message: "Bu kullanıcı adı zaten kullanılıyor." });
      return;
    }

    // kullanıcı ekle
    users.push({ id: socket.id, name: cleanName, role: desiredRole, selected: null });

    // admin ataması
    if (desiredRole === "admin") {
      adminSocketId = socket.id;
      adminName = cleanName;
      io.emit("adminStatus", { adminTaken: true, adminName });
    } else {
      socket.emit("adminStatus", { adminTaken: !!adminSocketId, adminName });
    }

    emitState();
  });

  socket.on("selectCard", (value) => {
    const user = users.find(u => u.id === socket.id);
    if (!user) return;

    user.selected = value;
    emitState();
  });

  // ✅ SADECE ADMIN REVEAL ATABİLİR
  socket.on("reveal", () => {
    if (socket.id !== adminSocketId) return;

    // count hesabı: seçilenleri say
    const counts = {};
    for (const u of users) {
      if (u.selected != null) {
        counts[u.selected] = (counts[u.selected] || 0) + 1;
      }
    }
    io.emit("revealResults", counts);
  });

  // ✅ SADECE ADMIN NEW ROUND ATABİLİR
  socket.on("newRound", () => {
    if (socket.id !== adminSocketId) return;

    for (const u of users) u.selected = null;
    io.emit("clearSelections");
    emitState();
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);

    // admin çıktıysa admin boşalır
    if (socket.id === adminSocketId) {
      adminSocketId = null;
      adminName = null;
      io.emit("adminStatus", { adminTaken: false, adminName: null });
    }

    users = users.filter(u => u.id !== socket.id);
    emitState();
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running: http://localhost:${PORT}`);
});
