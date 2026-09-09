/* ============================================================
   Treino de Marinheiro com Segurança Básica (STCW A-VI/1)
   App simples, sem dependências. Dados em window.EXAM_DATA, preenchido pelo
   auth.js depois de desencriptar o conteúdo — a app arranca por startApp().
   ============================================================ */
(function () {
  "use strict";

  var DATA = { perguntas: [], meta: {} };
  var LETRAS = ["A", "B", "C", "D", "E", "F"];
  var HKEY = "sb_historico";       // histórico de resultados
  var TKEY = "sb_tema";            // tema
  var SKEY = "sb_teste_atual";     // teste em curso (para retomar)

  var test = null;        // teste em curso
  var retomavel = null;   // snapshot de teste a meio guardado

  /* ---------- utilitários ---------- */
  function $(id) { return document.getElementById(id); }
  function show(id) { $(id).classList.remove("hidden"); }
  function hide(id) { $(id).classList.add("hidden"); }
  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  // Perguntas cujas opções referem a posição/ordem — "a) e b)", "todas as
  // anteriores", "nenhuma das anteriores", etc. — não podem ter as opções
  // baralhadas, senão essas referências deixam de apontar para as opções certas.
  function opcoesFixas(opcoes) {
    return opcoes.some(function (o) {
      var s = o.toLowerCase();
      return /(^|\s)[a-d]\s*\)/.test(s)                // refere letras: "a)", "b )" (isoladas)
          || /\banteriores?\b/.test(s)                 // "(das) anteriores"
          // "nenhuma das anteriores", "nenhum dos acima listados", "nenhuma resposta está certa"
          || /\bnenhum[ao]?s?\s+(d[aeo]s?\b|respostas?|afirma|op[cç]|alternativa|hip[óo]tese)/.test(s)
          || /\btod[ao]s\s+[ao]s\s+(respostas|afirma|op|al[íi]neas)/.test(s)
          || /\btod[ao]s\s+(est[ãa]o|se encontram)\b/.test(s)   // "todos estão certos"
          || /\b(acima|abaixo)\s+(listad|indicad|referid|mencionad|descrit)/.test(s)
          || /as duas respostas/.test(s);              // "as duas respostas..."
    });
  }
  function categorias() {
    var seen = [];
    DATA.perguntas.forEach(function (p) {
      if (seen.indexOf(p.categoria) === -1) seen.push(p.categoria);
    });
    return seen;
  }
  function respondidas() { return test ? test.certas + test.erradas : 0; }

  /* ---------- tema ---------- */
  function aplicarTema() {
    var t = localStorage.getItem(TKEY);
    var root = document.documentElement;
    if (t === "light" || t === "dark") root.setAttribute("data-theme", t);
    else root.removeAttribute("data-theme");
    var escuro = t === "dark" ||
      (!t && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
    $("themeToggle").textContent = escuro ? "☀️" : "🌙";
  }
  function alternarTema() {
    var root = document.documentElement;
    var atual = root.getAttribute("data-theme");
    var escuroAgora = atual === "dark" ||
      (!atual && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
    localStorage.setItem(TKEY, escuroAgora ? "light" : "dark");
    aplicarTema();
  }

  /* ---------- ecrã inicial ---------- */
  function preencherInicio() {
    var sel = $("selCategoria");
    sel.innerHTML = "";
    var optAll = document.createElement("option");
    optAll.value = "";
    optAll.textContent = "Todas as matérias (" + DATA.perguntas.length + ")";
    sel.appendChild(optAll);
    categorias().forEach(function (c) {
      var n = DATA.perguntas.filter(function (p) { return p.categoria === c; }).length;
      var o = document.createElement("option");
      o.value = c;
      o.textContent = c + " (" + n + ")";
      sel.appendChild(o);
    });
    $("footTotal").textContent = DATA.perguntas.length + " perguntas disponíveis · ";
    renderHistorico();
    renderRetomar();
  }

  /* ---------- iniciar teste ---------- */
  function iniciarTeste() {
    var cat = $("selCategoria").value;
    var num = parseInt($("selNumero").value, 10);
    var baralhar = $("chkBaralhar").checked;
    var baralharOpcoes = $("chkBaralharOpcoes").checked;

    var pool = DATA.perguntas.filter(function (p) { return !cat || p.categoria === cat; });
    if (baralhar) pool = shuffle(pool);
    if (num > 0 && pool.length > num) pool = pool.slice(0, num);

    var perguntas = pool.map(function (p) {
      var opcoes = p.opcoes.map(function (txt, i) {
        return { texto: txt, correta: i === p.correta };
      });
      if (baralharOpcoes && !opcoesFixas(p.opcoes)) opcoes = shuffle(opcoes);
      return {
        numero: p.numero,
        enunciado: p.enunciado,
        categoria: p.categoria,
        imagem: p.imagem || null,
        nota: p.nota || null,
        opcoes: opcoes,
        estado: "pendente",   // pendente | certa | errada
        escolhaIdx: -1
      };
    });

    test = {
      cat: cat || "Todas as matérias",
      perguntas: perguntas, idx: 0,
      certas: 0, erradas: 0, total: perguntas.length,
      concluido: false
    };
    guardarEstado();
    abrirQuiz();
  }

  function abrirQuiz() {
    hide("screen-start");
    hide("screen-results");
    show("screen-quiz");
    window.scrollTo(0, 0);
    renderPergunta();
  }

  /* ---------- render de uma pergunta ---------- */
  function renderPergunta() {
    var q = test.perguntas[test.idx];
    var revisao = q.estado !== "pendente";

    $("progressLabel").textContent = (test.idx + 1) + " / " + test.total;
    $("progressBar").style.width = (respondidas() / test.total * 100) + "%";
    atualizarScore();

    $("qCategoria").textContent = q.categoria;
    $("qNumero").textContent = q.numero ? "N.º " + q.numero : "";
    $("qEnunciado").textContent = q.enunciado;

    // As imagens vêm cifradas dentro do pacote e existem como blob URL. O teste
    // guardado mantém o caminho original ("images/x.png"), não o blob URL — que
    // morre com a sessão —, por isso a resolução é feita aqui, no render.
    var srcImagem = q.imagem && (window.EXAM_IMAGENS || {})[q.imagem] || q.imagem;
    if (srcImagem) {
      $("qFigura").src = srcImagem;
      show("qFiguraWrap");
    } else {
      $("qFigura").removeAttribute("src");
      hide("qFiguraWrap");
    }

    var cont = $("opcoes");
    cont.innerHTML = "";
    q.opcoes.forEach(function (op, i) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "opcao";
      btn.innerHTML = '<span class="letra">' + LETRAS[i] + '</span><span class="txt"></span>';
      btn.querySelector(".txt").textContent = op.texto;
      if (revisao) {
        btn.disabled = true;
        if (op.correta) btn.classList.add("is-correct");
        else if (i === q.escolhaIdx) btn.classList.add("is-wrong");
        else btn.classList.add("is-dim");
      } else {
        btn.addEventListener("click", function () { escolher(q, i); });
      }
      cont.appendChild(btn);
    });

    // feedback + nota
    var fb = $("feedback");
    if (!revisao) {
      fb.textContent = "";
      fb.className = "feedback";
      hide("qNota");
    } else if (q.estado === "certa") {
      fb.textContent = "Certo! Acertaste à primeira. 👏";
      fb.className = "feedback ok";
    } else {
      fb.textContent = "Errado. A resposta certa é a que está assinalada a verde.";
      fb.className = "feedback bad";
    }
    if (revisao && q.nota) { $("qNota").textContent = "ℹ️ " + q.nota; show("qNota"); }
    else hide("qNota");

    // navegação
    if (test.idx > 0) show("btnAnterior"); else hide("btnAnterior");
    if (revisao) {
      $("btnProxima").textContent =
        (test.idx === test.total - 1) ? "Ver resultado" : "Próxima pergunta";
      show("btnProxima");
    } else {
      hide("btnProxima");
    }
    // esconder a barra de navegação quando não tem botões (1ª pergunta ainda por responder)
    if (test.idx > 0 || revisao) show("quizFoot"); else hide("quizFoot");
  }

  /* ---------- responder (revela logo a resposta certa) ---------- */
  function escolher(q, i) {
    if (q.estado !== "pendente") return;
    q.escolhaIdx = i;
    if (q.opcoes[i].correta) { q.estado = "certa"; test.certas++; }
    else { q.estado = "errada"; test.erradas++; }
    guardarEstado();
    renderPergunta();      // volta a desenhar já em modo "revelado"
  }

  function atualizarScore() {
    $("scoreCertas").textContent = test.certas;
    $("scoreErradas").textContent = test.erradas;
  }

  /* ---------- navegação ---------- */
  function anterior() {
    if (test.idx > 0) { test.idx--; renderPergunta(); window.scrollTo({ top: 0, behavior: "smooth" }); }
  }
  function proxima() {
    if (test.idx < test.total - 1) {
      test.idx++; renderPergunta(); window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      terminar();
    }
  }

  /* ---------- terminar / resultados ---------- */
  function terminar() {
    var resp = respondidas();
    var pct = resp > 0 ? Math.round(test.certas / resp * 100) : 0;
    test.concluido = (resp === test.total);

    if (test.concluido) limparEstado(); else guardarEstado();

    $("resCertas").textContent = test.certas;
    $("resErradas").textContent = test.erradas;
    $("resRespondidas").textContent = resp;
    $("resPercent").textContent = pct + "%";
    $("resultBar").style.width = pct + "%";

    var emoji, titulo;
    if (resp === 0) { emoji = "🫥"; titulo = "Teste terminado"; }
    else if (pct >= 90) { emoji = "🏆"; titulo = "Excelente!"; }
    else if (pct >= 70) { emoji = "💪"; titulo = "Bom trabalho!"; }
    else if (pct >= 50) { emoji = "🙂"; titulo = "Vais no bom caminho"; }
    else { emoji = "📚"; titulo = "A treinar faz-se o marinheiro"; }
    $("resultEmoji").textContent = emoji;
    $("resultTitulo").textContent = titulo;

    $("resultSub").textContent = test.concluido
      ? "Completaste o teste."
      : "Terminaste o teste antes do fim — aqui está o resultado até agora.";
    $("resDetalhe").textContent =
      "Respondeste a " + resp + " de " + test.total +
      " perguntas do teste. As \"certas\" são as que acertaste logo à primeira tentativa." +
      (test.concluido ? "" : " Podes continuar este teste mais tarde a partir do ecrã inicial.");

    guardarHistorico(resp, pct);

    hide("screen-quiz");
    show("screen-results");
    window.scrollTo(0, 0);
  }

  function pedirTerminar() {
    // Sem respostas ainda: termina logo (nada a perder).
    // Com respostas: pede confirmação num diálogo próprio (não usa window.confirm,
    // que nalguns browsers é bloqueado ou não aparece).
    if (respondidas() === 0) { terminar(); return; }
    show("modalTerminar");
  }

  /* ---------- persistência do teste em curso ---------- */
  function guardarEstado() {
    try { if (test) localStorage.setItem(SKEY, JSON.stringify(test)); } catch (e) {}
  }
  function limparEstado() {
    try { localStorage.removeItem(SKEY); } catch (e) {}
    retomavel = null;
  }
  function carregarRetomavel() {
    try {
      var t = JSON.parse(localStorage.getItem(SKEY));
      if (t && t.perguntas && !t.concluido &&
          (t.certas + t.erradas) < t.total) return t;
    } catch (e) {}
    return null;
  }
  function renderRetomar() {
    retomavel = carregarRetomavel();
    if (!retomavel) { hide("retomar"); return; }
    var resp = retomavel.certas + retomavel.erradas;
    $("retomarDetalhe").textContent =
      retomavel.cat + " · " + resp + " de " + retomavel.total + " respondidas";
    show("retomar");
  }
  function continuarTeste() {
    if (!retomavel) return;
    test = retomavel;
    // ir para a primeira pergunta ainda por responder
    var alvo = test.perguntas.findIndex(function (q) { return q.estado === "pendente"; });
    test.idx = alvo >= 0 ? alvo : test.total - 1;
    abrirQuiz();
  }
  function descartarTeste() {
    limparEstado();
    renderRetomar();
  }

  /* ---------- histórico de resultados ---------- */
  function lerHistorico() {
    try { return JSON.parse(localStorage.getItem(HKEY)) || []; }
    catch (e) { return []; }
  }
  function guardarHistorico(resp, pct) {
    if (resp === 0) return;
    var h = lerHistorico();
    h.unshift({
      d: Date.now(), cat: test.cat,
      certas: test.certas, erradas: test.erradas,
      total: test.total, pct: pct, concluido: test.concluido
    });
    h = h.slice(0, 8);
    try { localStorage.setItem(HKEY, JSON.stringify(h)); } catch (e) {}
  }
  function renderHistorico() {
    var h = lerHistorico();
    var ul = $("historicoLista");
    if (!h.length) { hide("historico"); return; }
    show("historico");
    ul.innerHTML = "";
    h.forEach(function (it) {
      var li = document.createElement("li");
      var data = new Date(it.d);
      var dstr = data.toLocaleDateString("pt-PT", { day: "2-digit", month: "short" }) +
        " " + data.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });
      var estado = it.concluido ? "" : " · a meio";
      var esq = document.createElement("div");
      esq.innerHTML = '<div>' + dstr + '</div><div class="h-cat"></div>';
      esq.querySelector(".h-cat").textContent = it.cat + estado;
      var dir = document.createElement("div");
      dir.className = "h-score";
      dir.innerHTML = '<b>' + it.certas + '</b> / ' + (it.certas + it.erradas) +
        ' &nbsp; <span class="muted small">' + it.pct + '%</span>';
      li.appendChild(esq);
      li.appendChild(dir);
      ul.appendChild(li);
    });
  }
  function limparHistorico() {
    localStorage.removeItem(HKEY);
    renderHistorico();
  }

  function voltarInicio() {
    hide("screen-results");
    hide("screen-quiz");
    show("screen-start");
    preencherInicio();
    window.scrollTo(0, 0);
  }

  /* ---------- arranque ---------- */
  function init() {
    aplicarTema();
    preencherInicio();

    $("themeToggle").addEventListener("click", alternarTema);
    $("btnIniciar").addEventListener("click", iniciarTeste);
    $("btnAnterior").addEventListener("click", anterior);
    $("btnProxima").addEventListener("click", proxima);
    $("btnTerminar").addEventListener("click", pedirTerminar);
    $("btnRecomecar").addEventListener("click", voltarInicio);
    $("btnLimparHistorico").addEventListener("click", limparHistorico);
    $("btnContinuar").addEventListener("click", continuarTeste);
    $("btnDescartar").addEventListener("click", descartarTeste);
    $("btnModalConfirmar").addEventListener("click", function () { hide("modalTerminar"); terminar(); });
    $("btnModalCancelar").addEventListener("click", function () { hide("modalTerminar"); });

    if (!DATA.perguntas || !DATA.perguntas.length) {
      $("screen-start").innerHTML =
        '<div class="card"><h1>Sem perguntas</h1><p class="muted">' +
        'Não foi possível carregar as perguntas (content.enc.js).</p></div>';
    }
  }

  // Chamado pelo auth.js assim que o conteúdo é desencriptado.
  window.startApp = function () {
    DATA = window.EXAM_DATA || { perguntas: [], meta: {} };
    init();
  };
})();
