// Owner: UI (see README)
// render() redraws everything from `game`. Cheap and idempotent: safe to call every tick.
function render() {
  const $ = (id) => document.getElementById(id);
  const set = (el, prop, v) => { if (el && el["_" + prop] !== v) el[prop] = el["_" + prop] = v; };  // skip writes we already made
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const data = (key, v) => { if (document.body.dataset[key] !== String(v)) document.body.dataset[key] = v; };
  const cssVar = (el, name, v) => { if (el && el["_" + name] !== v) { el["_" + name] = v; el.style.setProperty(name, v); } };
  const replay = (el, cls) => { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); };  // restart a CSS animation

  // Phase: CSS shows the lobby or the game from body[data-phase]
  const phase = game.phase || "lobby";
  data("phase", phase);
  updateSound();

  // Lobby: create or join a room, then "waiting" with the code once connect() has set playerName
  const lobby = $("lobby"), url = new URLSearchParams(location.search);
  set(lobby, "innerHTML", phase !== "lobby" ? "" : game.playerName
    ? `<div class="card waiting"><div class="fog"></div>
        <h1>Time Loop Escape</h1>
        <p class="wait" role="status"><span class="spinner" aria-hidden="true"></span>Waiting for your partner, ${esc(game.playerName)}…</p>
        <p>Send your partner this room code:</p>
        <div class="code-row"><strong id="room-code-shown">${esc(game.code)}</strong><button type="button" id="copy-code">Copy</button></div><p id="lobby-note" role="status"></p></div>`
    : `<form class="card start" id="lobby-form" novalidate><div class="fog"></div>
        <h1>Time Loop Escape</h1>
        <p>Two people are trapped, and neither gets out alone. Half of your clues are in your partner's room.</p>
        <label for="player-name">Your name</label>
        <input id="player-name" maxlength="20" autocomplete="nickname" placeholder="e.g. Sam" value="${esc(url.get("name") || "")}" autofocus>
        <div class="ways">
          <div class="way way-create"><h2>Create a room</h2><p class="way-note">Pick how long each loop lasts, then share the code.</p>
            <fieldset class="loops" id="loop-seconds"><legend>Time per loop</legend>
              ${[60, 90, 120, 600].map((s) => `<label class="loop"${s === 600 ? " data-admin hidden" : ""}><input type="radio" name="loop" value="${s}"${s === 60 ? " checked" : ""}>`
                + `<span class="tile" aria-hidden="true"><b>${s === 600 ? 10 : s}</b><small>${s === 600 ? "min" : "sec"}</small></span><span class="sr">${s === 600 ? "10 minutes (admin)" : `${s} seconds`}</span></label>`).join("")}
              <span class="loop-line" aria-hidden="true"></span></fieldset>
            <button name="how" value="create">Create room</button></div>
          <div class="way way-join"><h2>Join a room</h2><p class="way-note">Your partner gives you a 4-letter code.</p>
            <label for="room-code">Room code</label>
            <input id="room-code" maxlength="4" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="QXTR" value="${esc((url.get("room") || "").toUpperCase())}">
            <button name="how" value="join">Join room</button></div>
        </div>
        <p id="lobby-error" role="alert" hidden></p>
        <button class="solo" name="how" value="solo">Play alone with a practice partner</button>
        <button class="settings" type="button" id="lobby-settings">⚙ Settings</button></form>`);
  // net.js reports "room is full" and "nobody has opened this room" through game.message
  if (phase === "lobby" && game.message) {
    const box = $("lobby-error") || $("lobby-note");
    if (box) { box.hidden = false; box.textContent = game.message; }
  }
  if (phase === "lobby" && !game.playerName && !lobby._focused) { lobby._focused = true; setTimeout(() => $("player-name")?.focus()); }

  // Partner panel: name, level, loop, progress as 7 steps, and whether they're already out
  const o = game.partner, opp = $("opponent");
  set(opp, "innerHTML", !o ? "" : `<h2>${esc(o.name)} <small>Level ${o.stage || 1}/3 · Loop ${o.loop}</small></h2>
    <ol class="steps" aria-label="${esc(o.name)}: step ${o.step} of 7">`
    + ["Note", "Key", "Cabinet", "PC", "Lv 2", "Casket", "Lv 3"].map((s, i) => `<li${i < o.step ? ' class="done"' : ""}>${s}</li>`).join("") + "</ol>"
    + (o.escaped ? '<p class="partner-out">Escaped, waiting for you</p>' : ""));
  if (o && o.step > (opp._step ?? o.step)) replay(opp, "bump");  // flashes when they get further
  opp._step = o ? o.step : 0;

  // HUD
  const t = Math.max(0, Math.ceil(game.timeLeft)), stage = game.stage || 1, out = !!(game.flags && game.flags.escaped);
  set($("timer"), "textContent", "" + t + "s");
  $("timer").classList.toggle("low", t <= 10 && !out);
  document.body.classList.toggle("hurry", t <= 10 && !out && !game.won && phase === "playing");  // whole room goes red in the last 10s
  cssVar($("hud"), "--time", Math.min(1, t / (game.loopSeconds || 60)));  // drives the shrinking time bar
  set($("loop-count"), "textContent", `Level ${stage}/3 · Loop ${game.loop}`);
  const newStage = stage > Number(document.body.dataset.stage || stage);
  if (newStage) { replay($("bonus"), "show"); replay($("room"), "entering"); jolt("big"); }  // +1:00, the doors sliding apart, a heavy jolt
  const fl = game.flags || {}, first = { 1: !game.clues.length && "note", 2: !fl.powerOn && "fusebox", 3: !game.items.includes("fuse") && !fl.liftPower && "hatch" }[stage];
  document.querySelectorAll(".obj.beckon").forEach((el) => { if (el.id !== "obj-" + first) el.classList.remove("beckon"); });
  if (first && phase === "playing") $("obj-" + first)?.classList.add("beckon");
  // Keyboard players start on the first puzzle object of each stage (not while typing)
  if (phase === "playing" && $("room")._focusStage !== stage) {
    $("room")._focusStage = stage;
    const target = $("obj-" + ({ 1: "note", 2: "fusebox", 3: "hatch" })[stage]), typing = document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
    if (target && !typing) setTimeout(() => target.focus({ preventScroll: true }));
  }
  data("stage", stage);
  // A bite (the wrong casket) plays the scare at that casket
  const bites = (game.flags && game.flags.vampireBites) || 0;
  if (stage === 2 && phase === "playing" && bites > ($("room")._bites ?? bites)) {
    $("room").dataset.scare = "casket";  // the vampire only lives in the wrong casket
    replay($("room"), "vamp");
    if (!(game.playerName && String(game.playerName).toLowerCase() === "admin")) replay($("drain"), "show");
    splatter();
    jolt("big");
    document.dispatchEvent(new Event("tle-bite"));
    document.dispatchEvent(new Event("tle-scare"));
  }
  $("room")._bites = bites;
  // The vampire stalks you as time runs out: over the last 20s it creeps out of the dark, bigger and closer
  // every second, and when the loop resets it lunges. (Admin's clock never runs out, so it never comes.)
  const STALK = 20, escapedNow = !!(game.flags && game.flags.escaped);
  const near = phase === "playing" && !escapedNow && game.timeLeft <= STALK ? 1 - game.timeLeft / STALK : 0;
  $("room").style.setProperty("--stalk", near.toFixed(3));
  $("room").classList.toggle("stalked", near > 0);
  const attacked = phase === "playing" && game.loop > ($("room")._stalkLoop ?? game.loop);
  if (attacked) {
    $("room").dataset.scare = "timeout";
    replay($("room"), "vamp");
    splatter();
    jolt("big");
    document.dispatchEvent(new Event("tle-bite"));
    document.dispatchEvent(new Event("tle-scare"));
  }
  $("room")._stalkLoop = game.loop;
  $("room").classList.toggle("casket-open", !!(game.flags && game.flags.casketOpen));
  $("room").classList.toggle("power-on", !!(game.flags && game.flags.powerOn));
  $("room").classList.toggle("gate-closed", !!(game.flags && game.flags.gateClosed));
  $("room").classList.toggle("lift-power", !!(game.flags && game.flags.liftPower));
  $("room").classList.toggle("vent-out", stage === 3 && out);
  $("room").classList.toggle("later", game.loop >= 2);
  const scrawl = $("room").querySelector(".scrawl-name");
  if (scrawl) set(scrawl, "textContent", (game.partner ? game.partner.name : "them").toUpperCase().slice(0, 10));
  if (phase !== "lobby" && $("room")._seed !== game.seed) { $("room")._seed = game.seed; placeObjects(); }

  // Chat: kept across loops, and it scrolls to the newest line
  const log = $("chat-log"), lines = game.chat || [];
  set(log, "innerHTML", lines.length
    ? lines.map((m) => `<li${m.mine ? ' class="me"' : ""}><b>${m.mine ? "You" : esc(m.from)}:</b> ${esc(m.text)}</li>`).join("")
    : '<li class="empty">Tell your partner what you find. Half of your clues are in their room.</li>');
  if (lines.length !== log._count) { log._count = lines.length; log.scrollTop = log.scrollHeight; }

  // In-game input, whenever an object needs typing
  const box = $("game-input"), asking = phase === "playing" ? game.input : null;
  box.hidden = !asking;
  document.body.classList.toggle("asking", !!asking);
  if (asking && box._for !== asking.for) {
    box._for = asking.for;
    $("game-input-label").textContent = asking.label;
    $("game-input-text").value = "";
    setTimeout(() => $("game-input-text").focus());
  }
  if (!asking) box._for = null;

  // Out of the building, waiting for the partner
  document.body.classList.toggle("waiting", out && phase === "playing");
  const note = $("room").querySelector(".out-note") || $("room").appendChild(Object.assign(document.createElement("div"), { className: "out-note" }));
  set(note, "textContent", out ? `You're out. Talk ${o ? o.name : "your partner"} through it.` : "");

  // Inventory (resets every loop)
  const inv = $("inventory");
  const had = inv._count ?? game.items.length;
  set(inv, "innerHTML", "<h2>Inventory</h2>" + (game.items.length
    ? "<ul>" + game.items.map((i) => `<li>${i === "key" ? '<svg viewBox="0 0 90 28" aria-hidden="true"><path d="M23 14h34M46 14v8M52 14v6" fill="none" stroke="#85683c" stroke-width="4"></path><circle cx="14" cy="14" r="10" fill="none" stroke="#85683c" stroke-width="4"></circle><path d="M57 14l7 0" stroke="#d8d0ba"></path><path d="M64 7h24v14H64z" fill="#c9bf9f"></path><text x="67" y="18" font-family="monospace" font-size="9" fill="#17140d">14-B</text></svg>' : ""}${esc(i)}${i === "key" ? "<small>Return before sunrise.</small>" : ""}</li>`).join("") + "</ul>"
    : '<p class="empty">Empty pockets.</p>'));
  inv.querySelectorAll("li").forEach((li, i) => { if (i >= had) { li.classList.add("new"); flyToTray(li); } });
  inv._count = game.items.length;

  // Clue journal (survives the reset). The newest clue gets highlighted when it's written.
  const journal = $("journal");
  const known = journal._count ?? game.clues.length;  // first render: nothing counts as new
  set(journal, "innerHTML", "<h2>Journal</h2>" + (game.clues.length
    ? "<ol>" + game.clues.map((c) => `<li${c.startsWith("Memory:") ? ' class="memory"' : ""}>${esc(c)}</li>`).join("") + "</ol>"
    : '<p class="empty">Nothing written yet. Clues you find stay here, even when the loop resets.</p>'));
  journal.querySelectorAll("li").forEach((li, i) => { if (i >= known) li.classList.add("new"); });
  if (game.clues.length > known) journal.scrollTop = journal.scrollHeight;  // show the clue just written
  journal._count = game.clues.length;

  // Message: pops each time an object says something new
  const msg = $("message");
  if (msg.textContent !== (game.message || "")) {
    msg.textContent = game.message || "";
    if (game.message) replay(msg, "pop");
  }
  msg.setAttribute("aria-live", "polite");

  // Room visual states
  const f = game.flags || {};
  cssVar($("room"), "--dread", Math.min(game.loop, 5));  // the figure stands closer every loop
  cssVar($("obj-painting"), "--clicks", f.paintingClicks || 0);  // tilts a bit more on every click
  $("obj-painting")?.classList.toggle("moved", !!f.paintingMoved);
  $("obj-cabinet")?.classList.toggle("open", !!f.cabinetOpen);
  $("obj-door")?.classList.toggle("unlocked", !!f.doorUnlocked);
  $("obj-computer")?.classList.toggle("unlocked", !!f.doorUnlocked);  // screen turns green after the right password

  // Loop-reset flash when game.loop goes up (last loop stored on the DOM, not as extra global state)
  const prev = Number(document.body.dataset.loop || game.loop);
  if (game.loop > prev) {
    let flash = $("loop-flash");
    if (!flash) {
      flash = document.createElement("div");
      flash.addEventListener("animationend", () => flash.classList.remove("show"));
      flash.id = "loop-flash";
      flash.setAttribute("role", "status");
      document.body.append(flash);
    }
    flash.innerHTML = `<div>Time's up. The loop resets…<small>Your items are gone, but your journal remembers. Loop ${game.loop}</small></div>`;
    setTimeout(() => replay(flash, "show"), attacked ? 1800 : 0);  // let the vampire's attack land first
    replay($("journal"), "remember");  // glows as the flash fades: "your clues survived"
  }
  data("loop", game.loop);

  // End screen: both escaped, or the partner left
  const over = phase === "over";
  let win = $("win");
  if (over && !win) {
    win = document.createElement("div");
    win.id = "win";
    win.setAttribute("role", "dialog");
    win.setAttribute("aria-label", "Result");
    document.body.append(win);
  }
  if (win) {
    win.hidden = !over;
    const who = esc(o ? o.name : "Your partner"), loops = `${game.loop} loop${game.loop === 1 ? "" : "s"}`;
    set(win, "innerHTML", `<div class="${game.won ? "first" : "second"}"><h1>${game.won ? "You both got out" : "Your partner left"}</h1>`
      + `<p>${game.won ? `You and ${who} escaped together after ${loops}.` : `${who} is gone, and nobody leaves floor 14 alone.`}</p>`
      + (game.won ? `<table class="ledger"><caption>Meridian Trust, floor 14. Visitor log, 13 October</caption><tr><th>Name</th><th>In</th><th>Out</th></tr>`
        + `<tr class="gone"><td>━━━━━━</td><td>23:59</td><td></td></tr><tr class="gone"><td>━━━━━━</td><td>23:59</td><td></td></tr>`
        + `<tr class="us"><td>${esc(game.playerName)}</td><td>23:59</td><td>signed out</td></tr><tr class="us"><td>${who}</td><td>23:59</td><td>signed out</td></tr></table><p class="clock-stopped">Behind you, the clock stops.</p>` : "")
      + `<button type="button" onclick="toMainMenu()">Main menu</button>${game.won ? '<p class="auto">Back to the main menu in a few seconds…</p>' : ""}</div>`);
    if (over && !win._focused) { win._focused = true; setTimeout(() => win.querySelector("button")?.focus()); }  // keyboard users land on "Main menu"
    if (over && game.won && !win._auto) win._auto = setTimeout(toMainMenu, 10000);  // a win returns to the menu by itself
  }
}

