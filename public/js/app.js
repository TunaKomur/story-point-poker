(() => {
    const socket = io();

    const loginScreen = document.getElementById("loginScreen");
    const gameScreen = document.getElementById("gameScreen");
    // İlk açılış görünürlüğü (garanti)
    loginScreen.style.display = "flex";
    gameScreen.style.display = "none";
    const nameInput = document.getElementById("nameInput");
    const userRoleBtn = document.getElementById("userRoleBtn");
    const adminRoleBtn = document.getElementById("adminRoleBtn");
    const joinBtn = document.getElementById("joinBtn");
    const joinError = document.getElementById("joinError");
    const playersList = document.getElementById("playersList");
    const cardsDiv = document.getElementById("cards");
    const adminControls = document.getElementById("adminControls");
    const pieCanvas = document.getElementById("pieChart");
    const revealError = document.getElementById("revealError");
    const chartWrap = document.getElementById("chartWrap");
    const confettiCanvas = document.getElementById("confettiCanvas");
    const confettiCtx = confettiCanvas.getContext("2d");

    let chart = null;

    const cardValues = ["0", "1/2", "1", "2", "3", "5", "8", "13", "21", "34", "55", "?"];
    let myName = null;
    let myRole = "user";
    let adminTaken = false;
    let revealedState = false;

    function resizeConfettiToChart() {
        confettiCanvas.width = pieCanvas.width;
        confettiCanvas.height = pieCanvas.height;
    }

    function runConfetti(durationMs = 2500) {
        resizeConfettiToChart();

        const w = confettiCanvas.width;
        const h = confettiCanvas.height;
        const cx = w / 2;
        const cy = h / 2;
        const radius = Math.min(w, h) * 0.42;

        const start = performance.now();
        const particles = [];

        function spawnBurst() {
            const burstCount = 80;
            for (let i = 0; i < burstCount; i++) {
                const ang = Math.random() * Math.PI * 2;

                const x = cx + Math.cos(ang) * radius;
                const y = cy + Math.sin(ang) * radius;

                const speed = 2 + Math.random() * 4;
                const vx = Math.cos(ang) * speed + (Math.random() - 0.5) * 2;
                const vy = Math.sin(ang) * speed + (Math.random() - 0.5) * 2;

                particles.push({
                    x, y, vx, vy,
                    life: 60 + Math.random() * 30,
                    size: 3 + Math.random() * 4,
                    rot: Math.random() * Math.PI,
                    vr: (Math.random() - 0.5) * 0.2,
                    color: `hsl(${Math.floor(Math.random() * 360)}, 90%, 60%)`
                });
            }
        }

        spawnBurst();
        setTimeout(spawnBurst, 450);
        setTimeout(spawnBurst, 900);

        function frame(t) {
            const elapsed = t - start;
            confettiCtx.clearRect(0, 0, w, h);

            for (let i = particles.length - 1; i >= 0; i--) {
                const p = particles[i];
                p.vy += 0.06;
                p.vx *= 0.99;
                p.vy *= 0.99;

                p.x += p.vx;
                p.y += p.vy;
                p.rot += p.vr;
                p.life -= 1;

                if (p.life <= 0) {
                    particles.splice(i, 1);
                    continue;
                }

                confettiCtx.save();
                confettiCtx.translate(p.x, p.y);
                confettiCtx.rotate(p.rot);
                confettiCtx.fillStyle = p.color;
                confettiCtx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
                confettiCtx.restore();
            }

            if (elapsed < durationMs) {
                requestAnimationFrame(frame);
            } else {
                confettiCtx.clearRect(0, 0, w, h);
            }
        }

        requestAnimationFrame(frame);
    }

    function renderCards(selectedValue = null) {
        cardsDiv.innerHTML = "";
        for (const v of cardValues) {
            const el = document.createElement("div");
            el.className = "card" + (selectedValue === v ? " selected" : "");
            el.textContent = v;
            el.onclick = () => {
                if (revealedState) return;

                const isAlreadySelected = (selectedValue === v);
                socket.emit("selectCard", isAlreadySelected ? null : v);

                // UI'ı burada elle değiştirmiyoruz.
                // Server'dan playersUpdate gelince renderCards tekrar çizip doğru seçimi gösterecek.
            };


            cardsDiv.appendChild(el);
        }
    }

    renderCards(null);

    function renderAdminControls() {
        const adminControlsEl = document.getElementById("adminControls");
        if (!adminControlsEl) return;

        if (adminControlsEl.querySelector("#revealBtn")) return;

        adminControlsEl.innerHTML = `
      <button id="revealBtn">REVEAL ESTIMATES</button>
      <button id="newRoundBtn">START NEW ESTIMATION ROUND</button>`;

        adminControlsEl.querySelector("#revealBtn")
            .addEventListener("click", () => {
                if (revealError) revealError.textContent = "";
                socket.emit("reveal");
            });

        adminControlsEl.querySelector("#newRoundBtn")
            .addEventListener("click", () => socket.emit("newRound"));
    }

    function removeAdminControls() {
        const adminControlsEl = document.getElementById("adminControls");
        if (!adminControlsEl) return;
        adminControlsEl.innerHTML = "";
    }

    function setRole(role) {
        myRole = role;

        userRoleBtn.classList.remove("user-active", "admin-active", "active");
        adminRoleBtn.classList.remove("user-active", "admin-active", "active");

        if (role === "user") {
            userRoleBtn.classList.add("active", "user-active");
        } else {
            adminRoleBtn.classList.add("active", "admin-active");
        }
    }

    userRoleBtn.addEventListener("click", () => setRole("user"));

    adminRoleBtn.addEventListener("click", () => {
        if (adminRoleBtn.classList.contains("disabled")) return;
        setRole("admin");
    });

    setRole("user");

    socket.on("adminStatus", ({ adminTaken: taken }) => {
        adminTaken = !!taken;

        adminRoleBtn.classList.toggle("disabled", adminTaken);

        if (adminTaken && myRole === "admin") {
            setRole("user");
        }
    });

    socket.on("roleDowngraded", ({ message }) => {
        joinError.textContent = message || "";
    });

    joinBtn.onclick = () => {
        joinError.textContent = "";

        const name = nameInput.value.trim();
        const role = myRole;

        if (!name) {
            joinError.textContent = "Username cannot be empty.";
            return;
        }

        myName = name;
        myRole = role;

        socket.emit("join", { name, role });

        // Login ekranını tamamen kapat (garanti)
        loginScreen.classList.add("hidden");
        loginScreen.style.display = "none";

        // Game ekranını aç
        gameScreen.classList.remove("hidden");
        gameScreen.style.display = "block";

        if (myRole === "admin") {
            renderAdminControls();
        } else {
            removeAdminControls();
        }
    };

    socket.on("joinError", ({ message }) => {
        // Login ekranını geri aç
        loginScreen.classList.remove("hidden");
        loginScreen.style.display = "flex";

        // Game ekranını kapat
        gameScreen.classList.add("hidden");
        gameScreen.style.display = "none";

        joinError.textContent = message || "Join error";
    });

    socket.on("playersUpdate", ({ players, revealed, revealRequested}) => {
        revealedState = revealed;
        cardsDiv.classList.toggle("locked", revealedState);
        playersList.innerHTML = "";

        for (const p of players) {
            const row = document.createElement("div");
            row.className = "playerRow";

            const left = document.createElement("div");
            left.textContent = p.name;

            if (p.role === "admin") {
                const badge = document.createElement("span");
                badge.className = "adminBadge";
                badge.textContent = "admin";
                left.appendChild(badge);
            }

            const right = document.createElement("div");

            if (revealed) {
                right.textContent = p.selectedCard ?? "";
            } else {
                if (p.selected) {
                    right.innerHTML = '<span class="tick">✓</span>';
                } else {
            // admin reveal bastıysa seçmeyenlere kum saati göster
                    right.innerHTML = revealRequested ? '<span class="hourglass">⏳</span>' : "";
                }
            }


            row.appendChild(left);
            row.appendChild(right);
            playersList.appendChild(row);
        }

        const me = players.find(x => x.name.toLowerCase() === (myName || "").toLowerCase());
        if (me) {
            renderCards(me.selectedCard);
            myRole = me.role;
            if (myRole === "admin") renderAdminControls();
            else removeAdminControls();
        }
    });

    socket.on("clearSelections", () => {
        if (revealError) revealError.textContent = "";

        revealedState = false;
        cardsDiv.classList.remove("locked");

        renderCards(null);
        if (chart) { chart.destroy(); chart = null; }
        chartWrap.classList.add("hidden");
    });

    socket.on("revealError", ({ message }) => {
        if (revealError) revealError.textContent = message || "";
    });

    socket.on("pickCardWarning", ({ message }) => {
        if (revealError) revealError.textContent = message || "Please select a card.";
    });


    socket.on("revealResults", (counts) => {
        const labels = Object.keys(counts);
        const data = Object.values(counts);

        if (!labels.length) return;

        chartWrap.classList.remove("hidden");

        if (labels.length === 1 && data[0] > 0) {
            runConfetti(2500);
        }

        const ctx = pieCanvas.getContext("2d");
        if (chart) chart.destroy();

        chart = new Chart(ctx, {
            type: "pie",
            data: {
                labels,
                datasets: [{ data }]
            },
            plugins: [ChartDataLabels],
            options: {
                plugins: {
                    legend: { display: false },
                    tooltip: { enabled: false },
                    datalabels: {
                        color: "#fff",
                        font: { weight: "bold", size: 18 },
                        formatter: (value, context) => {
                            return context.chart.data.labels[context.dataIndex];
                        }
                    }
                }
            }
        });
    });
})();