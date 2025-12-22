const path = require("path");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "public")));

let users = [];
// users: [{ id, name, role: "admin" | "user", selectedCard: null | string }]

let adminSocketId = null;
let adminName = null;
let revealed = false;

function resetRound() {
  revealed = false;
  for (const u of users) u.selectedCard = null;
}

function emitState() {
  io.emit("playersUpdate", {
    revealed,
    players: users.map(u => ({
      name: u.name,
      role: u.role,
      selected: !!u.selectedCard,           // ✅ tick için
      selectedCard: u.selectedCard || null  // ✅ reveal sonrası sayı için
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
      socket.emit("roleDowngraded", { message: "Admin already taken. You joined as User." });
    }

    // aynı isimle tekrar giriş olmasın (istersen kaldırırız)
    if (users.some(u => u.name.toLowerCase() === cleanName.toLowerCase())) {
      socket.emit("joinError", { message: "This username is already taken." });
      return;
    }

    // kullanıcı ekle
    users.push({ id: socket.id, name: cleanName, role: desiredRole, selectedCard: null });

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
    if (revealed) return; // reveal sonrası kilit

    const user = users.find(u => u.id === socket.id);
    if (!user) return;

    // ✅ null geldiyse seçim kaldır
    if (value == null) {
      user.selectedCard = null;
    } else {
      // ✅ aynı kartı tekrar seçtiyse kaldır (ek güvenlik)
      user.selectedCard = (user.selectedCard === value) ? null : value;
    }

    emitState();
  });


  // ✅ SADECE ADMIN REVEAL ATABİLİR
  socket.on("reveal", () => {
    if (socket.id !== adminSocketId) return;

    // ✅ Hiç kimse kart seçmemişse REVEAL yapma
    const anySelected = users.some(u => u.selectedCard != null);
    if (!anySelected) {
      io.to(socket.id).emit("revealError", {
        message: "No estimates yet. Please select a card before revealing."
      });
      return; // 🔥 revealed=true olmaz, kartlar kilitlenmez
    }

    revealed = true;

    const counts = {};
    for (const u of users) {
      if (u.selectedCard != null) {
        counts[u.selectedCard] = (counts[u.selectedCard] || 0) + 1;
      }
    }

    io.emit("revealResults", counts);
    emitState();
  });

  // ✅ SADECE ADMIN NEW ROUND ATABİLİR
  socket.on("newRound", () => {
    if (socket.id !== adminSocketId) return;

    resetRound();

    io.emit("clearSelections");
    emitState();
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);

    // admin çıktıysa admin boşalır
    if (socket.id === adminSocketId) {
      adminSocketId = null;
      adminName = null;

      // Admin çıkınca round kilitli kalmasın
      resetRound();
      io.emit("clearSelections");

      io.emit("adminStatus", { adminTaken: false, adminName: null });
    }

    users = users.filter(u => u.id !== socket.id);
    // ✅ Eğer odada kimse kalmadıysa round state'ini sıfırla
    if (users.length === 0) {
      resetRound();
      // ekstra güvenlik: içeride seçim kalmasın
      // (users boş ama state temiz kalsın)
    }
    emitState();
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running: http://localhost:${PORT}`);
});
