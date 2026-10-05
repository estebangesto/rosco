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
    o.value = mm; o.textContent = mm + " min";
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

  document.getElementById("np-create").addEventListener("click", function () {
    var body = {
      themeId: Number(document.getElementById("np-theme").value),
      playerNames: [document.getElementById("np-p1").value, document.getElementById("np-p2").value],
      minutes: Number(minSel.value),
    };
    api("/games", { method: "POST", body: JSON.stringify(body) }).then(function (g) {
      var h = "<h3>Partida " + E(g.code) + " creada</h3><div class='row'>";
      [["Jugador 1", "jugador1"], ["Jugador 2", "jugador2"], ["Público", "publico"]].forEach(function (x) {
        h += "<div class='qr'><img src='" + g.qr[x[1]] + "' alt='QR " + x[0] + "'/>" +
          "<div><b>" + x[0] + "</b></div><small>" + E(g.links[x[1]]) + "</small></div>";
      });
      h += "</div><p><button class='ghost' id='np-goto-mod'>Ir a moderación</button> " +
        "<span class='muted'>Los QR apuntan a la IP de red local de este servidor.</span></p>";
      var box = document.getElementById("np-result");
      box.innerHTML = h;
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
  var modConn = null, modCode = null;

  document.getElementById("md-join").addEventListener("click", function () {
    var code = document.getElementById("md-code").value.trim().toUpperCase();
    if (!code) return;
    if (modConn) modConn.close();
    modCode = code;
    modConn = RoscoUI.connectGame(code, "admin", { onState: renderMod, onError: function (e) { alert(e); } });
  });

  function miniRosco(p) {
    return "<div><b>" + E(p.name) + "</b> " + (p.isActive ? "▶" : "") +
      "<div class='timer" + (p.timeSec <= 30 && !p.done ? " low" : "") + "'>" + RoscoUI.fmtTime(p.timeSec) + "</div>" +
      "<div class='score'>✅" + p.correct + " ❌" + p.wrong + "</div>" +
      "<svg id='mod-rosco-" + E(p.name) + "'></svg></div>";
  }

  function renderMod(st) {
    var box = document.getElementById("md-body");
    var h = "<h3>Partida " + E(st.code) + " — " + E(st.status) + " <span class='pill'>" + E(st.theme) + "</span></h3>";
    if (st.status === "lobby") {
      h += "<p><button class='ok' id='md-start'>Iniciar partida</button></p>";
    }
    h += "<div class='grid2'><div>" + miniRosco(st.players[0]) + "</div><div>" + miniRosco(st.players[1]) + "</div></div>";

    var ap = st.players[st.activePlayer];
    if (st.status === "playing" && ap.current) {
      h += "<div class='card'><h3>Letra actual: " + E(ap.current.letter) + " — " + E(ap.name) + "</h3>" +
        "<div class='clue'><span class='hint'>" + E(ap.current.hint) + ":</span><br/>" + E(ap.current.definition) + "</div>" +
        "<div class='answer'><b>Respuesta:</b> " + E(ap.current.answer) +
        (ap.current.alt && ap.current.alt.length ? " <span class='muted'>(también: " + E(ap.current.alt.join(", ")) + ")</span>" : "") +
        "</div>" +
        "<div class='row'>" +
        "<button class='ok' data-j='correct'>Correcto</button>" +
        "<button class='err' data-j='wrong'>Error</button>" +
        "<button class='warn' data-j='pass'>Pasapalabra</button>" +
        "</div></div>";
    }
    if (st.status === "paused") {
      h += "<div class='card'><p>" + E(st.pausedReason || "En pausa.") + "</p>" +
        "<button class='ok' id='md-resume'>Reanudar turno de " + E(ap.name) + "</button></div>";
    }
    if (st.status === "finished") {
      var w = st.winner == null ? "Empate." : "Ganó " + E(st.players[st.winner].name) + ".";
      h += "<div class='card'><h3>Juego terminado. " + w + "</h3></div>";
    }
    box.innerHTML = h;
    [0, 1].forEach(function (i) {
      var svg = document.getElementById("mod-rosco-" + st.players[i].name);
      if (svg) RoscoUI.renderRosco(svg, st.players[i].letters, { size: 200 });
    });
    box.querySelectorAll("[data-j]").forEach(function (b) {
      b.addEventListener("click", function () { modConn.send({ type: "judge", result: b.dataset.j }); });
    });
    var rs = document.getElementById("md-resume");
    if (rs) rs.addEventListener("click", function () { modConn.send({ type: "resume" }); });
    var st2 = document.getElementById("md-start");
    if (st2) st2.addEventListener("click", function () { modConn.send({ type: "start" }); });
  }

  /* ---------------- temáticas ---------------- */
  function loadThemes() {
    api("/themes").then(function (themes) {
      var box = document.getElementById("th-list");
      box.innerHTML = themes.map(function (t) {
        return "<div class='row' style='margin-bottom:8px'><b>" + E(t.name) + "</b>" +
          "<span class='muted'>" + t.definitions + " definiciones</span>" +
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
