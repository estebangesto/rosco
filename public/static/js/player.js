/* Vista del jugador: su rosco, su tiempo y su pregunta (sin respuesta).
   Si no es su turno, indica que es el turno del otro jugador. */
(function () {
  "use strict";
  var m = location.pathname.match(/\/juego\/([^/]+)\/jugador([12])/);
  if (!m) { document.body.innerHTML = "<div class='card'>URL inválida.</div>"; return; }
  var code = m[1].toUpperCase(), me = Number(m[2]) - 1;
  var role = me === 0 ? "player1" : "player2";

  var elName = document.getElementById("p-name");
  var elTime = document.getElementById("p-time");
  var elScore = document.getElementById("p-score");
  var elRosco = document.getElementById("rosco");
  var elClue = document.getElementById("p-clue");
  var elWait = document.getElementById("p-wait");

  function render(st) {
    var me_ = st.players[me], other = st.players[1 - me];
    elName.textContent = me_.name;
    elTime.textContent = RoscoUI.fmtTime(me_.timeSec);
    elTime.classList.toggle("low", me_.timeSec <= 30 && !me_.done);
    elScore.innerHTML = "✅ " + me_.correct + " &nbsp; ❌ " + me_.wrong;
    RoscoUI.renderRosco(elRosco, me_.letters, { size: Math.min(400, window.innerWidth - 60) });

    if (st.status === "finished") {
      var w = st.winner == null ? "Empate." :
        "Ganó " + RoscoUI.esc(st.players[st.winner].name) + ".";
      elClue.innerHTML = "<div class='big'>Juego terminado. " + w + "</div>";
      elWait.innerHTML = "";
      return;
    }
    if (st.status === "lobby") {
      elClue.innerHTML = "<div class='waiting'>Esperando que el moderador inicie la partida…</div>";
      elWait.innerHTML = "";
      return;
    }
    var myTurn = me_.isActive && st.status === "playing";
    if (myTurn && me_.current) {
      elClue.innerHTML =
        "<div class='clue'><span class='hint'>" + RoscoUI.esc(me_.current.hint) + ":</span><br/>" +
        RoscoUI.esc(me_.current.definition) + "</div>" +
        "<div class='muted'>Respondé en voz alta, el moderador juzga.</div>";
      elWait.innerHTML = "";
    } else if (st.status === "paused" && me_.isActive) {
      elClue.innerHTML = "<div class='waiting'>Pausa. Esperando confirmación para reanudar…</div>";
      elWait.innerHTML = "";
    } else {
      elClue.innerHTML = "";
      elWait.innerHTML = "<div class='waiting'>Turno de " + RoscoUI.esc(other.name) + ".</div>";
    }
  }

  RoscoUI.connectGame(code, role, {
    onState: render,
    onError: function (e) { elWait.innerHTML = "<div class='muted'>" + RoscoUI.esc(e) + "</div>"; },
  });
})();