// Juice, in tiers. Small: the press scale in CSS. Medium: an item flies into the tray. Big: the room jolts and flashes.
// Every effect is short and returns to rest; reduced motion and "Flickering light: off" turn the jolt and flash off in CSS.
function jolt(size) {
  const scene = document.querySelector("#room .scene"), room = document.getElementById("room");
  if (!scene || !room) return;
  scene.classList.remove("jolt-big", "jolt-small"); void scene.offsetWidth; scene.classList.add("jolt-" + size);
  let flash = document.getElementById("flashfx");
  if (!flash) { room.insertAdjacentHTML("beforeend", '<div id="flashfx" aria-hidden="true"></div>'); flash = document.getElementById("flashfx"); }
  if (size === "big") { flash.classList.remove("show"); void flash.offsetWidth; flash.classList.add("show"); }
}
function flyToTray(li) {
  const room = document.getElementById("room"), icon = li.querySelector("svg");
  if (!room || !icon || document.body.classList.contains("no-flicker") || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const from = room.getBoundingClientRect(), to = li.getBoundingClientRect(), fly = icon.cloneNode(true);
  fly.classList.add("fly");
  fly.style.left = from.left + from.width / 2 - 40 + "px"; fly.style.top = from.top + from.height / 2 - 14 + "px";
  fly.style.setProperty("--dx", to.left - (from.left + from.width / 2 - 40) + "px"); fly.style.setProperty("--dy", to.top - (from.top + from.height / 2 - 14) + "px");
  document.body.append(fly);
  fly.addEventListener("animationend", () => fly.remove());
}

// Blood on the screen at the peak of a bite: a few splats in new places each time, then they run and fade
function splatter() {
  let box = document.getElementById("blood");
  if (!box) {  // buildRoom() redraws #room, so the layer is made when it is first needed
    document.getElementById("room").insertAdjacentHTML("beforeend", '<div id="blood" aria-hidden="true"></div>');
    box = document.getElementById("blood");
  }
  const shapes = [
    "M50 10c8 0 10 14 18 16s16-6 20 2-8 14-4 22 16 10 10 18-18 0-22 8 4 18-6 20-10-14-18-12-12 14-20 8 4-16-4-22-20 0-20-10 14-10 14-18-12-16-6-22 16 4 22-2-2-20 6-24z",
    "M50 22c14-6 30 2 32 16 2 12-10 16-6 26s-6 22-20 18-14 8-26 2-6-18-14-24-10-20 2-26 18-4 32-12z",
    "M30 40c6-16 30-24 44-12 10 8 2 18 14 26s0 20-14 18-16 10-30 4-6-14-16-20-4-10 2-16z",
  ];
  box.innerHTML = Array.from({ length: 4 }, (_, i) => {
    const x = 8 + Math.random() * 74, y = 6 + Math.random() * 48, s = 9 + Math.random() * 12, d = shapes[i % shapes.length];  // looks only, not game logic
    const drops = [0, 1, 2].map((k) => `<rect class="trickle" x="${30 + k * 18 + Math.random() * 8}" y="60" width="4" height="40" rx="2" fill="#7a0905" style="animation-delay:${(1.7 + k * .15).toFixed(2)}s"/>`).join("");
    return `<svg class="splat" viewBox="0 0 100 140" style="left:${x}%;top:${y}%;width:${s}%"><path d="${d}" fill="#8c0d08"/><circle cx="${10 + Math.random() * 80}" cy="${10 + Math.random() * 40}" r="3" fill="#8c0d08"/><circle cx="${10 + Math.random() * 80}" cy="${50 + Math.random() * 20}" r="2" fill="#8c0d08"/>${drops}</svg>`;
  }).join("");
  box.classList.remove("show");
  void box.offsetWidth;
  box.classList.add("show");
}

// Co-op panels that live for the whole page: chat, the in-game input and the +1:00 flash. Created once, filled by render().
(() => {
  const $ = (id) => document.getElementById(id);
  document.body.insertAdjacentHTML("beforeend", `
    <section id="chat" aria-label="Chat with your partner">
      <h2>Chat</h2>
      <ul id="chat-log" aria-live="polite"></ul>
      <form id="chat-form"><label for="chat-text" class="sr-only">Message</label><input id="chat-text" maxlength="200" autocomplete="off" placeholder="Tell your partner…"><button>Send</button></form>
    </section>
    <form id="game-input" hidden><label id="game-input-label" for="game-input-text"></label>
      <input id="game-input-text" autocomplete="off" spellcheck="false">
      <div class="row"><button>Enter</button><button type="button" id="game-input-cancel">Step back</button></div></form>`);
  $("room").addEventListener("click", (e) => { const o = e.target.closest?.(".obj"); if (o) $("room")._last = o.id.slice(4); }, true);  // where a bite came from
  $("hud").insertAdjacentHTML("beforeend", '<span id="bonus" aria-hidden="true">+1:00</span><span id="drain" aria-hidden="true">-20s</span>');

  $("chat-form").addEventListener("submit", (e) => {
    e.preventDefault();
    sendChat($("chat-text").value);
    $("chat-text").value = "";
  });
  $("game-input").addEventListener("submit", (e) => { e.preventDefault(); onInput($("game-input-text").value); });
  $("game-input-cancel").addEventListener("click", () => onInput(null));
  $("game-input").addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); onInput(null); } });

  // The lobby form is redrawn by render(), so its events are handled here.
  // Loop picker: the gold line slides under the chosen tile; the 10 min tile only exists for the name admin.
  const placeLoopLine = () => {
    const line = document.querySelector("#lobby .loop-line"), chosen = document.querySelector("#lobby input[name=loop]:checked")?.closest(".loop");
    if (!line || !chosen) return;
    line.style.left = chosen.offsetLeft + "px";
    line.style.width = chosen.offsetWidth + "px";
  };
  const syncAdminLoop = () => {
    const ten = document.querySelector("#lobby .loop[data-admin]"), name = $("player-name");
    if (!ten || !name) return;
    const admin = name.value.trim().toLowerCase() === "admin";  // ponytail: testing cheat, connect() also checks it
    ten.hidden = !admin;
    if (!admin && ten.querySelector("input").checked) document.querySelector("#lobby input[name=loop][value='60']").checked = true;
    placeLoopLine();
  };
  $("lobby").addEventListener("change", placeLoopLine);
  $("lobby").addEventListener("input", (e) => { if (e.target.id === "player-name") syncAdminLoop(); });
  addEventListener("resize", placeLoopLine);
  new MutationObserver(syncAdminLoop).observe($("lobby"), { childList: true });  // the form was just drawn
  requestAnimationFrame(syncAdminLoop);
  $("lobby").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = $("player-name").value.trim(), code = $("room-code").value.trim().toUpperCase();
    const how = document.activeElement === $("room-code") || (!e.submitter && code) ? "join" : e.submitter?.value || "create";
    const problem = !name ? "Enter your name first." : how === "join" && !/^[A-Z]{4}$/.test(code) ? "A room code is 4 letters, like QXTR." : "";
    const error = $("lobby-error");
    error.hidden = !problem;
    error.textContent = problem;
    if (problem) return;
    if (how === "create") connect(name, makeRoomCode(), Number(document.querySelector("#lobby input[name=loop]:checked")?.value || 60));
    else if (how === "join") connect(name, code);
    else connect(name);
  });
  $("lobby").addEventListener("click", (e) => {
    if (e.target.id !== "copy-code") return;
    const done = () => { e.target.textContent = "Copied"; };
    const fallback = () => {
      const range = document.createRange();
      range.selectNodeContents($("room-code-shown"));
      getSelection().removeAllRanges();
      getSelection().addRange(range);
      e.target.textContent = document.execCommand("copy") ? "Copied" : "Press Ctrl+C";
    };
    if (navigator.clipboard) navigator.clipboard.writeText(game.code).then(done, fallback); else fallback();
  });
})();
// Music and settings. Settings belong to this device, not the match, so they live here and not in `game`.
// The music is generated in the browser, so there are no audio files and it works from file://.
const updateSound = (() => {
  const $ = (id) => document.getElementById(id);
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem("tle-settings")) || {}; } catch {}
  const opts = {
    muted: !!saved.muted,
    volume: saved.volume ?? .7,
    sfx: saved.sfx ?? .8,
    noFlicker: saved.noFlicker ?? matchMedia("(prefers-reduced-motion: reduce)").matches,
  };
  const save = () => { try { localStorage.setItem("tle-settings", JSON.stringify(opts)); } catch {} };

  document.body.insertAdjacentHTML("beforeend", `
    <button id="settings-btn" type="button" aria-expanded="false" aria-controls="settings-panel">⚙ Settings</button>
    <div id="settings-panel" role="group" aria-label="Settings" hidden>
      <h2>Settings</h2>
      <button id="set-mute" type="button"></button>
      <label for="set-volume">Music volume</label>
      <input id="set-volume" type="range" min="0" max="1" step="0.05">
      <label for="set-sfx">Sound effects volume</label>
      <input id="set-sfx" type="range" min="0" max="1" step="0.05">
      <button id="set-flicker" type="button"></button>
      <p>Stops the flickering light, the screen shake and the flashing static.</p>
    </div>`);

  // Audio graph: music and effects have their own volume, and master is the mute.
  let ctx, master, musicBus, sfxBus, echo, noise, beds = {}, stageNow = 0, mode = "", melodyTimer, heartTimer, melodyStep = 0, seen = null;
  const fade = (param, to, seconds) => { param.cancelScheduledValues(ctx.currentTime); param.setTargetAtTime(to, ctx.currentTime, seconds / 3); };
  const tone = (type, freq, out, gain = 1) => {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = freq; g.gain.value = gain;
    o.connect(g).connect(out);
    o.start();
    return { o, g };
  };
  // One ambient track per level: [wave, pitch, loudness], plus how open the filter is
  const TRACKS = {
    1: { cutoff: 170, parts: [["sawtooth", 55, .16], ["sawtooth", 55.5, .16], ["sine", 82.41, .2], ["triangle", 110.7, .04], ["sawtooth", 120, .012]] },  // office: drone and the buzz of the tube
    2: { cutoff: 300, parts: [["sine", 41.2, .34], ["sine", 61.74, .14], ["sawtooth", 55, .05], ["triangle", 880, .007], ["triangle", 883, .007]] },  // corridor: cold, a thin whine far away
    3: { cutoff: 240, parts: [["sawtooth", 73.42, .11], ["sawtooth", 73.9, .11], ["square", 36.71, .06], ["sine", 220, .012]] },  // shaft: metal humming in the cables
  };
  const makeTrack = (track) => {
    const filter = ctx.createBiquadFilter(), gain = ctx.createGain();
    filter.type = "lowpass"; filter.frequency.value = track.cutoff; gain.gain.value = 0;
    filter.connect(gain).connect(musicBus);
    for (const [type, f, g] of track.parts) tone(type, f, filter, g);
    tone("sine", .06, filter.frequency, track.cutoff * .3);  // it slowly breathes
    return { filter, gain, cutoff: track.cutoff };
  };
  const NOTES = [220, 261.63, 233.08, 196, 174.61, 220, 329.63, 311.13];  // A minor, with flat seconds that sound wrong
  const GAPS = [5000, 3500, 7000, 4000, 9000, 3000, 6000, 8000];  // ponytail: fixed order, no random needed
  const note = () => {
    const t = ctx.currentTime, freq = NOTES[melodyStep % NOTES.length] * [1, .5, .75][stageNow - 1 || 0];
    for (const [type, f, peak] of [["sine", freq, .13], ["triangle", freq * 2.01, .025]]) {
      const { o, g } = tone(type, f, musicBus, 0);
      g.connect(echo);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(peak, t + .02);
      g.gain.exponentialRampToValueAtTime(.0001, t + 4);
      o.stop(t + 4.1);
    }
  };
  const melody = () => {
    if (mode === "play") note();
    melodyTimer = setTimeout(melody, GAPS[melodyStep++ % GAPS.length]);
  };
  // One short sound: a wave that may glide from one pitch to another and dies away
  const vary = (f) => f * (1 + (Math.random() - .5) * .08);  // UI sound only, not game logic
  const blip = (type, from, to, peak, seconds, delay = 0, out = sfxBus) => {
    if (out === sfxBus) { const k = vary(1); from *= k; to *= k; }
    const t = ctx.currentTime + delay, { o, g } = tone(type, from, out, 0);
    o.frequency.setValueAtTime(from, t);
    if (to !== from) o.frequency.exponentialRampToValueAtTime(to, t + seconds);
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(.001, t + seconds);
    o.stop(t + seconds + .05);
  };
  const hiss = (peak, seconds, freq, delay = 0) => {  // a burst of noise through a band filter
    const t = ctx.currentTime + delay, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noise; s.loop = true; f.type = "bandpass"; f.frequency.value = vary(freq);
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(.001, t + seconds);
    s.connect(f).connect(g).connect(sfxBus);
    s.start(t); s.stop(t + seconds + .05);
  };
  const SFX = {
    click: () => hiss(.18, .04, 1800),
    chat: () => blip("sine", 660, 660, .07, .08),
    key: () => { blip("triangle", 1568, 1568, .16, .18); blip("triangle", 2093, 2093, .14, .3, .09); hiss(.08, .1, 4000); },
    unlock: () => { blip("square", 180, 90, .2, .09); hiss(.25, .07, 1200, .08); blip("sine", 70, 45, .5, .25, .08); },
    wrong: () => { blip("sawtooth", 110, 104, .28, .35); blip("sawtooth", 116, 110, .2, .35); },
    casket: () => { blip("sawtooth", 95, 52, .22, 1.1); hiss(.12, .9, 500); blip("sine", 58, 36, .6, .4, .85); },
    reset: () => { hiss(.5, 1.1, 2400); blip("sawtooth", 880, 55, .16, .9); },
    level: () => { blip("sine", 60, 34, .7, .5); hiss(.2, .5, 700); },
    win: () => { [220, 261.63, 329.63, 440].forEach((f, i) => blip("sine", f, f, .16, 3, i * .22)); },
    bite: () => { hiss(.45, .5, 3400); blip("sawtooth", 190, 80, .22, .45); hiss(.3, .2, 700, .25); },
    groan: (loud) => { const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter(), lfo = ctx.createOscillator(), lg = ctx.createGain();
      o.type = "sawtooth"; o.frequency.setValueAtTime(92, t); o.frequency.linearRampToValueAtTime(66, t + 1.6); f.type = "lowpass"; f.frequency.value = 520;
      lfo.frequency.value = 7; lg.gain.value = 9; lfo.connect(lg).connect(o.frequency);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(loud ? .32 : .18, t + .25); g.gain.exponentialRampToValueAtTime(.001, t + 1.8);
      o.connect(f).connect(g).connect(sfxBus); o.start(t); lfo.start(t); o.stop(t + 1.9); lfo.stop(t + 1.9); hiss(loud ? .12 : .07, 1.4, 380); },
    growl: () => { SFX.groan(true); blip("sawtooth", 140, 60, .25, .7); hiss(.25, .6, 260); },
    bang: () => { blip("sine", 70, 40, .55, .3); hiss(.3, .25, 900); blip("square", 140, 90, .08, .2, .05); },
    hit: () => { for (const [type, f, peak] of [["sine", 38, .8], ["sawtooth", 233.08, .12], ["sawtooth", 246.94, .12], ["sawtooth", 261.63, .12]]) blip(type, f, f, peak, 1.8); },
  };
  const heart = () => { blip("sine", 62, 38, .6, .26, 0, musicBus); blip("sine", 62, 38, .4, .26, .22, musicBus); };
  // --- Voices and creatures in the dark: a woman crying, laughter, and animals, from random directions. ---
  // Made from a buzzing source through vowel filters (formants) so it sounds like a throat, far away and echoing.
  // Math.random here is audio only, never game logic.
  let creatureTimer;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const VOWELS = { a: [800, 1150, 2900], o: [500, 900, 2600], u: [350, 800, 2700], e: [400, 2000, 2800] };
  // A voice: pitch points [time, Hz] glide along a curve; vowel picks the formants; returns its loudness control
  const voice = (pitch, vowel, peak, seconds, { pan = rnd(-.9, .9), vibrato = 6, depth = .025, breath = .15, delay = 0 } = {}) => {
    const t = ctx.currentTime + delay, o = ctx.createOscillator(), vib = ctx.createOscillator(), vibAmt = ctx.createGain();
    const out = ctx.createGain(), panner = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain(), far = ctx.createBiquadFilter();
    o.type = "sawtooth"; vib.frequency.value = vibrato; vibAmt.gain.value = pitch[0][1] * depth;
    vib.connect(vibAmt).connect(o.frequency);
    for (const [i, [at, hz]] of pitch.entries()) {
      if (i) o.frequency.exponentialRampToValueAtTime(hz, t + at);
      else o.frequency.setValueAtTime(hz, t + at);
    }
    far.type = "lowpass"; far.frequency.value = 3200;
    if (panner.pan) panner.pan.value = pan;
    out.gain.value = 0; out.connect(far).connect(panner).connect(musicBus); panner.connect(echo);
    for (const [i, f] of VOWELS[vowel].entries()) {
      const bp = ctx.createBiquadFilter(), g = ctx.createGain();
      bp.type = "bandpass"; bp.frequency.value = f; bp.Q.value = 9; g.gain.value = [1, .55, .2][i];
      o.connect(bp).connect(g).connect(out);
    }
    if (breath) {  // air in the voice
      const n = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
      n.buffer = noise; n.loop = true; bp.type = "bandpass"; bp.frequency.value = 1800; g.gain.value = breath;
      n.connect(bp).connect(g).connect(out); n.start(t); n.stop(t + seconds + .1);
    }
    o.start(t); vib.start(t); o.stop(t + seconds + .1); vib.stop(t + seconds + .1);
    out.gain.setValueAtTime(0, t);
    return { gain: out.gain, t, peak };
  };
  const envelope = ({ gain, t, peak }, steps) => {
    for (const [at, v] of steps) gain.linearRampToValueAtTime(v * peak, t + at);
  };
  const CREATURES = {
    cry() {  // sobbing: falling wails broken by catches of breath
      const base = rnd(380, 470), pan = rnd(-.8, .8);
      for (let k = 0; k < 3; k++) {
        const len = rnd(1.1, 1.8), at = k * 2.1;
        const v = voice([[0, base * 1.12], [len * .3, base * 1.2], [len, base * .78]], k % 2 ? "o" : "u", .09, len, { pan, delay: at, depth: .04, vibrato: 7 });
        envelope(v, [[.05, .9], [len * .25, .4], [len * .3, 1], [len * .55, .3], [len * .6, .8], [len, 0]]);
        hiss(.03, .35, 2200, at + len + .1);  // the sharp breath in between
      }
    },
    laugh() {  // a run of "ha" that slows down and drops; sometimes pitched down and wrong
      const wrong = Math.random() < .4, base = wrong ? rnd(150, 200) : rnd(330, 420), pan = rnd(-.9, .9), n = 6 + Math.floor(rnd(0, 4));
      let at = 0;
      for (let k = 0; k < n; k++) {
        const hz = base * (1 - k * .03), len = .16 + k * .015;
        const v = voice([[0, hz * 1.08], [len, hz * .92]], "a", .1 * (1 - k / (n + 2)), len, { pan, delay: at, depth: .01, breath: .3 });
        envelope(v, [[.02, 1], [len * .6, .5], [len, 0]]);
        at += len + .06 + k * .02;
      }
    },
    howl() {  // a dog or wolf far off
      const base = rnd(320, 420), len = rnd(3, 4.2);
      const v = voice([[0, base * .7], [len * .25, base * 1.3], [len * .8, base * 1.15], [len, base * .7]], "u", .07, len, { depth: .015, vibrato: 5, breath: .05 });
      envelope(v, [[.6, .8], [len * .6, 1], [len, 0]]);
    },
    caw() {  // crows: rough, nasal bursts
      const pan = rnd(-1, 1), times = 2 + Math.floor(rnd(0, 3));
      for (let k = 0; k < times; k++) {
        const v = voice([[0, 720], [.28, 520]], "a", .08, .3, { pan, delay: k * .45, depth: .08, vibrato: 32, breath: .4 });
        envelope(v, [[.02, 1], [.2, .6], [.3, 0]]);
      }
    },
    growl() {  // something low and close
      const len = rnd(1.6, 2.6), v = voice([[0, 62], [len, 52]], "o", .18, len, { depth: .2, vibrato: 18, breath: .5 });
      envelope(v, [[.3, 1], [len * .7, .8], [len, 0]]);
    },
    squeak() {  // rats in the walls
      for (let k = 0; k < 3 + Math.floor(rnd(0, 3)); k++) blip("sine", rnd(2800, 4200), rnd(2400, 3600), .03, .07, k * rnd(.08, .2), musicBus);
    },
  };
  // Which ones haunt which level (repeats make them more likely)
  const HAUNTS = { 1: ["cry", "cry", "laugh", "squeak", "howl"], 2: ["laugh", "laugh", "growl", "cry", "caw"], 3: ["cry", "growl", "squeak", "howl", "laugh"] };
  window.__tleCreatures = CREATURES;  // ponytail: lets a test (or the console) play each one
  const creatures = () => {
    if (["lobby", "play", "hurry"].includes(mode)) {
      const list = HAUNTS[stageNow || 1];
      CREATURES[list[Math.floor(Math.random() * list.length)]]();
    }
    creatureTimer = setTimeout(creatures, rnd(6000, 14000) * (mode === "hurry" ? .5 : 1));
  };


  let tense;
  const update = () => {
    const f = game.flags || {}, over = game.phase === "over", dead = document.body.classList.contains("dead"), out = f.escaped;
    const stage = game.stage || 1;
    const next = dead ? "dead" : over ? "end" : game.phase === "playing" ? (game.timeLeft <= 10 && !out ? "hurry" : "play") : "lobby";
    if (!ctx) { mode = next; stageNow = stage; return; }
    // Effects: compare with the last look at the game, so the mechanics code doesn't have to know about sound
    if (seen) {
      if (game.items.length > seen.items) SFX.key();
      if (["doorUnlocked", "cabinetOpen", "powerOn", "gateClosed"].some((k) => f[k] && !seen.flags[k])) SFX.unlock();
      if (f.lockedUntil !== undefined && f.lockedUntil !== seen.flags.lockedUntil) SFX.wrong();
      if (f.casketOpen && !seen.flags.casketOpen) SFX.casket();
      if (game.loop > seen.loop) { SFX.reset(); duck(2.2); }
      else if (stage > seen.stage) SFX.level();
      if (game.chat.length > seen.chat) SFX.chat();
      if (over && game.won && !seen.won) SFX.win();
    }
    seen = { items: game.items.length, flags: { ...f }, loop: game.loop, stage, chat: game.chat.length, won: over && game.won };
    if (next === mode && stage === stageNow) return;
    const modeChanged = next !== mode;
    mode = next; stageNow = stage;
    const level = { lobby: .6, play: 1, hurry: 1.25, end: 0, dead: 0 }[next];
    for (const [s, track] of Object.entries(beds)) {
      const here = Number(s) === stage;
      fade(track.gain.gain, here ? level : 0, next === "dead" ? .6 : 2.5);  // crossfades when the level changes
      fade(track.filter.frequency, track.cutoff * (here && next === "hurry" ? 2.4 : 1), 1);
    }
    if (!modeChanged) return;
    clearInterval(heartTimer);
    if (next === "hurry") { heart(); heartTimer = setInterval(heart, 950); }
    if (tense) fade(tense.gain, next === "hurry" ? .05 : 0, next === "hurry" ? .8 : .4);
    if (next === "dead") setTimeout(SFX.hit, 900);  // lands as the figure reaches you
    if (next === "dead" || next === "end") clearTimeout(melodyTimer);
    if (next === "dead" || next === "end") clearTimeout(creatureTimer);
  };

  const start = () => {
    if (ctx) return;
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return;
    try {
      ctx = new Audio();
      const limiter = ctx.createDynamicsCompressor();
      master = ctx.createGain();
      master.gain.value = opts.muted ? 0 : 1;
      master.connect(limiter).connect(ctx.destination);
      musicBus = ctx.createGain(); musicBus.gain.value = opts.volume; musicBus.connect(master);
      sfxBus = ctx.createGain(); sfxBus.gain.value = opts.sfx; sfxBus.connect(master);
      noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      noise.getChannelData(0).forEach((_, i, a) => { a[i] = Math.random() * 2 - 1; });  // audio only, not game logic
      const delay = ctx.createDelay(1), feedback = ctx.createGain(), dull = ctx.createBiquadFilter();
      echo = ctx.createGain();
      delay.delayTime.value = .47; feedback.gain.value = .5; dull.type = "lowpass"; dull.frequency.value = 1400;
      echo.connect(delay).connect(dull).connect(feedback).connect(delay);
      dull.connect(musicBus);
      for (const s of [1, 2, 3]) beds[s] = makeTrack(TRACKS[s]);
      // The last 10 seconds get a layer of their own: two close notes beating against each other, fast
      tense = ctx.createGain(); tense.gain.value = 0; tense.connect(musicBus);
      tone("sawtooth", 466.16, tense, .5); tone("sawtooth", 493.88, tense, .5); const trem = tone("sine", 9, tense.gain, .04);
      mode = ""; stageNow = 0;
      update();
      melody();
      creatureTimer = setTimeout(creatures, 3000);  // the first sound a few seconds after you arrive
      ctx.resume().catch(() => {});
    } catch { ctx = null; }  // no sound is better than a broken game
  };
  document.addEventListener("tle-scare", () => { if (ctx) SFX.hit(); });
  document.addEventListener("tle-bite", () => { if (ctx) { SFX.bite(); duck(2.6); } });
  // Duck the music under a big scare, then let it come back
  function duck(seconds) {
    if (!ctx) return;
    const t = ctx.currentTime, g = musicBus.gain;
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(opts.volume * .2, t + .08); g.setTargetAtTime(opts.volume, t + seconds * .6, seconds * .25);
  }
  // The zombie on level 3 groans every few seconds, more often and louder in the last 10 seconds; clicking it makes it lunge
  let groanAt = 0;
  setInterval(() => {
    if (!ctx || game.stage !== 3 || game.phase !== "playing" || (game.flags && game.flags.escaped)) return;
    const hurry = game.timeLeft <= 10, now = performance.now();
    if (now < groanAt) return;
    SFX.groan(hurry);
    groanAt = now + (hurry ? 2200 : 4200) + Math.random() * 3000;  // sound only, not game logic
  }, 500);
  addEventListener("click", (e) => { if (ctx && e.target.closest?.("#obj-zombie")) { SFX.growl(); duck(1.6); setTimeout(SFX.bang, 150); } });
  document.addEventListener("animationiteration", (e) => { if (ctx && e.animationName === "zlunge" && game.stage === 3 && game.phase === "playing") SFX.bang(); });  // lands with the slam at 70% of the cycle
  addEventListener("click", (e) => { if (ctx && e.target.closest?.(".obj, #game-input button, #lobby button, #chat-form button, #settings-panel button")) SFX.click(); });
  // Browsers only allow sound after the player does something.
  for (const type of ["pointerdown", "keydown"]) addEventListener(type, start, { capture: true });
  document.addEventListener("visibilitychange", () => { if (ctx) (document.hidden ? ctx.suspend() : ctx.resume()).catch(() => {}); });

  // Settings panel
  const apply = () => {
    $("set-mute").textContent = opts.muted ? "Unmute sound" : "Mute sound";
    $("set-mute").setAttribute("aria-pressed", opts.muted);
    $("set-volume").value = opts.volume;
    $("set-sfx").value = opts.sfx;
    $("set-flicker").textContent = opts.noFlicker ? "Allow flickering" : "Stop flickering";
    $("set-flicker").setAttribute("aria-pressed", opts.noFlicker);
    document.body.classList.toggle("no-flicker", opts.noFlicker);
    if (ctx) { fade(master.gain, opts.muted ? 0 : 1, .15); fade(musicBus.gain, opts.volume, .15); fade(sfxBus.gain, opts.sfx, .15); }
    save();
  };
  const toggle = (open) => {
    $("settings-panel").hidden = !open;
    $("settings-btn").setAttribute("aria-expanded", open);
  };
  $("settings-btn").addEventListener("click", () => toggle($("settings-panel").hidden));
  $("set-mute").addEventListener("click", () => { opts.muted = !opts.muted; apply(); });
  $("set-volume").addEventListener("input", (e) => { opts.volume = +e.target.value; opts.muted = false; apply(); });
  $("set-sfx").addEventListener("input", (e) => { opts.sfx = +e.target.value; opts.muted = false; apply(); });
  $("set-flicker").addEventListener("click", () => { opts.noFlicker = !opts.noFlicker; apply(); });
  addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("settings-panel").hidden) { toggle(false); $("settings-btn").focus(); } });
  addEventListener("pointerdown", (e) => { if (!e.target.closest?.("#settings-panel, #settings-btn")) toggle(false); });
  apply();
  return update;
})();

// Back to the lobby. Drops ?room=&name= so a reload doesn't rejoin the room you just finished.
function toMainMenu() { location.href = location.pathname; }
