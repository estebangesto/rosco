/* Utilidades compartidas: conexión WebSocket y render del rosco (SVG).
   Estética tomada del prototipo validado (tema navy oscuro). */
(function () {
  "use strict";

  var DISPLAY_FONT = '"Barlow Condensed","Arial Narrow",sans-serif';

  var FILL = {
    correct: "#27b783",
    wrong: "#ee6971",
    passed: "#b88a09",
    current: "#168ed7",
    pending: "rgba(0,0,0,0)",
  };
  var STROKE = {
    correct: "#7ae0b7",
    wrong: "#ff9ca1",
    passed: "#f3c94f",
    current: "#89d8ff",
    pending: "#4b7a94",
  };
  var TEXT = {
    correct: "#ffffff",
    wrong: "#ffffff",
    passed: "#ffffff",
    current: "#ffffff",
    pending: "#ffffff",
  };

  function el(NS, tag, attrs) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }

  /**
   * Dibuja el rosco en un <svg>. letters: [{letter, status}].
   * opts: {size, center: {name, time, sub} | null, compact}
   */
  function renderRosco(svg, letters, opts) {
    opts = opts || {};
    var size = opts.size || 400;
    var NS = "http://www.w3.org/2000/svg";
    svg.setAttribute("viewBox", "0 0 400 400");
    svg.setAttribute("width", size);
    svg.setAttribute("height", size);
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    var cx = 200, cy = 200, R = 152, lr = 16;
    var n = letters.length;
    letters.forEach(function (L, i) {
      var ang = (-90 + (360 / n) * i) * Math.PI / 180;
      var x = cx + R * Math.cos(ang), y = cy + R * Math.sin(ang);
      var st = FILL[L.status] ? L.status : "pending";
      var g = el(NS, "g", {});
      var c = el(NS, "circle", {
        cx: x.toFixed(1), cy: y.toFixed(1), r: lr,
        fill: FILL[st], stroke: STROKE[st], "stroke-width": 2,
      });
      if (st === "current") {
        var glow = el(NS, "circle", {
          cx: x.toFixed(1), cy: y.toFixed(1), r: lr + 5,
          fill: "none", stroke: "rgba(32,169,230,.35)", "stroke-width": 4,
        });
        g.appendChild(glow);
      }
      var t = el(NS, "text", {
        x: x.toFixed(1), y: (y + 6).toFixed(1),
        "text-anchor": "middle", "font-size": 17, "font-weight": 700,
        fill: TEXT[st], "font-family": DISPLAY_FONT,
      });
      t.textContent = L.letter;
      g.appendChild(c); g.appendChild(t);
      svg.appendChild(g);
    });

    // círculo central con jugador / tiempo / estado
    if (opts.center) {
      var comp = !!opts.compact;
      var hub = el(NS, "circle", {
        cx: cx, cy: cy, r: comp ? 78 : 100,
        fill: "#071927", stroke: "#1e465f", "stroke-width": 1.5,
      });
      svg.appendChild(hub);
      var ny = cy - (comp ? 34 : 44);
      var nm = el(NS, "text", {
        x: cx, y: ny, "text-anchor": "middle",
        "font-size": comp ? 15 : 21, "font-weight": 700,
        fill: "#b9d1df", "font-family": DISPLAY_FONT,
        "letter-spacing": 1.5,
      });
      nm.textContent = (opts.center.name || "").toUpperCase();
      svg.appendChild(nm);
      var tm = el(NS, "text", {
        x: cx, y: cy + (comp ? 22 : 30), "text-anchor": "middle",
        "font-size": comp ? 44 : 68, "font-weight": 800,
        fill: "#ffffff", "font-family": DISPLAY_FONT,
      });
      tm.textContent = opts.center.time || "--:--";
      svg.appendChild(tm);
      if (opts.center.sub) {
        var sb = el(NS, "text", {
          x: cx, y: cy + (comp ? 44 : 62), "text-anchor": "middle",
          "font-size": comp ? 12 : 15, "font-weight": 600,
          fill: "#38b9ef", "font-family": DISPLAY_FONT, "letter-spacing": 1,
        });
        sb.textContent = opts.center.sub;
        svg.appendChild(sb);
      }
    }
  }

  function fmtTime(sec) {
    sec = Math.max(0, Math.ceil(sec));
    var m = Math.floor(sec / 60), s = sec % 60;
    return (m < 10 ? "0" : "") + m + ":" + (s < 10 ? "0" : "") + s;
  }

  /** Conecta al WebSocket de la partida. Reintenta si se cae. */
  function connectGame(code, role, handlers) {
    var ws;
    var closed = false;
    function open() {
      var proto = location.protocol === "https:" ? "wss" : "ws";
      ws = new WebSocket(proto + "://" + location.host + "/ws");
      ws.onopen = function () {
        ws.send(JSON.stringify({ type: "join", code: code, role: role }));
      };
      ws.onmessage = function (ev) {
        var msg;
        try { msg = JSON.parse(ev.data); } catch (e) { return; }
        if (msg.type === "state" && handlers.onState) handlers.onState(msg.state);
        if (msg.type === "error" && handlers.onError) handlers.onError(msg.error);
      };
      ws.onclose = function () {
        if (!closed) setTimeout(open, 1500);
      };
    }
    open();
    return {
      send: function (obj) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj)); },
      close: function () { closed = true; if (ws) ws.close(); },
    };
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function pendingCount(p) {
    return p.letters.filter(function (l) {
      return l.status === "pending" || l.status === "passed" || l.status === "current";
    }).length;
  }

  /* ---------------- pantalla de cierre ---------------- */
  var FINAL_ICONS = ["\uD83C\uDF89", "\uD83C\uDF8A", "\u2B50", "\uD83C\uDFC6", "\uD83E\uDD47", "\u2728", "\uD83C\uDF88"];

  function finalStatusMeta(status) {
    switch (status) {
      case "correct": return { cls: "correct", ico: "\u2713", txt: "Correcta" };
      case "wrong": return { cls: "wrong", ico: "\u2717", txt: "Incorrecta" };
      case "passed": return { cls: "passed", ico: "\u21B7", txt: "Pasapalabra" };
      default: return { cls: "unanswered", ico: "\u25CB", txt: "Sin responder" };
    }
  }

  /**
   * Pantalla final de la partida: ganador con festejo, estadísticas,
   * ambos roscos y el detalle de definiciones de cada jugador.
   * Se usa en las cuatro vistas (admin, jugador1, jugador2, público).
   */
  function renderFinal(box, st) {
    var f = st.final;
    if (!f) { box.innerHTML = "<div class='waiting'>Partida terminada.</div>"; return; }
    var wname = f.winner == null ? null : f.players[f.winner].name;

    var conf = "";
    for (var i = 0; i < 30; i++) {
      var left = (i * 37 + 11) % 100;
      var delay = ((i * 53) % 60) / 10;
      var dur = 3.2 + ((i * 29) % 25) / 10;
      var size = 18 + ((i * 17) % 22);
      conf += "<span style='left:" + left + "%;font-size:" + size + "px;" +
        "animation-delay:" + delay.toFixed(1) + "s;animation-duration:" + dur.toFixed(1) + "s'>" +
        FINAL_ICONS[i % FINAL_ICONS.length] + "</span>";
    }

    var h = "<div class='final'><div class='confetti' aria-hidden='true'>" + conf + "</div>";
    h += "<div class='final-hero'>";
    if (wname) {
      h += "<div class='final-trophy'>\uD83C\uDFC6</div>" +
        "<div class='eyebrow'>Partida terminada \u00B7 " + esc(st.code) + "</div>" +
        "<h2 class='h-display'>\u00A1Gan\u00F3 " + esc(wname) + "!</h2>" +
        "<p class='final-cheer'>\uD83C\uDF89 \u00A1Felicitaciones! \uD83C\uDF89</p>";
    } else {
      h += "<div class='final-trophy'>\uD83E\uDD1D</div>" +
        "<div class='eyebrow'>Partida terminada \u00B7 " + esc(st.code) + "</div>" +
        "<h2 class='h-display'>\u00A1Empate!</h2>" +
        "<p class='final-cheer'>\uD83C\uDF8A Nadie se llev\u00F3 la copa esta vez \uD83C\uDF8A</p>";
    }
    h += "<p class='muted'>Tem\u00E1tica: " + esc(st.theme) + "</p></div>";

    h += "<div class='final-duel'>";
    f.players.forEach(function (p, idx) {
      var total = p.correct + p.wrong;
      var acc = total ? Math.round((p.correct / total) * 100) : 0;
      var isW = f.winner === idx;
      h += "<div class='panel final-player" + (isW ? " winner" : "") + "'>" +
        "<div class='final-pname'>" + (isW ? "\uD83E\uDD47 " : "") + esc(p.name) + "</div>" +
        "<svg id='final-rosco-" + idx + "' class='final-rosco' role='img' aria-label='Rosco de " + esc(p.name) + "'></svg>" +
        "<div class='final-stats'>" +
        "<span class='chip'>Aciertos<b>" + p.correct + "</b></span>" +
        "<span class='chip'>Errores<b>" + p.wrong + "</b></span>" +
        "<span class='chip'>Precisi\u00F3n<b>" + acc + "%</b></span>" +
        "<span class='chip'>Tiempo<b>" + fmtTime(p.timeSec) + "</b></span>" +
        "</div>";
      h += "<div class='deflist'>";
      p.letters.forEach(function (l) {
        var m = finalStatusMeta(l.status);
        h += "<div class='defrow'>" +
          "<div class='lb " + m.cls + "'>" + esc(l.letter) + "</div>" +
          "<div><div class='wd'>" + esc(l.answer) +
          " <span class='st-ico " + m.cls + "' title='" + m.txt + "'>" + m.ico + "</span></div>" +
          "<div class='df'>" + esc(l.definition) + "</div>" +
          "<div class='stxt " + m.cls + "'>" + m.txt + "</div></div>" +
          "</div>";
      });
      h += "</div></div>";
    });
    h += "</div></div>";

    box.innerHTML = h;
    f.players.forEach(function (p, idx) {
      var svg = document.getElementById("final-rosco-" + idx);
      if (svg) renderRosco(svg, p.letters.map(function (l) {
        var vs = (l.status === "current" || l.status === "pending") ? "pending" : l.status;
        return { letter: l.letter, status: vs };
      }), { size: 300, compact: true });
    });
  }

  window.RoscoUI = {
    renderRosco: renderRosco,
    fmtTime: fmtTime,
    connectGame: connectGame,
    esc: esc,
    pendingCount: pendingCount,
    renderFinal: renderFinal,
  };
})();

