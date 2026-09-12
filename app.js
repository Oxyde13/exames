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

  // Regras do exame real: 10 perguntas de cada módulo, 60 minutos, e passa-se
  // cada módulo com 5 acertos. Falhar um módulo leva a oral; dois ou mais reprova.
  var EXAME = { porCategoria: 10, minimo: 5, minutos: 60 };

  // Nos exames a sério de uma folha específica o número de perguntas por módulo
  // nem sempre é 10, por isso a regra dos "5 em 10" generaliza-se para metade.
  function minimoModulo(total) { return Math.ceil(total / 2); }

  var test = null;        // teste em curso
  var retomavel = null;   // snapshot de teste a meio guardado
  var relogio = null;     // setInterval do cronómetro (só no exame)
  var mapaAberto = false; // mapa das perguntas do exame aberto?

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
  // Exames concretos (folhas de correcção) declarados no meta do conteúdo.
  // Cada pergunta que pertence a um exame traz exames[id] = posição na folha.
  function exames() {
    return (DATA.meta && DATA.meta.exames) || [];
  }
  function exameNome(id) {
    var e = exames().filter(function (x) { return x.id === id; })[0];
    return e ? e.nome : id;
  }
  // Perguntas de um exame, pela ordem da folha.
  function perguntasDoExame(id) {
    return DATA.perguntas
      .filter(function (p) { return p.exames && p.exames[id] != null; })
      .sort(function (a, b) { return a.exames[id] - b.exames[id]; });
  }

  function respondidas() {
    if (!test) return 0;
    // No exame ainda não há certas/erradas — conta-se o que já foi escolhido.
    if (test.modo === "exame" && !test.concluido) {
      return test.perguntas.filter(function (q) { return q.escolhaIdx >= 0; }).length;
    }
    return test.certas + test.erradas;
  }

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
    // Exames concretos, num grupo à parte: treinar só as perguntas dessa folha.
    if (exames().length) {
      var grupo = document.createElement("optgroup");
      grupo.label = "Exames";
      exames().forEach(function (e) {
        var n = perguntasDoExame(e.id).length;
        if (!n) return;
        var o = document.createElement("option");
        o.value = "exame:" + e.id;
        o.textContent = "🎓 " + e.nome + " (" + n + ")";
        grupo.appendChild(o);
      });
      if (grupo.children.length) sel.appendChild(grupo);
    }
    preencherExames();
    $("footTotal").textContent = DATA.perguntas.length + " perguntas disponíveis · ";
    renderHistorico();
    renderRetomar();
  }

  // Selector do simulador: exame aleatório ou uma folha concreta.
  function preencherExames() {
    var sel = $("selExame");
    sel.innerHTML = "";
    var aleatorio = document.createElement("option");
    aleatorio.value = "";
    aleatorio.textContent = "Aleatório — " + EXAME.porCategoria + " de cada módulo";
    sel.appendChild(aleatorio);
    exames().forEach(function (e) {
      var n = perguntasDoExame(e.id).length;
      if (!n) return;
      var o = document.createElement("option");
      o.value = e.id;
      o.textContent = e.nome + " (" + n + " perguntas)";
      sel.appendChild(o);
    });
    sel.parentNode.classList.toggle("hidden", sel.children.length < 2);
    descreverExame();
  }

  // Texto por baixo do título do simulador, conforme o exame escolhido.
  function descreverExame() {
    var id = $("selExame").value;
    var p = $("exameDescricao");
    if (!id) {
      p.innerHTML = "<b>" + (EXAME.porCategoria * categorias().length) + " perguntas</b> — " +
        EXAME.porCategoria + " de cada módulo — em <b>" + EXAME.minutos + " minutos</b>, sem ver as " +
        "respostas até entregares. Passas um módulo com <b>" + EXAME.minimo + " acertos em " +
        EXAME.porCategoria + "</b>: falhar um módulo leva-te a <b>exame oral</b>, falhar dois ou " +
        "mais é <b>reprovação</b>.";
      return;
    }
    var qs = perguntasDoExame(id);
    var porCat = {};
    qs.forEach(function (q) { porCat[q.categoria] = (porCat[q.categoria] || 0) + 1; });
    var detalhe = Object.keys(porCat).map(function (c) {
      return porCat[c] + " de " + c.replace(/\s*\(.*\)$/, "");
    }).join(", ");
    p.innerHTML = "<b>" + qs.length + " perguntas</b> — as da folha do " + exameNome(id) +
      " (" + detalhe + ") — em <b>" + EXAME.minutos + " minutos</b>, sem ver as respostas até " +
      "entregares. Passas cada módulo com <b>metade dos acertos</b>: falhar um módulo leva-te a " +
      "<b>exame oral</b>, falhar dois ou mais é <b>reprovação</b>.";
  }

  /* ---------- iniciar teste ---------- */
  function prepararPergunta(p, baralharOpcoes) {
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
      estado: "pendente",   // pendente | respondida (exame) | certa | errada
      escolhaIdx: -1
    };
  }

  function iniciarTeste() {
    var cat = $("selCategoria").value;
    var num = parseInt($("selNumero").value, 10);
    var baralhar = $("chkBaralhar").checked;
    var baralharOpcoes = $("chkBaralharOpcoes").checked;

    // "exame:<id>" treina só as perguntas dessa folha, pela ordem dela.
    var idExame = cat.indexOf("exame:") === 0 ? cat.slice(6) : null;
    var pool = idExame
      ? perguntasDoExame(idExame)
      : DATA.perguntas.filter(function (p) { return !cat || p.categoria === cat; });
    if (baralhar) pool = shuffle(pool);
    if (num > 0 && pool.length > num) pool = pool.slice(0, num);

    var perguntas = pool.map(function (p) { return prepararPergunta(p, baralharOpcoes); });

    test = {
      cat: idExame ? exameNome(idExame) : (cat || "Todas as matérias"),
      perguntas: perguntas, idx: 0,
      certas: 0, erradas: 0, total: perguntas.length,
      concluido: false
    };
    guardarEstado();
    abrirQuiz();
  }

  /* ---------- iniciar exame ---------- */
  function iniciarExame() {
    var idExame = $("selExame").value;
    var perguntas = [];
    if (idExame) {
      // Folha concreta: exactamente estas perguntas, pela ordem e com as opções
      // na ordem do exame — é para ser igual ao papel.
      perguntasDoExame(idExame).forEach(function (p) {
        perguntas.push(prepararPergunta(p, false));
      });
    } else {
      // 10 perguntas de cada módulo, agrupadas por módulo como nas folhas do exame.
      categorias().forEach(function (c) {
        var pool = shuffle(DATA.perguntas.filter(function (p) { return p.categoria === c; }));
        pool.slice(0, EXAME.porCategoria).forEach(function (p) {
          perguntas.push(prepararPergunta(p, true));
        });
      });
    }
    if (!perguntas.length) return;

    test = {
      modo: "exame",
      exameId: idExame || null,
      cat: idExame ? exameNome(idExame) : "Exame completo",
      perguntas: perguntas, idx: 0,
      certas: 0, erradas: 0, total: perguntas.length,
      concluido: false,
      inicio: Date.now(),
      fim: Date.now() + EXAME.minutos * 60 * 1000
    };
    guardarEstado();
    abrirQuiz();
  }

  function noExame() { return !!(test && test.modo === "exame"); }

  function abrirQuiz() {
    hide("screen-start");
    hide("screen-results");
    show("screen-quiz");
    window.scrollTo(0, 0);
    prepararCabecalho();
    renderPergunta();
  }

  /* ---------- cronómetro (só no exame) ---------- */
  function mmss(ms) {
    var s = Math.max(0, Math.round(ms / 1000));
    var m = Math.floor(s / 60);
    return (m < 10 ? "0" : "") + m + ":" + ((s % 60) < 10 ? "0" : "") + (s % 60);
  }

  function pararRelogio() {
    if (relogio) { clearInterval(relogio); relogio = null; }
  }

  function tiquetaque() {
    if (!noExame()) return;
    var resta = test.fim - Date.now();
    $("cronometro").textContent = "⏳ " + mmss(resta);
    $("cronometro").classList.toggle("is-alerta", resta <= 5 * 60 * 1000);
    if (resta <= 0) {
      pararRelogio();
      terminar(true);
    }
  }

  function prepararCabecalho() {
    pararRelogio();
    mapaAberto = false;
    var exame = noExame() && !test.concluido;
    $("scoreTreino").classList.toggle("hidden", exame);
    $("scoreExame").classList.toggle("hidden", !exame);
    $("cronometro").classList.toggle("hidden", !exame);
    $("btnTerminar").textContent = exame ? "✕ Entregar exame"
      : (test && test.veredicto) ? "✕ Voltar ao resultado" : "✕ Terminar teste";
    if (exame) { tiquetaque(); relogio = setInterval(tiquetaque, 1000); }
  }

  /* ---------- render de uma pergunta ---------- */
  function renderPergunta() {
    var q = test.perguntas[test.idx];
    // Durante o exame nada é revelado: a pergunta respondida continua editável e
    // só passa a "revisão" (verde/vermelho) depois de o exame ser entregue.
    var emProva = noExame() && !test.concluido;
    var revisao = !emProva && q.estado !== "pendente";

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
        if (emProva && i === q.escolhaIdx) btn.classList.add("is-escolhida");
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
      fb.textContent = noExame() ? "Certo! 👏" : "Certo! Acertaste à primeira. 👏";
      fb.className = "feedback ok";
    } else if (noExame() && q.escolhaIdx < 0) {
      fb.textContent = "Ficou por responder — conta como errada. A resposta certa está a verde.";
      fb.className = "feedback bad";
    } else {
      fb.textContent = "Errado. A resposta certa é a que está assinalada a verde.";
      fb.className = "feedback bad";
    }
    if (revisao && q.nota) { $("qNota").textContent = "ℹ️ " + q.nota; show("qNota"); }
    else hide("qNota");

    // navegação
    if (test.idx > 0) show("btnAnterior"); else hide("btnAnterior");
    var ultima = test.idx === test.total - 1;
    if (emProva) {
      // No exame avança-se sempre, com ou sem resposta dada.
      $("btnProxima").textContent = ultima ? "Entregar exame" : "Próxima pergunta";
      show("btnProxima");
    } else if (revisao) {
      $("btnProxima").textContent = ultima ? "Ver resultado" : "Próxima pergunta";
      show("btnProxima");
    } else {
      hide("btnProxima");
    }
    // esconder a barra de navegação quando não tem botões (1ª pergunta ainda por responder)
    if (test.idx > 0 || revisao || emProva) show("quizFoot"); else hide("quizFoot");

    renderMapa();
  }

  /* ---------- mapa das perguntas (exame) ---------- */
  function irPara(i) {
    test.idx = i;
    mapaAberto = false;          // saltar fecha o mapa, para se ver a pergunta
    renderPergunta();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function alternarMapa() {
    mapaAberto = !mapaAberto;
    renderMapa();
  }

  function renderMapa() {
    var wrap = $("mapaWrap");
    if (!noExame()) { wrap.classList.add("hidden"); return; }
    wrap.classList.remove("hidden");

    var feitas = test.perguntas.filter(function (q) { return q.escolhaIdx >= 0; }).length;
    var falta = test.total - feitas;
    $("mapaResumo").textContent = test.concluido
      ? "Perguntas do exame — salta para qualquer uma"
      : feitas + " de " + test.total + " respondidas" + (falta ? " · faltam " + falta : " · estão todas");
    $("mapaSeta").textContent = mapaAberto ? "▴" : "▾";
    $("btnMapa").setAttribute("aria-expanded", mapaAberto ? "true" : "false");
    $("mapaPerguntas").classList.toggle("hidden", !mapaAberto);
    if (!mapaAberto) return;

    var cont = $("mapaPerguntas");
    cont.innerHTML = "";
    var grelha = null, ultima = null;
    test.perguntas.forEach(function (q, i) {
      if (q.categoria !== ultima) {
        ultima = q.categoria;
        var h = document.createElement("div");
        h.className = "mapa-modulo";
        h.textContent = q.categoria;
        cont.appendChild(h);
        grelha = document.createElement("div");
        grelha.className = "mapa-grelha";
        cont.appendChild(grelha);
      }
      var b = document.createElement("button");
      b.type = "button";
      b.className = "mp";
      b.textContent = i + 1;
      if (test.concluido) {
        b.classList.add(q.estado === "certa" ? "is-certa" : "is-errada");
        b.title = "Pergunta " + (i + 1) + (q.estado === "certa" ? " — certa" : " — errada");
      } else if (q.escolhaIdx >= 0) {
        b.classList.add("is-feita");
        b.title = "Pergunta " + (i + 1) + " — respondida";
      } else {
        b.title = "Pergunta " + (i + 1) + " — por responder";
      }
      if (i === test.idx) b.classList.add("is-atual");
      b.addEventListener("click", function () { irPara(i); });
      grelha.appendChild(b);
    });
  }

  /* ---------- responder ---------- */
  function escolher(q, i) {
    // No exame a resposta pode ser mudada até à entrega e nada é revelado.
    if (noExame() && !test.concluido) {
      q.escolhaIdx = i;
      q.estado = "respondida";
      guardarEstado();
      renderPergunta();
      return;
    }
    if (q.estado !== "pendente") return;
    q.escolhaIdx = i;
    if (q.opcoes[i].correta) { q.estado = "certa"; test.certas++; }
    else { q.estado = "errada"; test.erradas++; }
    guardarEstado();
    renderPergunta();      // volta a desenhar já em modo "revelado"
  }

  function atualizarScore() {
    if (noExame() && !test.concluido) {
      $("scoreRespondidas").textContent = respondidas();
      $("scoreTotal").textContent = test.total;
      return;
    }
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

  /* ---------- entregar o exame ---------- */
  // Corrige as 40 perguntas (as que ficaram por responder contam como erradas),
  // conta os acertos de cada módulo e aplica as regras da prova.
  function corrigirExame() {
    var porModulo = {};
    test.certas = 0; test.erradas = 0;
    test.perguntas.forEach(function (q) {
      var certa = q.escolhaIdx >= 0 && q.opcoes[q.escolhaIdx].correta;
      q.estado = certa ? "certa" : "errada";
      if (certa) test.certas++; else test.erradas++;
      var m = porModulo[q.categoria] || (porModulo[q.categoria] = { certas: 0, total: 0 });
      m.total++;
      if (certa) m.certas++;
    });

    var falhados = Object.keys(porModulo).filter(function (c) {
      return porModulo[c].certas < minimoModulo(porModulo[c].total);
    });
    test.porModulo = porModulo;
    test.falhados = falhados;
    test.veredicto = falhados.length === 0 ? "aprovado"
      : falhados.length === 1 ? "oral" : "reprovado";
    test.minutos = Math.max(1, Math.round((Date.now() - test.inicio) / 60000));
    test.concluido = true;
  }

  function renderResultadoExame(porTempo) {
    var v = test.veredicto;
    var cfg = {
      aprovado: { emoji: "🏆", titulo: "Aprovado!", txt: "Passaste em todos os módulos.", cls: "is-aprovado" },
      oral:     { emoji: "🗣️", titulo: "Vais a exame oral", txt: "Falhaste 1 módulo — no exame real irias a oral.", cls: "is-oral" },
      reprovado:{ emoji: "📚", titulo: "Reprovado", txt: "Falhaste mais do que um módulo.", cls: "is-reprovado" }
    }[v];

    $("resultEmoji").textContent = cfg.emoji;
    $("resultTitulo").textContent = cfg.titulo;
    $("resultSub").textContent = (test.exameId ? exameNome(test.exameId) + " — " : "") +
      (porTempo ? "o tempo acabou e o exame foi entregue automaticamente." : "exame entregue.");

    var ver = $("veredicto");
    ver.textContent = cfg.txt;
    ver.className = "veredicto " + cfg.cls;

    var ul = $("resultModulos");
    ul.innerHTML = "";
    Object.keys(test.porModulo).forEach(function (c) {
      var m = test.porModulo[c];
      var minimo = minimoModulo(m.total);
      var passou = m.certas >= minimo;
      var li = document.createElement("li");
      li.className = passou ? "is-ok" : "is-bad";
      var nome = document.createElement("span");
      nome.className = "m-nome";
      nome.textContent = c;
      var score = document.createElement("span");
      score.className = "m-score";
      score.textContent = (passou ? "✓ " : "✗ ") + m.certas + " / " + m.total +
        (passou ? "" : "  (faltou " + (minimo - m.certas) + ")");
      li.appendChild(nome); li.appendChild(score);
      ul.appendChild(li);
    });

    $("resDetalhe").textContent =
      (test.exameId ? exameNome(test.exameId) + " · " : "") +
      "Total: " + test.certas + " de " + test.total + " · " + test.minutos + " min · " +
      (test.falhados.length === 0 ? "nenhum módulo falhado."
        : test.falhados.length + (test.falhados.length === 1 ? " módulo falhado." : " módulos falhados.")) +
      " Passa-se cada módulo com metade dos acertos.";

    show("resultExame");
    show("btnRever");
  }

  /* ---------- terminar / resultados ---------- */
  function terminar(porTempo) {
    pararRelogio();

    // Exame já entregue (estamos a rever): volta ao resultado sem recalcular nada.
    if (test && test.veredicto) {
      hide("screen-quiz");
      show("screen-results");
      window.scrollTo(0, 0);
      return;
    }

    if (noExame()) {
      corrigirExame();
      limparEstado();
      var pctE = Math.round(test.certas / test.total * 100);
      $("resCertas").textContent = test.certas;
      $("resErradas").textContent = test.erradas;
      $("resRespondidas").textContent = test.total;
      $("resPercent").textContent = pctE + "%";
      $("resultBar").style.width = pctE + "%";
      renderResultadoExame(porTempo === true);
      guardarHistorico(test.total, pctE);
      hide("screen-quiz");
      show("screen-results");
      window.scrollTo(0, 0);
      return;
    }

    hide("resultExame");
    hide("btnRever");
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
    // A rever um exame já entregue: volta ao resultado, sem perguntar nada.
    if (test && test.veredicto) { terminar(); return; }
    // Sem respostas ainda: termina logo (nada a perder).
    // Com respostas: pede confirmação num diálogo próprio (não usa window.confirm,
    // que nalguns browsers é bloqueado ou não aparece).
    if (respondidas() === 0 && !noExame()) { terminar(); return; }
    if (noExame()) {
      var falta = test.total - respondidas();
      $("modalTitulo").textContent = "Entregar o exame?";
      $("modalTexto").textContent = falta > 0
        ? "Ainda tens " + falta + (falta === 1 ? " pergunta por responder, que conta" : " perguntas por responder, que contam") +
          " como erradas. Depois de entregares não dá para mudar as respostas."
        : "Respondeste a todas. Depois de entregares não dá para mudar as respostas.";
      $("btnModalConfirmar").textContent = "Entregar exame";
    } else {
      $("modalTitulo").textContent = "Terminar o teste?";
      $("modalTexto").textContent = "Vais ver o resultado até aqui. Podes retomar este teste mais tarde a partir do ecrã inicial.";
      $("btnModalConfirmar").textContent = "Terminar teste";
    }
    show("modalTerminar");
  }

  /* ---------- rever o exame já entregue ---------- */
  function reverExame() {
    if (!test) return;
    test.idx = 0;
    hide("screen-results");
    show("screen-quiz");
    prepararCabecalho();
    renderPergunta();
    window.scrollTo(0, 0);
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
    var exame = retomavel.modo === "exame";
    var resp = exame
      ? retomavel.perguntas.filter(function (q) { return q.escolhaIdx >= 0; }).length
      : retomavel.certas + retomavel.erradas;
    var resta = exame ? retomavel.fim - Date.now() : 0;
    $("retomarTitulo").textContent = exame
      ? "▶ Tens um exame a meio" + (retomavel.exameId ? " (" + retomavel.cat + ")" : "")
      : "▶ Tens um teste a meio";
    $("retomarDetalhe").textContent = exame
      ? (resta > 0 ? mmss(resta) + " restantes" : "tempo esgotado") +
        " · " + resp + " de " + retomavel.total + " respondidas"
      : retomavel.cat + " · " + resp + " de " + retomavel.total + " respondidas";
    show("retomar");
  }
  function continuarTeste() {
    if (!retomavel) return;
    test = retomavel;
    // Exame cujo tempo acabou entretanto: entrega-se com o que houver.
    if (noExame() && test.fim - Date.now() <= 0) {
      hide("screen-start");
      terminar(true);
      return;
    }
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
      total: test.total, pct: pct, concluido: test.concluido,
      modo: test.modo || "treino",
      exameId: test.exameId || null,
      veredicto: test.veredicto || null,
      minutos: test.minutos || null
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
      var VER = { aprovado: "aprovado", oral: "vais a oral", reprovado: "reprovado" };
      esq.querySelector(".h-cat").textContent = it.veredicto
        ? "🎓 " + (it.exameId ? it.cat : "Exame") + " · " + VER[it.veredicto] +
          (it.minutos ? " · " + it.minutos + " min" : "")
        : it.cat + estado;
      var dir = document.createElement("div");
      dir.className = "h-score" + (it.veredicto ? " ver-" + it.veredicto : "");
      dir.innerHTML = '<b>' + it.certas + '</b> / ' + (it.veredicto ? it.total : (it.certas + it.erradas)) +
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
    pararRelogio();
    test = null;
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
    $("btnExame").addEventListener("click", iniciarExame);
    $("selExame").addEventListener("change", descreverExame);
    $("btnRever").addEventListener("click", reverExame);
    $("btnMapa").addEventListener("click", alternarMapa);
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
