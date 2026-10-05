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

  window.RoscoUI = {
    renderRosco: renderRosco,
    fmtTime: fmtTime,
    connectGame: connectGame,
    esc: esc,
    pendingCount: pendingCount,
  };
})();

