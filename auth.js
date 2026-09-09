/* ============================================================
   auth.js — ecrã de bloqueio.

   O conteúdo da app (window.EXAM_BLOB, em content.enc.js) está cifrado com
   AES-256-GCM e a chave é derivada do PIN por PBKDF2. Não há PIN guardado em
   lado nenhum: se a desencriptação falhar, o PIN estava errado.

   Ao desbloquear: define window.EXAM_DATA, cria os blob URL das imagens em
   window.EXAM_IMAGENS e arranca a app (window.startApp).
   ============================================================ */
(function () {
  "use strict";

  var DB = "sb_auth";          // IndexedDB com a chave "lembrada" (não-extraível)
  var STORE = "chaves";
  var CHAVE_ID = "conteudo";

  var tentativas = 0;
  var ocupado = false;

  function $(id) { return document.getElementById(id); }
  function show(id) { $(id).classList.remove("hidden"); }
  function hide(id) { $(id).classList.add("hidden"); }

  function b64buf(b64) {
    var bin = atob(b64);
    var buf = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    return buf;
  }

  /* ---------- chave lembrada (IndexedDB) ----------
     Guardamos a CryptoKey derivada com extractable:false — o PIN nunca é
     guardado e a própria chave não pode ser lida por JavaScript, só usada. */
  function abrirDB() {
    return new Promise(function (resolve, reject) {
      if (!window.indexedDB) return reject(new Error("sem indexedDB"));
      var req = indexedDB.open(DB, 1);
      req.onupgradeneeded = function () { req.result.createObjectStore(STORE); };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function comStore(modo, fn) {
    return abrirDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, modo);
        var req = fn(tx.objectStore(STORE));
        tx.oncomplete = function () { db.close(); resolve(req && req.result); };
        tx.onerror = function () { db.close(); reject(tx.error); };
      });
    });
  }

  function lerChave() {
    return comStore("readonly", function (s) { return s.get(CHAVE_ID); })
      .catch(function () { return null; });
  }
  function guardarChave(k) {
    return comStore("readwrite", function (s) { return s.put(k, CHAVE_ID); })
      .catch(function () { /* modo privado, quota, etc. — segue sem lembrar */ });
  }
  function esquecerChave() {
    return comStore("readwrite", function (s) { return s.delete(CHAVE_ID); })
      .catch(function () {});
  }

  /* ---------- cripto ---------- */
  function derivarChave(pin) {
    var blob = window.EXAM_BLOB;
    return crypto.subtle
      .importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveKey"])
      .then(function (base) {
        return crypto.subtle.deriveKey(
          {
            name: "PBKDF2",
            salt: b64buf(blob.kdf.salt),
            iterations: blob.kdf.iterations,
            hash: blob.kdf.hash
          },
          base,
          { name: "AES-GCM", length: 256 },
          false,                       // não-extraível: nem nós conseguimos lê-la
          ["decrypt"]
        );
      });
  }

  function desencriptar(chave) {
    var blob = window.EXAM_BLOB;
    return crypto.subtle
      .decrypt({ name: "AES-GCM", iv: b64buf(blob.iv) }, chave, b64buf(blob.data))
      .then(function (buf) { return JSON.parse(new TextDecoder().decode(buf)); });
  }

  /* ---------- entrega do conteúdo à app ---------- */
  function arrancar(conteudo) {
    window.EXAM_DATA = { meta: conteudo.meta, perguntas: conteudo.perguntas };

    // As imagens vêm dentro do pacote cifrado: viram blob URL, indexados pelo
    // mesmo caminho que as perguntas já usam ("images/pci-q1.png").
    var mapa = {};
    var imgs = conteudo.imagens || {};
    Object.keys(imgs).forEach(function (caminho) {
      try {
        mapa[caminho] = URL.createObjectURL(
          new Blob([b64buf(imgs[caminho].dados)], { type: imgs[caminho].tipo })
        );
      } catch (e) { /* imagem inutilizável — a pergunta aparece sem figura */ }
    });
    window.EXAM_IMAGENS = mapa;

    hide("screen-lock");
    show("appMain");
    show("themeToggle");
    show("btnBloquear");
    window.startApp();
  }

  /* ---------- interface ---------- */
  function estado(msg, tipo) {
    var el = $("lockMsg");
    el.textContent = msg || "";
    el.className = "lock-msg" + (tipo ? " is-" + tipo : "");
  }

  function ocupar(sim, texto) {
    ocupado = sim;
    $("btnDesbloquear").disabled = sim;
    $("lockPin").disabled = sim;
    $("btnDesbloquear").textContent = sim ? (texto || "A desbloquear…") : "Desbloquear";
  }

  function desbloquear() {
    if (ocupado) return;
    var pin = $("lockPin").value.trim();
    if (!pin) { estado("Escreve o PIN.", "erro"); return; }

    // Travão simples contra tentativa-e-erro à mão (o ataque a sério é offline).
    var espera = tentativas >= 5 ? Math.min(30, Math.pow(2, tentativas - 4)) * 1000 : 0;
    ocupar(true, espera ? "Aguarda…" : "A desbloquear…");

    setTimeout(function () {
      derivarChave(pin)
        .then(function (chave) {
          return desencriptar(chave).then(function (conteudo) {
            if ($("lockLembrar").checked) return guardarChave(chave).then(function () { return conteudo; });
            return esquecerChave().then(function () { return conteudo; });
          });
        })
        .then(arrancar)
        .catch(function () {
          tentativas++;
          ocupar(false);
          estado("PIN errado.", "erro");
          $("lockPin").value = "";
          $("lockPin").focus();
        });
    }, espera);
  }

  function bloquear() {
    esquecerChave().then(function () { location.reload(); });
  }

  /* ---------- arranque ---------- */
  function iniciar() {
    if (!window.EXAM_BLOB) {
      estado("Não foi possível carregar o conteúdo (content.enc.js).", "erro");
      ocupar(true, "Indisponível");
      return;
    }
    if (!window.crypto || !crypto.subtle) {
      // file:// em alguns browsers não é contexto seguro e não expõe o WebCrypto.
      estado("Este browser só desencripta em https ou localhost. Abre a app pelo endereço do site.", "erro");
      ocupar(true, "Indisponível");
      return;
    }

    $("btnDesbloquear").addEventListener("click", desbloquear);
    $("lockPin").addEventListener("keydown", function (e) {
      if (e.key === "Enter") desbloquear();
    });
    $("btnBloquear").addEventListener("click", bloquear);

    // Se este dispositivo já foi desbloqueado, entra directamente.
    lerChave().then(function (chave) {
      if (!chave) { $("lockPin").focus(); return; }
      ocupar(true, "A abrir…");
      desencriptar(chave)
        .then(arrancar)
        .catch(function () {
          // Chave já não serve (conteúdo re-cifrado com outro PIN).
          esquecerChave().then(function () {
            ocupar(false);
            estado("O PIN mudou. Escreve o novo.", "erro");
            $("lockPin").focus();
          });
        });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", iniciar);
  } else { iniciar(); }
})();
