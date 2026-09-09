#!/usr/bin/env node
/* ============================================================
   pack.js — cifra o conteúdo da app com uma chave derivada do PIN.

   O site publicado só contém `content.enc.js` (bytes cifrados).
   O conteúdo em claro vive em `private/`, que o Git ignora.

     node tools/pack.js                 # pergunta o PIN (não o mostra)
     node tools/pack.js --pin 482057    # não-interactivo
     node tools/pack.js --sem-imagens   # deixa images/ em claro (pacote leve)
     node tools/pack.js --unpack        # recupera private/questions.json do cifrado
     node tools/pack.js --unpack --out /tmp/x.json

   Criptografia: PBKDF2-SHA256 (1M iterações, salt de 16 bytes) → AES-256-GCM.
   O GCM autentica, por isso não é guardado nenhum hash do PIN: um PIN errado
   faz a desencriptação falhar.
   ============================================================ */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const readline = require("node:readline");

const RAIZ = path.resolve(__dirname, "..");
const FONTE = path.join(RAIZ, "private", "questions.json");
const SAIDA = path.join(RAIZ, "content.enc.js");
const DIR_IMAGENS = path.join(RAIZ, "private", "images");

const ITERACOES = 1000000;
const TAM_SALT = 16;
const TAM_IV = 12;

/* ---------- argumentos ---------- */
function args() {
  const a = process.argv.slice(2);
  const o = { unpack: false, semImagens: false, pin: null, out: null };
  for (let i = 0; i < a.length; i++) {
    if (a[i] === "--unpack") o.unpack = true;
    else if (a[i] === "--sem-imagens") o.semImagens = true;
    else if (a[i] === "--pin") o.pin = a[++i];
    else if (a[i] === "--out") o.out = a[++i];
    else if (a[i] === "-h" || a[i] === "--help") { ajuda(); process.exit(0); }
    else { erro("Argumento desconhecido: " + a[i]); }
  }
  return o;
}

function ajuda() {
  console.log([
    "Uso:",
    "  node tools/pack.js [--pin <pin>] [--sem-imagens]",
    "  node tools/pack.js --unpack [--pin <pin>] [--out <ficheiro>]",
    ""
  ].join("\n"));
}

function erro(msg) {
  console.error("✗ " + msg);
  process.exit(1);
}

/* ---------- PIN ---------- */
function pedirPin(confirmar) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    // Esconde o que é escrito (sem eco de caracteres).
    const escrever = rl._writeToOutput;
    let mudo = false;
    rl._writeToOutput = function (s) {
      if (!mudo) escrever.call(rl, s);
      else if (s.indexOf("\n") !== -1) escrever.call(rl, "\n");
    };
    rl.question("PIN: ", (pin) => {
      if (!confirmar) { rl.close(); process.stdout.write("\n"); return resolve(pin); }
      mudo = false;
      process.stdout.write("\n");
      rl.question("Repete o PIN: ", (pin2) => {
        rl.close();
        process.stdout.write("\n");
        if (pin !== pin2) erro("Os PIN não coincidem.");
        resolve(pin);
      });
      mudo = true;
    });
    mudo = true;
  });
}

function validarPin(pin) {
  if (!pin || !pin.length) erro("PIN vazio.");
  if (pin.length < 4) erro("PIN demasiado curto (mínimo 4 caracteres).");
  if (/^\d+$/.test(pin) && pin.length < 6) {
    console.warn("⚠ PIN numérico com menos de 6 dígitos — muito fácil de adivinhar.");
  }
  return pin;
}

/* ---------- cripto ---------- */
function derivar(pin, salt) {
  return crypto.pbkdf2Sync(Buffer.from(pin, "utf8"), salt, ITERACOES, 32, "sha256");
}

function cifrar(pin, texto) {
  const salt = crypto.randomBytes(TAM_SALT);
  const iv = crypto.randomBytes(TAM_IV);
  const chave = derivar(pin, salt);
  const c = crypto.createCipheriv("aes-256-gcm", chave, iv);
  const ct = Buffer.concat([c.update(texto, "utf8"), c.final(), c.getAuthTag()]);
  return { salt: salt, iv: iv, ct: ct };
}

function decifrar(pin, salt, iv, ct) {
  const chave = derivar(pin, salt);
  const tag = ct.subarray(ct.length - 16);
  const corpo = ct.subarray(0, ct.length - 16);
  const d = crypto.createDecipheriv("aes-256-gcm", chave, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(corpo), d.final()]).toString("utf8");
}

