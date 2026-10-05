/* Utilidades compartidas: conexión WebSocket y render del rosco (SVG). */
(function () {
  "use strict";

  var STATUS_COLORS = {
    correct: "#12914e",
    wrong: "#d93a2b",
    passed: "#e8a100",
    current: "#0b5cc0",
    pending: "#c9d6ee",
  };
  var STATUS_TEXT = {
    correct: "#ffffff",
    wrong: "#ffffff",
    passed: "#3a2a00",
    current: "#ffffff",
    pending: "#5d6f8f",
  };

  /** Dibuja el rosco en un <svg>. letters: [{letter, status}]. */
  function renderRosco(svg, letters, opts) {
    opts = opts || {};
    var size = opts.size || 400;
    var NS = "http://www.w3.org/2000/svg";
    svg.setAttribute("viewBox", "0 0 400 400");
    svg.setAttribute("width", size);
    svg.setAttribute("height", size);
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    var cx = 200, cy = 200, R = 148;
    var n = letters.length;
    letters.forEach(function (L, i) {
      var ang = (-90 + (360 / n) * i) * Math.PI / 180;
      var x = cx + R * Math.cos(ang), y = cy + R * Math.sin(ang);
      var g = document.createElementNS(NS, "g");
      var c = document.createElementNS(NS, "circle");
      c.setAttribute("cx", x); c.setAttribute("cy", y); c.setAttribute("r", 24);
      c.setAttribute("fill", STATUS_COLORS[L.status] || STATUS_COLORS.pending);
      c.setAttribute("stroke", "#ffffff"); c.setAttribute("stroke-width", 2);
      var t = document.createElementNS(NS, "text");
      t.setAttribute("x", x); t.setAttribute("y", y + 7);
      t.setAttribute("text-anchor", "middle");
      t.setAttribute("font-size", "20"); t.setAttribute("font-weight", "bold");
      t.setAttribute("fill", STATUS_TEXT[L.status] || STATUS_TEXT.pending);
      t.setAttribute("font-family", "Trebuchet MS, Verdana, sans-serif");
      t.textContent = L.letter;
      g.appendChild(c); g.appendChild(t);
      svg.appendChild(g);
    });
  }

  function fmtTime(sec) {
    sec = Math.max(0, Math.ceil(sec));
    var m = Math.floor(sec / 60), s = sec % 60;
    return m + ":" + (s < 10 ? "0" : "") + s;
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

  window.RoscoUI = {
    renderRosco: renderRosco,
    fmtTime: fmtTime,
    connectGame: connectGame,
    esc: esc,
  };
})();
