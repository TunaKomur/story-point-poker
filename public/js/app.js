(() => {
    const socket = io();

    const loginScreen = document.getElementById("loginScreen");
    const gameScreen = document.getElementById("gameScreen");
    const backBtn = document.getElementById("backBtn");

    function show(el, display = "") {
        if (!el) return;
        el.classList.remove("hidden");
        if (display) el.style.display = display;
        else el.style.removeProperty("display");
    }

    function hide(el) {
        if (!el) return;
        el.classList.add("hidden");
        el.style.display = "none";
    }

    show(loginScreen, "flex");
    hide(gameScreen);
    backBtn.classList.add("hidden"); // login/join ekranında asla görünmesin

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
    const recommendedWrap = document.getElementById("recommendedWrap");
    const recommendedText = document.getElementById("recommendedText");
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

    function getRecommendedPointFromCounts(counts) {
        // Sadece sayısal kartları al (0, 0.5, 1, 2, 3, 5, 8, 13, 21, 34, 55)
        const numericCards = cardValues
            .map(v => ({ label: v, num: (v === "1/2") ? 0.5 : Number(v) }))
            .filter(x => Number.isFinite(x.num)); // "?" elenir

        let sum = 0;
        let n = 0;

        for (const [label, c] of Object.entries(counts || {})) {
            const count = Number(c) || 0;
            if (count <= 0) continue;

            const num = (label === "1/2") ? 0.5 : Number(label);
            if (!Number.isFinite(num)) continue; // "?" gibi

            sum += num * count;
            n += count;
        }

        if (n === 0) return null;

        const avg = sum / n;

        // Ortalamaya en yakın kartı bul (eşitlikte daha küçük kartı seçiyoruz)
        let best = numericCards[0];
        let bestDiff = Math.abs(best.num - avg);

        for (const c of numericCards) {
            const diff = Math.abs(c.num - avg);
            if (diff < bestDiff || (diff === bestDiff && c.num < best.num)) {
                best = c;
                bestDiff = diff;
            }
        }

        return { recommendedLabel: best.label, average: avg };
    }

    function setRevealMessage(text) {
        if (!revealError) return;
        revealError.textContent = text || "";
    }

    function renderAdminControls() {
        if (!adminControls) return;

        if (!revealedState) {
            adminControls.innerHTML = `<button id="revealBtn" disabled>REVEAL ESTIMATES</button>`;

            const btn = adminControls.querySelector("#revealBtn");
            if (btn) {
                btn.onclick = () => {
                    if (revealError) revealError.textContent = "";
                    socket.emit("reveal");
                };
            }
        } else {
            adminControls.innerHTML = `<button id="newRoundBtn">START NEW ESTIMATION ROUND</button>`;

            const btn = adminControls.querySelector("#newRoundBtn");
            if (btn) {
                btn.onclick = () => socket.emit("newRound");
            }
        }
    }

    function removeAdminControls() {
        if (!adminControls) return;
        adminControls.innerHTML = "";
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

        hide(loginScreen);
        show(gameScreen, "block");

        //backBtn.classList.remove("hidden");
    };

    function goBackToLogin() {
        // server'a "ben çıktım" de (birazdan server.js'e event ekleyeceğiz)
        socket.emit("leaveRoom");

        hide(gameScreen);
        show(loginScreen, "flex");

        // back butonunu sakla
        backBtn.classList.add("hidden");

        // hata mesajlarını temizle
        joinError.textContent = "";
        if (revealError) revealError.textContent = "";

        // chart temizle
        if (chart) { chart.destroy(); chart = null; }
        chartWrap.classList.add("hidden");

        // kart kilidini kaldır + seçimleri sıfırla
        revealedState = false;
        cardsDiv.classList.remove("locked");
        renderCards(null);

        // local user bilgilerini sıfırla
        myName = null;
        myRole = "user";
        setRole("user");
    }
    backBtn.addEventListener("click", goBackToLogin);

    socket.on("joinError", ({ message }) => {
        show(loginScreen, "flex");
        hide(gameScreen);

        backBtn.classList.add("hidden");

        joinError.textContent = message || "Join error";
    });

    socket.on("playersUpdate", ({ players, revealed, revealRequested }) => {
        revealedState = revealed;
        cardsDiv.classList.toggle("locked", revealedState);
        playersList.innerHTML = "";

        for (const p of players) {
            const row = document.createElement("div");
            row.className = "playerRow";

            // SOL: isim
            const left = document.createElement("div");
            left.className = "playerLeft";
            left.textContent = p.name;

            // SAĞ: [admin badge] + [status slot]
            const right = document.createElement("div");
            right.className = "playerRight";

            // admin badge sağ tarafta dursun
            if (p.role === "admin") {
                const badge = document.createElement("span");
                badge.className = "adminBadge";
                badge.textContent = "admin";
                right.appendChild(badge);
            }

            // status slot: ✓ / ⏳ / (boş ama yer kaplar)
            const statusSlot = document.createElement("span");
            statusSlot.className = "statusSlot";

            if (revealed) {
                // reveal sonrası sayı gösterilecekse burada gösterelim
                // (istersen burada da slot sabit kalsın diye aynı slotta gösteriyoruz)
                statusSlot.textContent = p.selectedCard ?? "";
            } else {
                if (p.selected) {
                    statusSlot.innerHTML = '<span class="tick">✓</span>';
                    statusSlot.style.visibility = "visible";
                } else if (revealRequested) {
                    statusSlot.innerHTML = '<span class="hourglass">⏳</span>';
                    statusSlot.style.visibility = "visible";
                } else {
                    // hiçbir şey yok ama yerini KORU (kayma bitiyor)
                    statusSlot.textContent = "✓";
                    statusSlot.style.visibility = "hidden";
                }
            }

            right.appendChild(statusSlot);

            row.appendChild(left);
            row.appendChild(right);
            playersList.appendChild(row);
        }

        const me = players.find(x => x.name.toLowerCase() === (myName || "").toLowerCase());
        const missingCount = players.filter(p => !p.selectedCard).length;

        if (me) {
            backBtn.classList.remove("hidden"); // artık sadece oyun ekranı gerçekten aktifken görünür
            renderCards(me.selectedCard);
            myRole = me.role;

            if (myRole === "admin") {
                renderAdminControls();

                // Reveal butonu: admin kart seçmediyse disabled, seçtiyse aktif
                if (!revealedState) {

                    const revealBtn = document.getElementById("revealBtn");
                    if (revealBtn) revealBtn.disabled = !me.selectedCard;
                }
                // Admin: reveal basıldıysa "Waiting for X" dinamik güncellensin
                if (!revealedState && revealRequested) {
                    setRevealMessage(`Waiting for ${missingCount} player(s) to pick a card.`);
                } else {
                    // waiting mesajı varsa temizle
                    if (revealError && revealError.textContent.startsWith("Waiting for")) {
                        setRevealMessage("");
                    }
                }
            } else {
                removeAdminControls();

                // User: admin reveal bastıysa ve ben seçmediysem uyarı göster
                if (!revealedState && revealRequested && !me.selectedCard) {
                    setRevealMessage("Admin revealed. Please select a card.");
                } else {
                    // Kart seçtiysem uyarı silinsin
                    if (revealError && revealError.textContent.includes("Admin revealed")) {
                        setRevealMessage("");
                    }
                }
            }
        }
    });

    socket.on("clearSelections", () => {
        if (revealError) revealError.textContent = "";

        revealedState = false;
        cardsDiv.classList.remove("locked");

        renderCards(null);
        if (chart) { chart.destroy(); chart = null; }
        chartWrap.classList.add("hidden");

        if (recommendedWrap) recommendedWrap.classList.add("hidden");
        if (recommendedText) recommendedText.textContent = "";
    });

    socket.on("revealError", ({ message }) => {
        if (revealError) revealError.textContent = message || "";
    });

    socket.on("pickCardWarning", ({ message }) => {
        setRevealMessage(message || "Admin revealed. Please select a card.");
    });

    socket.on("revealResults", (counts) => {
        const labels = Object.keys(counts);
        const data = Object.values(counts);

        if (!labels.length) return;

        chartWrap.classList.remove("hidden");

        // Recommended Point hesapla ve göster
        const rec = getRecommendedPointFromCounts(counts);
        if (rec && recommendedWrap && recommendedText) {
            recommendedWrap.classList.remove("hidden");
            recommendedText.textContent = `Recommended point = ${rec.recommendedLabel}`;
        } else if (recommendedWrap) {
            recommendedWrap.classList.add("hidden");
        }

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