/* ---------- empacotar ---------- */
function lerImagens() {
  if (!fs.existsSync(DIR_IMAGENS)) return {};
  const mapa = {};
  fs.readdirSync(DIR_IMAGENS).sort().forEach((nome) => {
    if (!/\.(png|jpe?g|gif|webp|svg)$/i.test(nome)) return;
    const ext = path.extname(nome).toLowerCase();
    const tipo = ext === ".svg" ? "image/svg+xml"
      : ext === ".gif" ? "image/gif"
      : ext === ".webp" ? "image/webp"
      : ext === ".jpg" || ext === ".jpeg" ? "image/jpeg"
      : "image/png";
    mapa["images/" + nome] = {
      tipo: tipo,
      dados: fs.readFileSync(path.join(DIR_IMAGENS, nome)).toString("base64")
    };
  });
  return mapa;
}

async function empacotar(o) {
  if (!fs.existsSync(FONTE)) erro("Não encontrei " + rel(FONTE) + ".");

  let dados;
  try {
    dados = JSON.parse(fs.readFileSync(FONTE, "utf8"));
  } catch (e) {
    erro("O ficheiro " + rel(FONTE) + " não é JSON válido: " + e.message);
  }
  if (!dados.perguntas || !dados.perguntas.length) erro("O ficheiro não tem perguntas.");

  const pin = validarPin(o.pin || await pedirPin(true));
  const imagens = o.semImagens ? {} : lerImagens();
  const texto = JSON.stringify({ meta: dados.meta, perguntas: dados.perguntas, imagens: imagens });
  const { salt, iv, ct } = cifrar(pin, texto);

  const blob = {
    v: 1,
    kdf: { name: "PBKDF2", hash: "SHA-256", iterations: ITERACOES, salt: salt.toString("base64") },
    cipher: "AES-GCM",
    iv: iv.toString("base64"),
    data: ct.toString("base64")
  };

  fs.writeFileSync(SAIDA,
    "/* Conteúdo cifrado — gerado por tools/pack.js. Não editar à mão. */\n" +
    "window.EXAM_BLOB = " + JSON.stringify(blob) + ";\n", "utf8");

  const kb = (fs.statSync(SAIDA).size / 1024).toFixed(0);
  console.log("✓ " + rel(SAIDA) + " — " + dados.perguntas.length + " perguntas, " +
    Object.keys(imagens).length + " imagens, " + kb + " KB");
  if (o.semImagens) {
    console.log("  ⚠ --sem-imagens: copia private/images/ para images/ e acrescenta");
    console.log("    esses ficheiros ao ASSETS do sw.js — ficam legíveis no site.");
  }
  console.log("  Nada em claro foi publicado. Guarda o PIN: sem ele o conteúdo não abre.");
}

/* ---------- desempacotar ---------- */
async function desempacotar(o) {
  if (!fs.existsSync(SAIDA)) erro("Não encontrei " + rel(SAIDA) + ".");

  const js = fs.readFileSync(SAIDA, "utf8");
  const i = js.indexOf("{");
  const f = js.lastIndexOf("}");
  if (i === -1 || f === -1) erro("Não consegui ler o conteúdo de " + rel(SAIDA) + ".");

  let blob;
  try { blob = JSON.parse(js.slice(i, f + 1)); }
  catch (e) { erro("Conteúdo de " + rel(SAIDA) + " ilegível: " + e.message); }

  const pin = o.pin || await pedirPin(false);
  let texto;
  try {
    texto = decifrar(pin,
      Buffer.from(blob.kdf.salt, "base64"),
      Buffer.from(blob.iv, "base64"),
      Buffer.from(blob.data, "base64"));
  } catch (e) {
    erro("PIN errado (a verificação de integridade falhou).");
  }

  const conteudo = JSON.parse(texto);
  const destino = o.out ? path.resolve(o.out) : FONTE;
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.writeFileSync(destino,
    JSON.stringify({ meta: conteudo.meta, perguntas: conteudo.perguntas }, null, 1) + "\n", "utf8");
  console.log("✓ " + rel(destino) + " — " + conteudo.perguntas.length + " perguntas recuperadas.");
}

function rel(p) { return path.relative(RAIZ, p) || p; }

/* ---------- arranque ---------- */
const o = args();
(o.unpack ? desempacotar(o) : empacotar(o)).catch((e) => erro(e.message));
