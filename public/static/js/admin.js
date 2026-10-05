/* Panel de administración: partida, moderación, temáticas y palabras. */
(function () {
  "use strict";
  var E = RoscoUI.esc;
  var LETTERS = "ABCDEFGHIJLMNÑOPQRSTUVXYZ".split("");

  function api(path, opts) {
    opts = opts || {};
    opts.headers = { "Content-Type": "application/json" };
    return fetch("/api" + path, opts).then(function (r) {
      return r.json().then(function (j) {
        if (!r.ok) throw new Error(j.error || "Error del servidor");
        return j;
      });
    });
  }

  function copyText(t, btn) {
    function done() {
      var old = btn.textContent;
      btn.textContent = "¡Copiado!";
      setTimeout(function () { btn.textContent = old; }, 1600);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(t).then(done, function () { fallback(); });
    } else fallback();
    function fallback() {
      var ta = document.createElement("textarea");
      ta.value = t; document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); } catch (e) {}
      document.body.removeChild(ta); done();
    }
  }

  /* ---------------- tabs ---------------- */
  var tabs = document.querySelectorAll(".tabs button");
  tabs.forEach(function (b) {
    b.addEventListener("click", function () {
      tabs.forEach(function (x) { x.classList.remove("active"); });
      b.classList.add("active");
      ["partida", "moderacion", "tematicas", "palabras"].forEach(function (t) {
        document.getElementById("tab-" + t).hidden = t !== b.dataset.tab;
      });
      if (b.dataset.tab === "tematicas") loadThemes();
      if (b.dataset.tab === "palabras") initWords();
      if (b.dataset.tab === "partida") loadThemeOptions();
    });
  });

  /* ---------------- partida ---------------- */
  var minSel = document.getElementById("np-min");
  for (var mm = 1; mm <= 10; mm++) {
    var o = document.createElement("option");
    o.value = mm; o.textContent = mm + (mm === 1 ? " minuto" : " minutos");
    if (mm === 3) o.selected = true;
    minSel.appendChild(o);
  }

  function loadThemeOptions() {
    return api("/themes").then(function (themes) {
      var sel = document.getElementById("np-theme");
      sel.innerHTML = "";
      themes.forEach(function (t) {
        var o = document.createElement("option");
        o.value = t.id; o.textContent = t.name + " (" + t.definitions + " defs)";
        sel.appendChild(o);
      });
    });
  }
  loadThemeOptions();

  function qrCard(title, link, qr, code) {
    return "<div class='qr-card'><div class='meta'>" +
      "<div class='t'>" + E(title) + "</div>" +
      "<div class='link mono'>" + E(link) + "</div>" +
      "<div class='muted mono' style='font-size:12px'>Código: " + E(code) + "</div>" +
      "<button class='ghost' data-copy='" + E(link) + "'>Copiar acceso</button>" +
      "</div><img src='" + qr + "' alt='QR " + E(title) + "'/></div>";
  }

  document.getElementById("np-create").addEventListener("click", function () {
    var body = {
      themeId: Number(document.getElementById("np-theme").value),
      playerNames: [document.getElementById("np-p1").value, document.getElementById("np-p2").value],
      minutes: Number(minSel.value),
    };
    api("/games", { method: "POST", body: JSON.stringify(body) }).then(function (g) {
      var h = qrCard("Jugador 1", g.links.jugador1, g.qr.jugador1, g.code) +
        qrCard("Jugador 2", g.links.jugador2, g.qr.jugador2, g.code) +
        qrCard("Vista del público", g.links.publico, g.qr.publico, g.code) +
        qrCard("Moderador (este panel)", g.links.admin, g.qr.admin, g.code) +
        "<p><button class='ghost' id='np-goto-mod'>Ir a moderación</button> " +
        "<span class='muted'>Los QR apuntan a la IP de red local de este servidor.</span></p>";
      var box = document.getElementById("np-result");
      box.innerHTML = h;
      box.querySelectorAll("[data-copy]").forEach(function (b) {
        b.addEventListener("click", function () { copyText(b.dataset.copy, b); });
      });
      document.getElementById("np-goto-mod").addEventListener("click", function () {
        document.getElementById("md-code").value = g.code;
        document.querySelector("[data-tab=moderacion]").click();
        document.getElementById("md-join").click();
      });
    }).catch(function (e) { alert(e.message); });
  });

  // si viene #juego=CODIGO, ir directo a moderación
  (function () {
    var m = location.hash.match(/juego=([A-Za-z0-9]+)/);
    if (m) {
      document.getElementById("md-code").value = m[1].toUpperCase();
      document.querySelector("[data-tab=moderacion]").click();
      setTimeout(function () { document.getElementById("md-join").click(); }, 300);
    }
  })();

  /* ---------------- moderación ---------------- */
  var modConn = null, modCode = null, modLog = [], modState = null;

  document.getElementById("md-join").addEventListener("click", function () {
    var code = document.getElementById("md-code").value.trim().toUpperCase();
    if (!code) return;
    if (modConn) modConn.close();
    modCode = code;
    modLog = [];
    modState = null;
    modConn = RoscoUI.connectGame(code, "admin", { onState: renderMod, onError: function (e) { alert(e); } });
  });

  // Atajos de teclado del moderador: 1/2/3 juzgan, 4 pausa.
  document.addEventListener("keydown", function (e) {
    if (!modConn || !modState) return;
    var tag = (e.target && e.target.tagName) || "";
    if (/^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(tag)) return;
    if (document.getElementById("tab-moderacion").hidden) return;
    if (modState.status !== "playing") return;
    var ap = modState.players[modState.activePlayer];
    if (e.key === "1" && ap.current) doJudge("correct");
    else if (e.key === "2" && ap.current) doJudge("wrong");
    else if (e.key === "3" && ap.current) doJudge("pass");
    else if (e.key === "4") doPause();
  });

  function doJudge(res) {
    if (!modConn || !modState) return;
    var ap = modState.players[modState.activePlayer];
    if (!ap.current) return;
    var names = { correct: "Correcto", wrong: "Incorrecto", pass: "Pasapalabra" };
    logEvent("<b>" + E(ap.name) + "</b> · letra " + E(ap.current.letter) +
      " → <b>" + names[res] + "</b>");
    modConn.send({ type: "judge", result: res });
  }

  function doPause() {
    if (!modConn || !modState || modState.status !== "playing") return;
    logEvent("Pausa excepcional.");
    modConn.send({ type: "pause" });
  }

  function logEvent(html) {
    var d = new Date();
    var hh = ("0" + d.getHours()).slice(-2), mi = ("0" + d.getMinutes()).slice(-2);
    modLog.unshift("<div><span class='muted'>" + hh + ":" + mi + "</span> " + html + "</div>");
    modLog = modLog.slice(0, 12);
    var box = document.getElementById("md-log");
    if (box) box.innerHTML = modLog.join("") || "<div>Sin actividad todavía.</div>";
  }

  function chips(p) {
    return "<div class='chips'>" +
      "<span class='chip'>Aciertos<b>" + p.correct + "</b></span>" +
      "<span class='chip'>Errores<b>" + p.wrong + "</b></span>" +
      "<span class='chip'>Pendientes<b>" + RoscoUI.pendingCount(p) + "</b></span></div>";
  }

  function playerCard(p, isActive) {
    var sub = p.done ? "terminó" : (isActive ? "letra " + (p.current ? p.current.letter : "—") : "en espera");
    return "<div class='player-card" + (isActive ? " active" : "") + "'>" +
      "<div class='nm'>" + E(p.name) + "</div>" +
      "<div class='st mono'>" + RoscoUI.fmtTime(p.timeSec) + " · " + E(sub) + "</div></div>";
  }

  function renderMod(st) {
    modState = st;
    var box = document.getElementById("md-body");
    var ap = st.players[st.activePlayer];

    var badge = "En espera", bcls = "badge wait";
    if (st.status === "playing") { badge = "En juego"; bcls = "badge"; }
    else if (st.status === "paused") { badge = "En pausa"; bcls = "badge pause"; }
    else if (st.status === "finished") { badge = "Terminada"; bcls = "badge wait"; }

    var h = "<div class='stage-mod'>";

    // --- panel izquierdo: rosco del jugador activo + letra actual ---
    h += "<div class='panel panel-2'><span class='" + bcls + "'>" + badge + "</span>";
    h += "<div class='mod-rosco-grid' style='margin-top:14px'><div><svg id='mod-rosco'></svg></div><div>";
    if (st.status === "lobby") {
      h += "<div class='eyebrow'>Partida " + E(st.code) + " · " + E(st.theme) + "</div>" +
        "<h2 class='h-display'>Lista para empezar</h2>" +
        "<p class='definition'>Cuando los jugadores estén conectados, iniciá la partida.</p>" +
        "<p><button class='ok' id='md-start'>Iniciar partida</button></p>";
    } else if (st.status === "finished") {
      var w = st.winner == null ? "Empate." : "Ganó " + E(st.players[st.winner].name) + ".";
      h += "<div class='eyebrow'>Partida terminada</div>" +
        "<h2 class='h-display'>Fin del juego</h2>" +
        "<p class='definition'>" + w + "</p>" + chips(ap);
    } else if (ap.current) {
      h += "<div class='eyebrow'>" + E(ap.current.hint) + " · " + E(ap.name) + "</div>" +
        "<h2 class='h-display'>Letra " + E(ap.current.letter) + "</h2>" +
        "<p class='definition'>" + E(ap.current.definition) + "</p>" +
        "<div class='answer-box'><div class='lbl'>Respuesta visible al moderador</div>" +
        "<div class='val'>" + E(ap.current.answer || "—") +
        (ap.current.alt && ap.current.alt.length ? " <span class='muted' style='font-size:15px'>(también: " + E(ap.current.alt.join(", ")) + ")</span>" : "") +
        "</div></div>" + chips(ap);
      if (st.status === "paused") {
        h += "<p class='muted' style='margin-top:12px'>" + E(st.pausedReason || "") + "</p>" +
          "<p><button class='ok' id='md-resume'>Reanudar turno de " + E(ap.name) + "</button></p>";
      }
    }
    h += "</div></div></div>";

    // --- panel derecho: control de la ronda ---
    h += "<div class='panel panel-2'><h2 style='font-size:28px'>Control de la ronda</h2>" +
      "<p class='desc'>La respuesta nunca se oculta en esta vista.</p>";
    h += playerCard(st.players[0], st.status !== "finished" && st.activePlayer === 0);
    h += playerCard(st.players[1], st.status !== "finished" && st.activePlayer === 1);
    if (st.status === "playing" && ap.current) {
      h += "<button class='btn-big ok' data-j='correct'><span class='btn-label'><kbd class='key'>1</kbd>Correcto</span><span class='ico'>✓</span></button>" +
        "<button class='btn-big err' data-j='wrong'><span class='btn-label'><kbd class='key'>2</kbd>Incorrecto</span><span class='ico'>✕</span></button>" +
        "<button class='btn-big warn' data-j='pass'><span class='btn-label'><kbd class='key'>3</kbd>Pasapalabra</span><span class='ico'>↷</span></button>" +
        "<button class='btn-big ghost' id='md-pause'><span class='btn-label'><kbd class='key'>4</kbd>Pausa excepcional</span></button>" +
        "<p class='muted' style='font-size:13px;margin-top:2px'>Atajos de teclado: " +
        "<kbd class='key sm'>1</kbd> <kbd class='key sm'>2</kbd> <kbd class='key sm'>3</kbd> <kbd class='key sm'>4</kbd></p>";
    }
    h += "<div class='activity'><h4>Actividad reciente</h4><div id='md-log'>" +
      (modLog.join("") || "<div>Sin actividad todavía.</div>") + "</div></div>";
    h += "</div></div>";

    box.innerHTML = h;

    var svg = document.getElementById("mod-rosco");
    if (svg) RoscoUI.renderRosco(svg, ap.letters, {
      size: 300,
      center: {
        name: ap.name,
        time: RoscoUI.fmtTime(ap.timeSec),
        sub: st.status === "playing" ? "turno activo" : (st.status === "paused" ? "en pausa" : ""),
      },
    });

    box.querySelectorAll("[data-j]").forEach(function (b) {
      b.addEventListener("click", function () { doJudge(b.dataset.j); });
    });
    var btnStart = document.getElementById("md-start");
    if (btnStart) btnStart.addEventListener("click", function () {
      logEvent("Se inició la partida.");
      modConn.send({ type: "start" });
    });
    var btnResume = document.getElementById("md-resume");
    if (btnResume) btnResume.addEventListener("click", function () {
      logEvent("<b>" + E(ap.name) + "</b> retomó el turno.");
      modConn.send({ type: "resume" });
    });
    var btnPause = document.getElementById("md-pause");
    if (btnPause) btnPause.addEventListener("click", doPause);
  }

  /* ---------------- temáticas ---------------- */
  function loadThemes() {
    api("/themes").then(function (themes) {
      var box = document.getElementById("th-list");
      box.innerHTML = themes.map(function (t) {
        return "<div class='theme-row'><b>" + E(t.name) + "</b>" +
          "<span class='muted'>" + t.definitions + " definiciones</span>" +
          "<span style='flex:1'></span>" +
          "<button class='ghost' data-ren='" + t.id + "'>Renombrar</button>" +
          "<button class='err' data-del='" + t.id + "'>Eliminar</button></div>";
      }).join("") || "<p class='muted'>No hay temáticas.</p>";
      box.querySelectorAll("[data-ren]").forEach(function (b) {
        b.addEventListener("click", function () {
          var n = prompt("Nuevo nombre:");
          if (n) api("/themes/" + b.dataset.ren, { method: "PUT", body: JSON.stringify({ name: n }) }).then(loadThemes).catch(alert);
        });
      });
      box.querySelectorAll("[data-del]").forEach(function (b) {
        b.addEventListener("click", function () {
          if (confirm("¿Eliminar la temática y todas sus definiciones?"))
            api("/themes/" + b.dataset.del, { method: "DELETE" }).then(loadThemes).catch(function (e) { alert(e.message); });
        });
      });
    });
  }

  document.getElementById("th-create").addEventListener("click", function () {
    var n = document.getElementById("th-name").value;
    api("/themes", { method: "POST", body: JSON.stringify({ name: n }) })
      .then(function () { document.getElementById("th-name").value = ""; loadThemes(); })
      .catch(function (e) { alert(e.message); });
  });

  /* ---------------- palabras ---------------- */
  var pwTheme = null, pwDraft = [], pwDirty = false;

  function initWords() {
    api("/themes").then(function (themes) {
      var sel = document.getElementById("pw-theme");
      var cur = sel.value;
      sel.innerHTML = "";
      themes.forEach(function (t) {
        var o = document.createElement("option");
        o.value = t.id; o.textContent = t.name;
        sel.appendChild(o);
      });
      if (cur) sel.value = cur;
      pwTheme = Number(sel.value);
      var ls = document.getElementById("pw-letter");
      if (!ls.options.length) {
        LETTERS.forEach(function (L) {
          var o = document.createElement("option");
          o.value = L; o.textContent = L;
          ls.appendChild(o);
        });
      }
      loadDraft();
    });
  }

  document.getElementById("pw-theme").addEventListener("change", function (e) {
    if (pwDirty && !confirm("Hay cambios sin guardar. ¿Cambiar de temática igual?")) {
      e.target.value = pwTheme; return;
    }
    pwTheme = Number(e.target.value);
    loadDraft();
  });
  document.getElementById("pw-letter").addEventListener("change", renderRows);

  function loadDraft() {
    if (!pwTheme) return;
    Promise.all([
      api("/themes/" + pwTheme + "/definitions"),
      api("/themes/" + pwTheme + "/letters"),
    ]).then(function (r) {
      pwDraft = r[0].map(function (d) {
        return { letter: d.letter, word: d.word, definition: d.definition, hint_type: d.hint_type, alt: (d.alt || []).join(", "), active: d.active, enabled: d.enabled, uses: d.uses };
      });
      pwDirty = false;
      window._letterStates = {};
      r[1].forEach(function (s) { window._letterStates[s.letter] = s; });
      renderRows();
    });
  }

  function currentLetter() { return document.getElementById("pw-letter").value; }

  function renderRows() {
    var L = currentLetter();
    var st = (window._letterStates || {})[L] || { enabled: true, total: 0, active: 0 };
    document.getElementById("pw-enabled").checked = st.enabled !== false;
    document.getElementById("pw-stats").textContent =
      "Letra " + L + ": " + st.total + " definiciones (" + st.active + " activas)." +
      (st.active < 2 ? " Con menos de 2 activas no entra en juego." : "");
    var tb = document.getElementById("pw-rows");
    tb.innerHTML = "";
    pwDraft.forEach(function (d, idx) {
      if (d.letter !== L) return;
      var tr = document.createElement("tr");
      tr.innerHTML =
        "<td><input type='text' data-f='word' value=\"" + E(d.word).replace(/"/g, "&quot;") + "\"/></td>" +
        "<td><textarea rows='2' data-f='definition'>" + E(d.definition) + "</textarea></td>" +
        "<td><select data-f='hint_type'><option value='E'>Empieza</option><option value='C'>Contiene</option></select></td>" +
        "<td><input type='text' data-f='alt' placeholder='sep. por comas' value=\"" + E(d.alt).replace(/"/g, "&quot;") + "\"/></td>" +
        "<td style='text-align:center'><input type='checkbox' data-f='active' " + (d.active ? "checked" : "") + "/></td>" +
        "<td><input type='number' class='uses' data-f='uses' min='0' value='" + d.uses + "'/></td>" +
        "<td><button class='err' data-delrow>✕</button></td>";
      tr.querySelector("[data-f=hint_type]").value = d.hint_type;
      tr.querySelectorAll("[data-f]").forEach(function (inp) {
        inp.addEventListener("input", function () {
          var f = inp.dataset.f;
          if (f === "active") d[f] = inp.checked ? 1 : 0;
          else if (f === "uses") d[f] = Math.max(0, parseInt(inp.value || "0", 10));
          else d[f] = inp.value;
          pwDirty = true;
        });
      });
      tr.querySelector("[data-delrow]").addEventListener("click", function () {
        pwDraft.splice(idx, 1);
        pwDirty = true;
        renderRows();
      });
      tb.appendChild(tr);
    });
  }

  document.getElementById("pw-enabled").addEventListener("change", function (e) {
    var L = currentLetter(), en = e.target.checked;
    api("/themes/" + pwTheme + "/letters/" + L, { method: "PUT", body: JSON.stringify({ enabled: en }) })
      .then(function () {
        pwDraft.forEach(function (d) { if (d.letter === L) d.enabled = en ? 1 : 0; });
        window._letterStates[L].enabled = en;
        renderRows();
      })
      .catch(function (err) { alert(err.message); e.target.checked = !en; });
  });

  document.getElementById("pw-add").addEventListener("click", function () {
    var L = currentLetter();
    var en = (window._letterStates[L] || {}).enabled !== false;
    pwDraft.push({ letter: L, word: "", definition: "", hint_type: "E", alt: "", active: 1, enabled: en ? 1 : 0, uses: 0 });
    pwDirty = true;
    renderRows();
  });

  document.getElementById("pw-reset").addEventListener("click", function () {
    if (pwDirty && !confirm("¿Descartar los cambios sin guardar?")) return;
    loadDraft();
  });

  document.getElementById("pw-save").addEventListener("click", function () {
    var payload = pwDraft.map(function (d) {
      return {
        letter: d.letter, word: d.word, definition: d.definition, hint_type: d.hint_type,
        alt: String(d.alt).split(",").map(function (s) { return s.trim(); }).filter(Boolean),
        active: d.active, enabled: d.enabled, uses: d.uses,
      };
    });
    api("/themes/" + pwTheme + "/bank", { method: "PUT", body: JSON.stringify({ definitions: payload }) })
      .then(function (r) {
        pwDirty = false;
        alert("Listado guardado: " + r.count + " definiciones.");
        loadDraft();
      })
      .catch(function (e) { alert(e.message); });
  });
})();

