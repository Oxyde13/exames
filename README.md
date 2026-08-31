# Treino — Exame de Segurança Básica (marítimo)

Aplicação web simples e responsive para treinar para o exame de marinheiro
(Segurança Básica, STCW A-VI/1). Sem login, sem servidor, sem dados enviados.

## Como abrir

**Basta fazer duplo-clique em `index.html`** — abre no teu browser e funciona logo,
no computador ou no telemóvel (abre o ficheiro pelo browser do telemóvel).

Se preferires abrir num servidor local:

```bash
cd exames
python3 -m http.server 8000
```

E abre `http://localhost:8000` no browser.

## Como funciona

1. Escolhe a **matéria** e o **número de perguntas** e carrega em **Iniciar teste**.
2. As perguntas aparecem uma a uma. Escolhe a opção que achas certa.
   - Ao responderes, a app **mostra logo a resposta certa** (a **verde**) e, se
     erraste, marca a tua escolha a **vermelho**.
3. Uma pergunta conta como **certa** só se acertares **à primeira**;
   caso contrário conta como **errada**.
4. Podes usar **‹ Anterior** para **voltar atrás** e rever as perguntas já respondidas.
5. Podes **terminar o teste a meio** e ver o resultado até esse momento — e depois
   **retomá-lo** mais tarde: no ecrã inicial aparece **"Tens um teste a meio ▸ Continuar"**.
6. No fim vês: **certas**, **erradas**, **respondidas** e **percentagem de acerto**.

Extras: filtrar por matéria, baralhar perguntas/opções, histórico dos últimos
testes (guardado só no teu browser) e tema claro/escuro (botão 🌙 no topo).

## Matérias incluídas (185 perguntas)

| Matéria | Perguntas |
|---|---|
| Incêndios · PCI (A-VI/1.2) | 91 |
| Sobrevivência (A-VI/1.1) | 27 |
| Segurança Pessoal (A-VI/1.4) | 28 |
| Prevenção de Assédio (SPRS) | 10 |
| Primeiros Socorros (A-VI/1.3) | 29 |

## Ficheiros

- `index.html` — a página
- `style.css` — o aspeto
- `app.js` — a lógica do teste
- `questions.js` — **as perguntas e respostas** (é o que a app lê)
- `questions.json` — a mesma informação em formato legível (cópia de referência)
- `images/` — imagens das perguntas com símbolos

## Adicionar ou corrigir perguntas

As perguntas estão em **`questions.js`**. Abre o ficheiro num editor de texto e
acrescenta um objeto à lista `"perguntas"`, seguindo este formato:

```js
{
 "id": "pci-88",
 "numero": 140,         // número único da pergunta (usa o próximo livre: 140, 141, ...)
 "categoria": "Incêndios · PCI (A-VI/1.2)",
 "enunciado": "O texto da pergunta?",
 "opcoes": ["Opção A", "Opção B", "Opção C", "Opção D"],
 "correta": 1,          // índice da opção certa: 0=A, 1=B, 2=C, 3=D
 "imagem": "images/xxx.png",   // opcional — só se a pergunta tiver imagem
 "nota": "Texto de aviso"      // opcional — mostrado depois de acertar
}
```

Guarda o ficheiro e recarrega a página. (Se editares o `questions.json`,
lembra-te de passar a alteração também para o `questions.js`, que é o que a app usa.)

**Números das perguntas:** cada pergunta tem um **número único e fixo** (1 a 185),
mostrado em cada pergunta como **"N.º 45"** — ao lado da matéria. Esse número **não
muda** quando as perguntas são baralhadas, por isso serve para identificar uma pergunta
em concreto (ex.: *"a pergunta N.º 45 tem a resposta errada"*). Não confundir com o
**"4 / 20"** no topo, que é apenas a posição no teste atual.

## Sobre as respostas

- As respostas das matérias **Sobrevivência, Primeiros Socorros e Segurança Pessoal**
  e várias de **Incêndios** foram tiradas dos **exames de correção oficiais** que
  forneceste (resposta assinalada com X).
- As restantes respostas de **Incêndios (PCI)** — cujo ficheiro só tinha as perguntas —
  foram preenchidas com conhecimento da matéria de segurança marítima.
- Algumas poucas perguntas têm uma **nota ℹ️** a sugerir que confirmes a resposta com
  o teu formador/manual (são as de resposta menos linear). Se encontrares alguma
  resposta que aches errada, é só corrigir o `correta` dessa pergunta no `questions.js`.
