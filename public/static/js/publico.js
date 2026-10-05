/* Vista pública: el jugador activo en grande; al costado, en chico,
   el rosco del otro jugador con su próxima letra y tiempo restante. */
(function () {
  "use strict";
  var m = location.pathname.match(/\/juego\/([^/]+)\/publico/);
  if (!m) { document.body.innerHTML = "<div class='card'>URL inválida.</div>"; return; }
  var code = m[1].toUpperCase();

  var elTheme = document.getElementById("v-theme");
  var elMain = document.getElementById("v-main");
  var elSide = document.getElementById("v-side");

  function panel(p, big) {
    var size = big ? 380 : 180;
    var html = "<h2>" + RoscoUI.esc(p.name) + "</h2>" +
      "<div class='timer" + (p.timeSec <= 30 && !p.done ? " low" : "") + "'>" + RoscoUI.fmtTime(p.timeSec) + "</div>" +
      "<div class='score'>✅ " + p.correct + " &nbsp; ❌ " + p.wrong + "</div>" +
      "<div style='text-align:center'><svg id='rosco-" + (big ? "main" : "side") + "'></svg></div>";
    if (big && p.current) {
      html += "<div class='clue'><span class='hint'>" + RoscoUI.esc(p.current.hint) + ":</span><br/>" +
        RoscoUI.esc(p.current.definition) + "</div>";
    }
    return html;
  }

  function render(st) {
    elTheme.textContent = st.theme;
    var a = st.players[st.activePlayer], b = st.players[1 - st.activePlayer];
    if (st.status === "finished") {
      var w = st.winner == null ? "Empate." : "Ganó " + RoscoUI.esc(st.players[st.winner].name) + ".";
      elMain.innerHTML = "<h2>Juego terminado</h2><div class='big'>" + w + "</div>" + panel(a, true);
      elSide.innerHTML = panel(b, false);
    } else if (st.status === "lobby") {
      elMain.innerHTML = "<div class='waiting'>El juego está por comenzar…</div>";
      elSide.innerHTML = "";
    } else {
      elMain.innerHTML = panel(a, true);
      var next = b.current ? b.current.letter : "—";
      elSide.innerHTML = panel(b, false) +
        "<div class='muted'>Próxima letra: <b>" + RoscoUI.esc(next) + "</b></div>";
    }
    var sm = document.getElementById("rosco-main");
    var ss = document.getElementById("rosco-side");
    if (sm) RoscoUI.renderRosco(sm, a.letters, { size: 380 });
    if (ss) RoscoUI.renderRosco(ss, b.letters, { size: 180 });
  }

  RoscoUI.connectGame(code, "public", { onState: render, onError: function () {} });
})();
