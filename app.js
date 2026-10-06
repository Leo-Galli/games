/* Games — Another Horizon
   A pocket arcade: eight mini-games in one page, vanilla JS, no dependencies. */
(() => {
  "use strict";

  /* ---------------------------------------------------------------- helpers */
  const $ = (sel, root) => (root || document).querySelector(sel);
  const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  };
  const rnd = (n) => Math.floor(Math.random() * n);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const shuffle = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = rnd(i + 1);
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  };

  const KEY = "ah-games-";
  const store = {
    get(k, d) {
      try { const v = localStorage.getItem(KEY + k); return v == null ? d : JSON.parse(v); }
      catch (e) { return d; }
    },
    set(k, v) { try { localStorage.setItem(KEY + k, JSON.stringify(v)); } catch (e) {} }
  };

  /* Palette pulled from the CSS variables so games follow the shared theme. */
  let paletteKey = "";
  let pal = {};
  function palette() {
    const k = document.documentElement.getAttribute("data-theme") || "dark";
    if (k !== paletteKey) {
      paletteKey = k;
      const cs = getComputedStyle(document.documentElement);
      const get = (name, fallback) => (cs.getPropertyValue(name).trim() || fallback);
      pal = {
        text: get("--text", "#f3f8fc"),
        muted: get("--muted", "#9ec4dc"),
        azure: get("--azure", "#38bdf8"),
        azure2: get("--azure-2", "#7dd3fc"),
        line: get("--line", "rgba(186,230,253,.28)")
      };
    }
    return pal;
  }

  /* Tiny WebAudio blips (Simon + a few feedback sounds). */
  let actx = null;
  function beep(freq, dur, type) {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!actx) actx = new AC();
      if (actx.state === "suspended") actx.resume();
      const osc = actx.createOscillator();
      const gain = actx.createGain();
      const t = actx.currentTime;
      osc.type = type || "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.05, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(gain).connect(actx.destination);
      osc.start(t);
      osc.stop(t + dur);
    } catch (e) {}
  }

  function hudBar(items) {
    const bar = el("div", "hud");
    items.forEach((item) => {
      const stat = el("div", "stat");
      const big = el("b", null, String(item[1]));
      big.dataset.stat = item[2];
      stat.append(big, el("span", null, item[0]));
      bar.append(stat);
    });
    return bar;
  }
  function setStat(bar, key, value) {
    const node = bar.querySelector('[data-stat="' + key + '"]');
    if (node) node.textContent = String(value);
  }

  /* Swipe detection for touch devices. Returns a disposer. */
  function swipe(node, handler) {
    let x0 = 0, y0 = 0;
    const start = (e) => { const t = e.changedTouches[0]; x0 = t.clientX; y0 = t.clientY; };
    const end = (e) => {
      const t = e.changedTouches[0];
      const dx = t.clientX - x0, dy = t.clientY - y0;
      if (Math.hypot(dx, dy) < 24) return;
      if (Math.abs(dx) > Math.abs(dy)) handler(dx > 0 ? "r" : "l");
      else handler(dy > 0 ? "d" : "u");
    };
    node.addEventListener("touchstart", start, { passive: true });
    node.addEventListener("touchend", end, { passive: true });
    return () => {
      node.removeEventListener("touchstart", start);
      node.removeEventListener("touchend", end);
    };
  }

  /* ------------------------------------------------------------- the games */
  const games = {};

  /* ---------------------------------------------------------------- Snake */
  games.snake = {
    name: "Snake",
    desc: "Grow the snake, chase the fruit, and never bite yourself.",
    hint: "Arrow keys / WASD to steer · Space to pause",
    icon: '<path d="M4 17c0-2 1.8-3 4-3h5a3 3 0 0 0 0-6H8"/><path d="M4 20h13a3 3 0 0 0 3-3"/><circle cx="16" cy="8" r="1.3"/>',
    mount(root, api) {
      const size = 400, n = 20, cs = size / n;
      const canvas = el("canvas", "board");
      canvas.width = canvas.height = size;
      canvas.setAttribute("aria-label", "Snake board");
      const hud = hudBar([["Score", 0, "score"], ["Best", api.best(), "best"]]);
      const wrap = el("div", "game-wrap");
      wrap.append(hud, canvas);
      root.append(wrap);
      const ctx = canvas.getContext("2d");

      let snake, dir, queue, food, score, over, acc, step, raf, last;

      function placeFood() {
        let p;
        do { p = { x: rnd(n), y: rnd(n) }; } while (snake.some((s) => s.x === p.x && s.y === p.y));
        food = p;
      }
      function reset() {
        snake = [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }];
        dir = { x: 1, y: 0 };
        queue = [];
        score = 0;
        over = false;
        acc = 0;
        step = 140;
        last = 0;
        placeFood();
        setStat(hud, "score", 0);
        setStat(hud, "best", api.best());
        draw();
      }
      function turn(nx, ny) {
        const d = queue.length ? queue[queue.length - 1] : dir;
        if (d.x === -nx && d.y === -ny) return;
        if (d.x === nx && d.y === ny) return;
        if (queue.length < 3) queue.push({ x: nx, y: ny });
      }
      function tick() {
        if (queue.length) dir = queue.shift();
        const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
        const hitWall = head.x < 0 || head.y < 0 || head.x >= n || head.y >= n;
        const hitSelf = snake.some((s, i) => i > 0 && s.x === head.x && s.y === head.y);
        if (hitWall || hitSelf) {
          over = true;
          if (score > api.best()) api.setBest(score);
          setStat(hud, "best", api.best());
          beep(160, 0.22, "square");
          return;
        }
        snake.unshift(head);
        if (head.x === food.x && head.y === food.y) {
          score += 1;
          setStat(hud, "score", score);
          placeFood();
          step = Math.max(70, step - 3);
          beep(760, 0.05);
        } else {
          snake.pop();
        }
      }
      function draw() {
        const c = palette();
        ctx.clearRect(0, 0, size, size);
        ctx.strokeStyle = c.line;
        ctx.lineWidth = 1;
        for (let i = 1; i < n; i++) {
          ctx.beginPath(); ctx.moveTo(i * cs, 0); ctx.lineTo(i * cs, size); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(0, i * cs); ctx.lineTo(size, i * cs); ctx.stroke();
        }
        ctx.fillStyle = c.azure;
        snake.forEach((s, i) => {
          ctx.globalAlpha = i === 0 ? 1 : 0.72;
          ctx.fillRect(s.x * cs + 1.5, s.y * cs + 1.5, cs - 3, cs - 3);
        });
        ctx.globalAlpha = 1;
        if (food) {
          ctx.fillStyle = c.azure2;
          ctx.beginPath();
          ctx.arc(food.x * cs + cs / 2, food.y * cs + cs / 2, cs / 2 - 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
        if (over) {
          ctx.fillStyle = "rgba(8,24,40,.66)";
          ctx.fillRect(0, size / 2 - 44, size, 88);
          ctx.fillStyle = c.text;
          ctx.font = "700 24px Outfit, sans-serif";
          ctx.textAlign = "center";
          ctx.fillText("Game over", size / 2, size / 2 - 4);
          ctx.font = "600 15px system-ui, sans-serif";
          ctx.fillStyle = c.muted;
          ctx.fillText("Press Enter to play again", size / 2, size / 2 + 22);
        }
      }
      function loop(ts) {
        raf = requestAnimationFrame(loop);
        if (over) { draw(); return; }
        if (!last) last = ts;
        acc += ts - last;
        last = ts;
        if (acc >= step) { acc = 0; tick(); draw(); }
      }
      const offKey = api.onKey((e) => {
        const k = e.key;
        if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(k)) e.preventDefault();
        if (k === "ArrowUp" || k === "w" || k === "W") turn(0, -1);
        else if (k === "ArrowDown" || k === "s" || k === "S") turn(0, 1);
        else if (k === "ArrowLeft" || k === "a" || k === "A") turn(-1, 0);
        else if (k === "ArrowRight" || k === "d" || k === "D") turn(1, 0);
        else if (k === "Enter" && over) reset();
      });
      const offSwipe = swipe(canvas, (d) => {
        if (d === "u") turn(0, -1);
        else if (d === "d") turn(0, 1);
        else if (d === "l") turn(-1, 0);
        else turn(1, 0);
      });
      api.onRestart(reset);
      reset();
      raf = requestAnimationFrame(loop);
      return () => { cancelAnimationFrame(raf); offKey(); offSwipe(); };
    }
  };

  /* ----------------------------------------------------------------- 2048 */
  games.t2048 = {
    name: "2048",
    desc: "Slide the tiles, merge the doubles, and reach 2048.",
    hint: "Arrow keys / WASD to slide · swipe on touch",
    icon: '<rect x="3" y="3" width="8" height="8" rx="2"/><rect x="13" y="3" width="8" height="8" rx="2"/><rect x="3" y="13" width="8" height="8" rx="2"/><rect x="13" y="13" width="8" height="8" rx="2"/>',
    mount(root, api) {
      const hud = hudBar([["Score", 0, "score"], ["Best", api.best(), "best"]]);
      const pad = el("div", "pad g4 t2048");
      const cells = [];
      for (let i = 0; i < 16; i++) {
        const c = el("div", "cell");
        cells.push(c);
        pad.append(c);
      }
      const wrap = el("div", "game-wrap");
      wrap.append(hud, pad);
      root.append(wrap);

      let board, score, over, won;

      function empty() {
        const list = [];
        board.forEach((v, i) => { if (!v) list.push(i); });
        return list;
      }
      function addTile() {
        const slots = empty();
        if (!slots.length) return;
        const i = slots[rnd(slots.length)];
        board[i] = Math.random() < 0.9 ? 2 : 4;
      }
      function slide(line) {
        const a = line.filter((v) => v);
        let gained = 0;
        for (let i = 0; i < a.length - 1; i++) {
          if (a[i] === a[i + 1]) { a[i] *= 2; gained += a[i]; a.splice(i + 1, 1); }
        }
        while (a.length < 4) a.push(0);
        return [a, gained];
      }
      function move(dir) {
        if (over) return;
        const before = board.join(",");
        let gained = 0;
        for (let i = 0; i < 4; i++) {
          let line;
          if (dir === "l") line = [board[i * 4], board[i * 4 + 1], board[i * 4 + 2], board[i * 4 + 3]];
          else if (dir === "r") line = [board[i * 4 + 3], board[i * 4 + 2], board[i * 4 + 1], board[i * 4]];
          else if (dir === "u") line = [board[i], board[i + 4], board[i + 8], board[i + 12]];
          else line = [board[i + 12], board[i + 8], board[i + 4], board[i]];
          const res = slide(line);
          gained += res[1];
          const nl = res[0];
          for (let j = 0; j < 4; j++) {
            if (dir === "l") board[i * 4 + j] = nl[j];
            else if (dir === "r") board[i * 4 + (3 - j)] = nl[j];
            else if (dir === "u") board[i + j * 4] = nl[j];
            else board[i + (3 - j) * 4] = nl[j];
          }
        }
        if (board.join(",") === before) return;
        score += gained;
        addTile();
        setStat(hud, "score", score);
        if (score > api.best()) { api.setBest(score); setStat(hud, "best", score); }
        if (board.includes(2048) && !won) { won = true; beep(880, 0.16); }
        render();
        checkOver();
      }
      function checkOver() {
        if (empty().length) return;
        for (let r = 0; r < 4; r++) {
          for (let c = 0; c < 4; c++) {
            const v = board[r * 4 + c];
            if (c < 3 && v === board[r * 4 + c + 1]) return;
            if (r < 3 && v === board[(r + 1) * 4 + c]) return;
          }
        }
        over = true;
        beep(180, 0.24, "square");
        api.setHint("No moves left — press Enter or Restart to try again.");
      }
      function render() {
        cells.forEach((cell, i) => {
          const v = board[i];
          cell.textContent = v ? String(v) : "";
          cell.className = "cell" + (v ? " t" + v : "");
        });
      }
      function reset() {
        board = new Array(16).fill(0);
        score = 0;
        over = false;
        won = false;
        addTile();
        addTile();
        setStat(hud, "score", 0);
        setStat(hud, "best", api.best());
        api.setHint(games.t2048.hint);
        render();
      }
      const offKey = api.onKey((e) => {
        const map = {
          ArrowUp: "u", ArrowDown: "d", ArrowLeft: "l", ArrowRight: "r",
          w: "u", s: "d", a: "l", d: "r", W: "u", S: "d", A: "l", D: "r"
        };
        const dir = map[e.key];
        if (dir) { e.preventDefault(); move(dir); }
        else if (e.key === "Enter" && over) reset();
      });
      const offSwipe = swipe(pad, move);
      api.onRestart(reset);
      reset();
      return () => { offKey(); offSwipe(); };
    }
  };

  /* --------------------------------------------------------------- Memory */
  games.memory = {
    name: "Memory",
    desc: "Flip the cards two at a time and remember where every pair hides.",
    hint: "Click or tap a card to flip it",
    icon: '<rect x="3" y="3" width="12" height="12" rx="2"/><rect x="9" y="9" width="12" height="12" rx="2"/>',
    mount(root, api) {
      const symbols = ["🚀", "⭐️", "🎯", "🧩", "🎲", "🏆", "⚡️", "🔥"];
      const hud = hudBar([["Moves", 0, "moves"], ["Pairs", 0, "pairs"], ["Best", "—", "best"]]);
      const pad = el("div", "pad g4");
      const wrap = el("div", "game-wrap");
      wrap.append(hud, pad);
      root.append(wrap);

      let deck, first, lock, moves, found;
      const bestStored = api.best();
      if (bestStored) setStat(hud, "best", bestStored + " moves");

      function reset() {
        deck = shuffle(symbols.concat(symbols).map((s, i) => ({ s, i, done: false })));
        first = null;
        lock = false;
        moves = 0;
        found = 0;
        setStat(hud, "moves", 0);
        setStat(hud, "pairs", 0);
        pad.innerHTML = "";
        deck.forEach((card, idx) => {
          const btn = el("button", "cell mem-cell");
          btn.type = "button";
          btn.textContent = "";
          btn.setAttribute("aria-label", "Hidden card " + (idx + 1));
          btn.addEventListener("click", () => flip(idx, btn));
          card.node = btn;
          pad.append(btn);
        });
        api.setHint(games.memory.hint);
      }
      function flip(idx, btn) {
        const card = deck[idx];
        if (lock || card.done || card.node.classList.contains("flipped")) return;
        btn.textContent = card.s;
        btn.classList.add("flipped");
        beep(620, 0.05);
        if (!first) { first = { idx, card }; return; }
        moves += 1;
        setStat(hud, "moves", moves);
        const a = first, b = { idx, card };
        first = null;
        if (a.card.s === b.card.s) {
          a.card.done = card.done = true;
          a.card.node.classList.add("matched");
          b.card.node.classList.add("matched");
          b.card.node.classList.remove("flipped");
          a.card.node.classList.remove("flipped");
          found += 1;
          setStat(hud, "pairs", found);
          beep(880, 0.1);
          if (found === symbols.length) {
            if (!api.best() || moves < api.best()) { api.setBest(moves); setStat(hud, "best", moves + " moves"); }
            api.setHint("Solved in " + moves + " moves! Press Restart to play again.");
            beep(1040, 0.2);
          }
        } else {
          lock = true;
          setTimeout(() => {
            a.card.node.textContent = "";
            b.card.node.textContent = "";
            a.card.node.classList.remove("flipped");
            b.card.node.classList.remove("flipped");
            lock = false;
          }, 700);
        }
      }
      api.onRestart(reset);
      reset();
      return () => { lock = false; };
    }
  };

  /* ---------------------------------------------------------- Minesweeper */
  games.mines = {
    name: "Minesweeper",
    desc: "Clear every safe square without detonating a mine. Flags welcome.",
    hint: "Click to reveal · right-click (or Flag mode) to mark · first click is always safe",
    icon: '<circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4M5 5l3 3M16 16l3 3M19 5l-3 3M8 16l-3 3"/>',
    mount(root, api) {
      const N = 9, MINES = 10;
      const hud = hudBar([["Mines", MINES, "mines"], ["Time", "0s", "time"], ["Best", "—", "best"]]);
      const modeRow = el("div", "hud");
      const modeBtn = el("button", "btn small", "Flag mode: off");
      modeBtn.type = "button";
      modeRow.append(modeBtn);
      const pad = el("div", "pad g9");
      const wrap = el("div", "game-wrap");
      wrap.append(hud, modeRow, pad);
      root.append(wrap);

      let cells, flags, started, over, revealed, timer, seconds, flagMode;

      function reset() {
        cells = [];
        flags = 0;
        started = false;
        over = false;
        revealed = 0;
        seconds = 0;
        flagMode = false;
        clearInterval(timer);
        modeBtn.textContent = "Flag mode: off";
        setStat(hud, "mines", MINES);
        setStat(hud, "time", "0s");
        const best = api.best();
        setStat(hud, "best", best ? best + "s" : "—");
        pad.innerHTML = "";
        for (let i = 0; i < N * N; i++) {
          const btn = el("button", "cell ms-cell");
          btn.type = "button";
          cells.push({ i, mine: false, open: false, n: 0, node: btn });
          btn.addEventListener("click", (e) => click(i, e));
          btn.addEventListener("contextmenu", (e) => { e.preventDefault(); toggleFlag(i); });
          pad.append(btn);
        }
        api.setHint(games.mines.hint);
      }
      function neighbours(i) {
        const r = Math.floor(i / N), c = i % N, out = [];
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (!dr && !dc) continue;
            const nr = r + dr, nc = c + dc;
            if (nr >= 0 && nc >= 0 && nr < N && nc < N) out.push(nr * N + nc);
          }
        }
        return out;
      }
      function plant(safe) {
        const blocked = new Set([safe].concat(neighbours(safe)));
        const pool = cells.filter((c) => !blocked.has(c.i));
        shuffle(pool);
        pool.slice(0, MINES).forEach((c) => { c.mine = true; });
        cells.forEach((c) => { c.n = neighbours(c.i).filter((j) => cells[j].mine).length; });
      }
      function startTimer() {
        timer = setInterval(() => {
          seconds += 1;
          setStat(hud, "time", seconds + "s");
        }, 1000);
      }
      function click(i, ev) {
        if (over) return;
        if (flagMode || ev.shiftKey) { toggleFlag(i); return; }
        const cell = cells[i];
        if (cell.open || cell.flagged) return;
        if (!started) { started = true; plant(i); startTimer(); }
        if (cell.mine) {
          cell.node.classList.add("mine");
          cell.node.textContent = "💥";
          over = true;
          clearInterval(timer);
          cells.forEach((c) => { if (c.mine) { c.node.textContent = "💣"; } });
          api.setHint("Boom! Press Restart for a fresh board.");
          beep(150, 0.3, "square");
          return;
        }
        reveal(i);
        if (revealed === N * N - MINES) {
          over = true;
          clearInterval(timer);
          const best = api.best();
          if (!best || seconds < best) { api.setBest(seconds); setStat(hud, "best", seconds + "s"); }
          api.setHint("Cleared in " + seconds + "s. Nice!");
          beep(980, 0.2);
        }
      }
      function reveal(i) {
        const stack = [i];
        while (stack.length) {
          const j = stack.pop();
          const cell = cells[j];
          if (cell.open || cell.flagged || cell.mine) continue;
          cell.open = true;
          revealed += 1;
          cell.node.classList.add("revealed");
          cell.node.disabled = true;
          if (cell.n) {
            cell.node.textContent = String(cell.n);
            cell.node.classList.add("ms-" + cell.n);
          } else {
            neighbours(j).forEach((k) => stack.push(k));
          }
        }
      }
      function toggleFlag(i) {
        const cell = cells[i];
        if (over || cell.open) return;
        cell.flagged = !cell.flagged;
        cell.node.classList.toggle("flagged", cell.flagged);
        cell.node.textContent = cell.flagged ? "🚩" : "";
        flags += cell.flagged ? 1 : -1;
        setStat(hud, "mines", Math.max(0, MINES - flags));
      }
      modeBtn.addEventListener("click", () => {
        flagMode = !flagMode;
        modeBtn.textContent = "Flag mode: " + (flagMode ? "on" : "off");
      });
      api.onRestart(reset);
      reset();
      return () => clearInterval(timer);
    }
  };

  /* ------------------------------------------------------------ Breakout */
  games.breakout = {
    name: "Breakout",
    desc: "Bounce the ball, smash every brick, and keep the ball alive.",
    hint: "Move with the mouse or ← → keys · Space launches the ball",
    icon: '<rect x="3" y="4" width="18" height="6" rx="2"/><circle cx="12" cy="15" r="2.4"/><path d="M4 20h6"/>',
    mount(root, api) {
      const W = 420, H = 320;
      const canvas = el("canvas", "board");
      canvas.width = W; canvas.height = H;
      const hud = hudBar([["Score", 0, "score"], ["Lives", 3, "lives"], ["Best", api.best(), "best"]]);
      const wrap = el("div", "game-wrap");
      wrap.append(hud, canvas);
      root.append(wrap);
      const ctx = canvas.getContext("2d");

      const COLS = 7, ROWS = 4, BW = W / COLS, BH = 16, TOP = 42;
      let bricks, paddle, ball, score, lives, launched, over, raf, keys;

      function reset() {
        bricks = [];
        for (let r = 0; r < ROWS; r++) {
          for (let c = 0; c < COLS; c++) {
            bricks.push({ x: c * BW, y: TOP + r * (BH + 4), w: BW - 4, h: BH, alive: true, r });
          }
        }
        paddle = { x: W / 2 - 36, y: H - 26, w: 72, h: 10 };
        ball = { x: W / 2, y: H - 40, dx: 0, dy: 0, r: 6 };
        score = 0;
        lives = 3;
        launched = false;
        over = false;
        keys = {};
        setStat(hud, "score", 0);
        setStat(hud, "lives", 3);
        setStat(hud, "best", api.best());
        api.setHint(games.breakout.hint);
        launchBall();
      }
      function launchBall() {
        ball.x = paddle.x + paddle.w / 2;
        ball.y = paddle.y - 8;
        ball.dx = (Math.random() < 0.5 ? -1 : 1) * 2.4;
        ball.dy = -3.4;
        launched = false;
      }
      function serve() {
        if (launched || over) return;
        launched = true;
        ball.dx = (Math.random() < 0.5 ? -1 : 1) * 2.4;
        ball.dy = -3.4;
      }
      function draw() {
        const c = palette();
        ctx.clearRect(0, 0, W, H);
        bricks.forEach((b) => {
          if (!b.alive) return;
          ctx.globalAlpha = 0.35 + b.r * 0.2;
          ctx.fillStyle = c.azure;
          ctx.fillRect(b.x + 2, b.y, b.w, b.h);
        });
        ctx.globalAlpha = 1;
        ctx.fillStyle = c.azure2;
        ctx.fillRect(paddle.x, paddle.y, paddle.w, paddle.h);
        ctx.beginPath();
        ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
        ctx.fillStyle = c.text;
        ctx.fill();
        if (!launched && !over) {
          ctx.fillStyle = c.muted;
          ctx.font = "600 14px system-ui, sans-serif";
          ctx.textAlign = "center";
          ctx.fillText("Press Space to launch", W / 2, H - 60);
        }
        if (over) {
          ctx.fillStyle = "rgba(8,24,40,.7)";
          ctx.fillRect(0, H / 2 - 44, W, 88);
          ctx.fillStyle = c.text;
          ctx.font = "700 24px Outfit, sans-serif";
          ctx.textAlign = "center";
          ctx.fillText(score >= ROWS * COLS ? "Cleared!" : "Game over", W / 2, H / 2 - 2);
          ctx.font = "600 14px system-ui, sans-serif";
          ctx.fillStyle = c.muted;
          ctx.fillText("Press Enter to play again", W / 2, H / 2 + 24);
        }
      }
      function step() {
        raf = requestAnimationFrame(step);
        if (!over) {
          if (keys.left) paddle.x -= 6;
          if (keys.right) paddle.x += 6;
          paddle.x = clamp(paddle.x, 0, W - paddle.w);
          if (!launched) {
            ball.x = paddle.x + paddle.w / 2;
            ball.y = paddle.y - 8;
          } else {
            ball.x += ball.dx;
            ball.y += ball.dy;
            if (ball.x < ball.r) { ball.x = ball.r; ball.dx *= -1; }
            if (ball.x > W - ball.r) { ball.x = W - ball.r; ball.dx *= -1; }
            if (ball.y < ball.r) { ball.y = ball.r; ball.dy *= -1; }
            if (ball.y > H - ball.r && ball.dy > 0) {
              lives -= 1;
              setStat(hud, "lives", lives);
              if (lives <= 0) {
                over = true;
                if (score > api.best()) { api.setBest(score); setStat(hud, "best", score); }
                beep(150, 0.3, "square");
              } else {
                launchBall();
              }
            }
            if (ball.dy > 0 && ball.y + ball.r >= paddle.y && ball.y < paddle.y + paddle.h &&
                ball.x >= paddle.x - ball.r && ball.x <= paddle.x + paddle.w + ball.r) {
              ball.dy = -Math.abs(ball.dy);
              const hit = (ball.x - (paddle.x + paddle.w / 2)) / (paddle.w / 2);
              ball.dx = clamp(hit * 4, -4.4, 4.4);
            }
            for (const b of bricks) {
              if (!b.alive) continue;
              if (ball.x > b.x - ball.r && ball.x < b.x + b.w + ball.r &&
                  ball.y > b.y - ball.r && ball.y < b.y + b.h + ball.r) {
                b.alive = false;
                ball.dy *= -1;
                score += 10;
                setStat(hud, "score", score);
                beep(520 + b.r * 90, 0.05);
                break;
              }
            }
            if (bricks.every((b) => !b.alive)) {
              over = true;
              if (score > api.best()) { api.setBest(score); setStat(hud, "best", score); }
              beep(1000, 0.2);
            }
          }
        }
        draw();
      }
      function movePaddle(clientX) {
        const rect = canvas.getBoundingClientRect();
        const x = ((clientX - rect.left) / rect.width) * W;
        paddle.x = clamp(x - paddle.w / 2, 0, W - paddle.w);
      }
      const onMove = (e) => movePaddle(e.clientX);
      canvas.addEventListener("mousemove", onMove);
      canvas.addEventListener("touchmove", (e) => { if (e.touches[0]) movePaddle(e.touches[0].clientX); }, { passive: true });
      const offKey = api.onKey((e) => {
        if (e.key === "ArrowLeft") { keys.left = true; e.preventDefault(); }
        if (e.key === "ArrowRight") { keys.right = true; e.preventDefault(); }
        if (e.key === " ") { e.preventDefault(); serve(); }
        if (e.key === "Enter" && over) reset();
      });
      const offKeyUp = api.onKeyUp((e) => {
        if (e.key === "ArrowLeft") keys.left = false;
        if (e.key === "ArrowRight") keys.right = false;
      });
      api.onRestart(reset);
      reset();
      raf = requestAnimationFrame(step);
      return () => {
        cancelAnimationFrame(raf);
        offKey();
        offKeyUp();
        canvas.removeEventListener("mousemove", onMove);
      };
    }
  };

  /* ------------------------------------------------------- Tic-tac-toe */
  games.ttt = {
    name: "Tic-Tac-Toe",
    desc: "Classic three in a row against an opponent that never slips.",
    hint: "You are X and always move first · the AI plays perfectly",
    icon: '<path d="M4 7h16M4 12h16M4 17h16"/><path d="M9 4v16"/>',
    mount(root, api) {
      const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
      const hud = hudBar([["Wins", api.best(), "wins"], ["Draws", 0, "draws"], ["Losses", 0, "losses"]]);
      const pad = el("div", "pad g3");
      const wrap = el("div", "game-wrap");
      wrap.append(hud, pad);
      root.append(wrap);

      let board, over, busy, wins, draws, losses;
      const cells = [];
      for (let i = 0; i < 9; i++) {
        const btn = el("button", "cell ttt-cell");
        btn.type = "button";
        btn.addEventListener("click", () => play(i));
        cells.push(btn);
        pad.append(btn);
      }
      const stat = () => {
        const v = store.get("ttt-record", { w: 0, d: 0, l: 0 });
        wins = v.w; draws = v.d; losses = v.l;
        setStat(hud, "wins", wins);
        setStat(hud, "draws", draws);
        setStat(hud, "losses", losses);
      };
      function winner(b) {
        for (const l of LINES) {
          if (b[l[0]] && b[l[0]] === b[l[1]] && b[l[0]] === b[l[2]]) return { p: b[l[0]], line: l };
        }
        return b.every(Boolean) ? { p: "draw", line: [] } : null;
      }
      function minimax(b, player, depth) {
        const res = winner(b);
        if (res) {
          if (res.p === "draw") return { score: 0 };
          return { score: res.p === "O" ? 10 - depth : depth - 10 };
        }
        let bestMove = -1;
        let bestScore = player === "O" ? -Infinity : Infinity;
        for (let i = 0; i < 9; i++) {
          if (b[i]) continue;
          b[i] = player;
          const s = minimax(b, player === "O" ? "X" : "O", depth + 1).score;
          b[i] = "";
          if (player === "O" ? s > bestScore : s < bestScore) { bestScore = s; bestMove = i; }
        }
        return { score: bestScore, move: bestMove };
      }
      function render() {
        cells.forEach((c, i) => {
          c.textContent = board[i];
          c.disabled = !!board[i] || over;
        });
      }
      function finish(res) {
        over = true;
        if (res.line && res.line.length) res.line.forEach((i) => cells[i].classList.add("ttt-win"));
        if (res.p === "X") {
          wins += 1;
          store.set("ttt-record", { w: wins, d: draws, l: losses });
          api.setHint("You win! Press Restart for another round.");
          beep(1000, 0.18);
        } else if (res.p === "O") {
          losses += 1;
          store.set("ttt-record", { w: wins, d: draws, l: losses });
          api.setHint("The AI wins this one. Press Restart to try again.");
          beep(220, 0.22, "square");
        } else {
          draws += 1;
          store.set("ttt-record", { w: wins, d: draws, l: losses });
          api.setHint("A draw — the perfect game. Press Restart to try again.");
          beep(520, 0.18);
        }
        setStat(hud, "wins", wins);
        setStat(hud, "draws", draws);
        setStat(hud, "losses", losses);
        render();
      }
      function play(i) {
        if (over || busy || board[i]) return;
        board[i] = "X";
        beep(640, 0.05);
        render();
        let res = winner(board);
        if (res) return finish(res);
        busy = true;
        setTimeout(() => {
          const move = minimax(board.slice(), "O", 0).move;
          if (move >= 0) board[move] = "O";
          beep(420, 0.05);
          busy = false;
          render();
          res = winner(board);
          if (res) finish(res);
        }, 220);
      }
      function reset() {
        board = new Array(9).fill("");
        over = false;
        busy = false;
        stat();
        cells.forEach((c) => c.classList.remove("ttt-win"));
        setStat(hud, "wins", wins);
        api.setHint(games.ttt.hint);
        render();
      }
      api.onRestart(reset);
      reset();
      return () => { busy = false; };
    }
  };

  /* ---------------------------------------------------------------- Simon */
  games.simon = {
    name: "Simon",
    desc: "Watch the sequence, then repeat it. It grows by one every round.",
    hint: "Watch the pads, then repeat the sequence",
    icon: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.4"/>',
    mount(root, api) {
      const TONES = [392, 330, 262, 494];
      const hud = hudBar([["Level", 0, "level"], ["Best", api.best(), "best"], ["Status", "Watch", "status"]]);
      const pad = el("div", "pad g4");
      const pads = [];
      for (let i = 0; i < 4; i++) {
        const p = el("button", "simon-pad");
        p.type = "button";
        p.dataset.c = String(i);
        p.setAttribute("aria-label", "Pad " + (i + 1));
        p.addEventListener("click", () => tap(i));
        pads.push(p);
        pad.append(p);
      }
      const wrap = el("div", "game-wrap");
      wrap.append(hud, pad);
      root.append(wrap);

      let seq, step, playing, timers = [];

      function flash(i, ms) {
        pads[i].classList.add("on");
        beep(TONES[i], 0.16);
        timers.push(setTimeout(() => pads[i].classList.remove("on"), ms || 260));
      }
      function playSequence() {
        playing = true;
        setStat(hud, "status", "Watch");
        let delay = 420;
        seq.forEach((c) => {
          timers.push(setTimeout(() => flash(c), delay));
          delay += 560;
        });
        timers.push(setTimeout(() => {
          playing = false;
          setStat(hud, "status", "Your turn");
        }, delay - 140));
      }
      function nextLevel() {
        seq.push(rnd(4));
        step = 0;
        setStat(hud, "level", seq.length - 1);
        playSequence();
      }
      function tap(i) {
        if (playing) return;
        flash(i);
        if (seq[step] !== i) {
          api.setHint("Wrong pad — you reached level " + (seq.length - 1) + ". Press Restart to try again.");
          setStat(hud, "status", "Missed");
          if (seq.length - 1 > api.best()) { api.setBest(seq.length - 1); setStat(hud, "best", seq.length - 1); }
          playing = true;
          beep(140, 0.3, "square");
          return;
        }
        step += 1;
        if (step === seq.length) nextLevel();
      }
      function reset() {
        timers.forEach(clearTimeout);
        timers = [];
        seq = [];
        step = 0;
        playing = false;
        setStat(hud, "best", api.best());
        api.setHint(games.simon.hint);
        nextLevel();
      }
      api.onRestart(reset);
      reset();
      return () => { timers.forEach(clearTimeout); };
    }
  };

  /* ------------------------------------------------------------- Reaction */
  games.reaction = {
    name: "Reaction",
    desc: "Click the moment it turns green. Five rounds, average wins.",
    hint: "Wait for green, then click as fast as you can",
    icon: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4"/><circle cx="12" cy="12" r="4"/>',
    mount(root, api) {
      const ROUNDS = 5;
      const hud = hudBar([["Round", 1, "round"], ["Last", "—", "last"], ["Best avg", api.best() ? api.best() + " ms" : "—", "best"]]);
      const pad = el("div", "react-pad");
      const wrap = el("div", "game-wrap");
      wrap.append(hud, pad);
      root.append(wrap);

      let state, times, round, goAt, timeout;

      function setPad(text, cls) {
        pad.className = "react-pad" + (cls ? " " + cls : "");
        pad.innerHTML = "";
        pad.append(el("span", null, text));
      }
      function roundStart() {
        state = "wait";
        setPad("Wait for green…", "wait");
        timeout = setTimeout(() => {
          state = "go";
          goAt = performance.now();
          setPad("CLICK!", "go");
          beep(880, 0.08);
        }, 900 + rnd(2200));
      }
      function done() {
        const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
        if (!api.best() || avg < api.best()) { api.setBest(avg); setStat(hud, "best", avg + " ms"); }
        api.setHint("Average " + avg + " ms over " + ROUNDS + " rounds. Press Restart to beat it.");
        setPad("Average " + avg + " ms", "");
      }
      pad.addEventListener("click", () => {
        if (state === "idle") { roundStart(); return; }
        if (state === "wait") {
          clearTimeout(timeout);
          state = "idle";
          setPad("Too soon — click to retry", "wait");
          return;
        }
        if (state === "go") {
          const ms = Math.round(performance.now() - goAt);
          times.push(ms);
          setStat(hud, "last", ms + " ms");
          round += 1;
          beep(660, 0.06);
          if (round > ROUNDS) { state = "idle"; done(); return; }
          setStat(hud, "round", round);
          state = "idle";
          setPad(ms + " ms — click for the next round", "");
        }
      });
      function reset() {
        clearTimeout(timeout);
        times = [];
        round = 1;
        state = "idle";
        setStat(hud, "round", 1);
        setStat(hud, "last", "—");
        setStat(hud, "best", api.best() ? api.best() + " ms" : "—");
        setPad("Click to start", "");
        api.setHint(games.reaction.hint);
      }
      api.onRestart(reset);
      reset();
      return () => clearTimeout(timeout);
    }
  };

  /* --------------------------------------------------------- stage manager */
  const ORDER = ["snake", "t2048", "memory", "mines", "breakout", "ttt", "simon", "reaction"];
  const stage = $("#stage");
  const stageBody = $("#stageBody");
  const stageTitle = $("#stageTitle");
  const stageHint = $("#stageHint");
  const grid = $("#gameGrid");
  let active = null;

  const PAD_NOTE = { snake: "Classic", t2048: "Puzzle", memory: "Memory", mines: "Logic",
    breakout: "Arcade", ttt: "Strategy", simon: "Sequence", reaction: "Reflex" };

  function buildCards() {
    ORDER.forEach((id) => {
      const g = games[id];
      const card = el("article", "glass card game-card");
      const ico = el("div", "ico");
      ico.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + g.icon + "</svg>";
      card.append(ico, el("h3", null, g.name), el("p", null, g.desc));
      const foot = el("div", "card-foot");
      const tag = el("span", "tag", (PAD_NOTE[id] || "Game"));
      const btn = el("button", "btn small", "Play");
      btn.type = "button";
      btn.addEventListener("click", () => openGame(id));
      foot.append(tag, btn);
      card.append(foot);
      card.dataset.game = id;
      grid.append(card);
    });
  }
  function refreshCards() {
    ORDER.forEach((id) => {
      const card = grid.querySelector('[data-game="' + id + '"]');
      if (!card) return;
      const best = Number(store.get(id + "-best", 0)) || 0;
      const tag = card.querySelector(".tag");
      if (tag) tag.textContent = (PAD_NOTE[id] || "Game") + (id === "mines" && best ? " · " + best + "s" : best ? " · best " + best : "");
    });
  }

  function openGame(id) {
    const g = games[id];
    if (!g) return;
    closeGame(true);
    active = { id, cleanups: [] };
    stageTitle.textContent = g.name;
    stageBody.innerHTML = "";
    stageHint.textContent = g.hint || "";
    stage.hidden = false;
    document.body.classList.add("stage-open");
    const api = {
      best: () => Number(store.get(id + "-best", 0)) || 0,
      setBest: (v) => store.set(id + "-best", v),
      onKey: (fn) => {
        const h = (e) => {
          const tag = (e.target.tagName || "").toLowerCase();
          if (tag === "select" || tag === "input" || tag === "textarea") return;
          fn(e);
        };
        window.addEventListener("keydown", h);
        active.cleanups.push(() => window.removeEventListener("keydown", h));
        return () => window.removeEventListener("keydown", h);
      },
      onKeyUp: (fn) => {
        window.addEventListener("keyup", fn);
        active.cleanups.push(() => window.removeEventListener("keyup", fn));
        return () => window.removeEventListener("keyup", fn);
      },
      onRestart: (fn) => {
        restart = fn;
      },
      setHint: (text) => { stageHint.textContent = text; }
    };
    restart = null;
    const cleanup = g.mount(stageBody, api) || function () {};
    active.cleanups.push(cleanup);
    refreshCards();
    const focusable = stageBody.querySelector("button, canvas, [tabindex]");
    if (focusable && focusable.focus) focusable.focus();
  }

  let restart = null;
  function closeGame(silent) {
    if (active) {
      active.cleanups.forEach((fn) => { try { fn(); } catch (e) {} });
      active = null;
    }
    restart = null;
    if (stageBody) stageBody.innerHTML = "";
    if (stage) stage.hidden = true;
    document.body.classList.remove("stage-open");
    if (!silent) refreshCards();
  }

  /* stage wiring */
  if (stage) {
    stage.addEventListener("click", (e) => {
      if (e.target.closest("[data-close]")) closeGame();
      if (e.target.id === "stageRestart" && restart) restart();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && stage && !stage.hidden) closeGame();
    });
  }

  /* nav / theme / menu / language (same behaviour as the other sites) */
  const root = document.documentElement;
  const themeToggle = $("#themeToggle");
  function syncThemeBtn() {
    if (!themeToggle) return;
    const dark = root.getAttribute("data-theme") === "dark";
    themeToggle.setAttribute("aria-pressed", dark ? "true" : "false");
    themeToggle.setAttribute("aria-label", dark ? "Switch to light theme" : "Switch to dark theme");
  }
  function applyTheme(theme) {
    root.setAttribute("data-theme", theme);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", theme === "light" ? "#eaf5fd" : "#072033");
    syncThemeBtn();
  }
  if (themeToggle) {
    themeToggle.addEventListener("click", () => {
      const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
      try { ahTheme(next); } catch (e) { root.setAttribute("data-theme", next); }
      applyTheme(next);
    });
  }
  applyTheme(root.getAttribute("data-theme") === "light" ? "light" : "dark");

  const navToggle = $("#navToggle");
  const menu = $("#menu");
  function setMenu(open) {
    if (!menu || !navToggle) return;
    menu.hidden = !open;
    navToggle.setAttribute("aria-expanded", open ? "true" : "false");
    document.body.classList.toggle("menu-open", open);
  }
  if (navToggle) {
    navToggle.addEventListener("click", () => setMenu(menu && menu.hidden));
  }
  if (menu) {
    menu.addEventListener("click", (e) => { if (e.target.closest("a")) setMenu(false); });
  }
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") setMenu(false); });

  /* language select → GTranslate (same pattern as the sibling sites) */
  const langSelect = $("#langSelect");
  if (langSelect) {
    const stored = (() => {
      try {
        const v = JSON.parse(localStorage.getItem("__GT_TRANSLATE_LANGS"));
        if (v && typeof v.tgtLang === "string") return v.tgtLang;
      } catch (e) {}
      const m = document.cookie.match(/(?:^|;\s*)googtrans=\/[^/]+\/([^;]+)/);
      return m ? m[1].slice(0, 2).toLowerCase() : "en";
    })();
    if ([...langSelect.options].some((o) => o.value === stored)) langSelect.value = stored;
    langSelect.addEventListener("change", () => {
      const lang = langSelect.value;
      const host = location.hostname;
      const parts = host.split(".");
      const dom = parts.length > 2 ? "." + parts.slice(-2).join(".") : host;
      const clear = (name) => {
        document.cookie = name + "=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
        document.cookie = name + "=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=" + dom;
      };
      if (lang === "en") {
        try { localStorage.removeItem("__GT_TRANSLATE_LANGS"); localStorage.removeItem("gt_autoswitch"); } catch (e) {}
        clear("googtrans");
        root.setAttribute("lang", "en");
        if (window.__GT && window.__GT.translator && window.__GT.translator.restore) window.__GT.translator.restore();
        else location.reload();
        return;
      }
      try { localStorage.setItem("__GT_TRANSLATE_LANGS", JSON.stringify({ srcLang: "en", tgtLang: lang })); } catch (e) {}
      document.cookie = "googtrans=/en/" + lang + "; path=/";
      document.cookie = "googtrans=/en/" + lang + "; path=/; domain=" + dom;
      root.setAttribute("lang", lang);
      const gt = document.querySelector(".gt_selector");
      if (gt) { gt.value = "en|" + lang; gt.dispatchEvent(new Event("change", { bubbles: true })); }
      else if (typeof window.doGTranslate === "function") window.doGTranslate("en|" + lang);
      else location.reload();
    });
  }

  if (grid) {
    buildCards();
    refreshCards();
  }
})();
