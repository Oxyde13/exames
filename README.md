# RadarVirtual — Treino de Marinheiro com Segurança Básica

Aplicação web simples e responsive para treinar para o exame de marinheiro
(Segurança Básica, STCW A-VI/1), da **Escola de Formação Náutica RadarVirtual**
([radarvirtual.pt](https://radarvirtual.pt)). Sem login, sem servidor, sem dados enviados.
As perguntas estão **encriptadas** e só abrem com um PIN — ver
[Protecção por PIN](#protecção-por-pin).

## Como abrir

**Basta fazer duplo-clique em `index.html`** — abre no teu browser e funciona logo,
no computador ou no telemóvel (abre o ficheiro pelo browser do telemóvel).

Se preferires abrir num servidor local:

```bash
cd exames
python3 -m http.server 8000
```

E abre `http://localhost:8000` no browser.

Em qualquer dos casos aparece primeiro o ecrã do PIN. Com **Lembrar neste
dispositivo** ligado, só o escreves uma vez por telemóvel/computador; o botão **🔒**
no topo volta a bloquear.

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

## Matérias incluídas (242 perguntas)

| Matéria | Perguntas |
|---|---|
| Incêndios · PCI (A-VI/1.2) | 96 |
| Primeiros Socorros (A-VI/1.3) | 50 |
| Responsabilidades Sociais (A-VI/1.4) | 50 |
| Sobrevivência (A-VI/1.1) | 46 |

## Exames concretos

Além das matérias, dá para treinar **uma folha de exame em concreto**. Estão
disponíveis:

| Exame | Perguntas |
|---|---|
| Exame SB 3.0 | 43 (9 + 10 + 12 + 12) |
| Exame SB 3.1 | 40 (10 de cada módulo) |

Há duas formas de o fazer:

- **Treino** — no ecrã inicial, em *Matéria*, escolhe o exame no grupo "Exames"
  (ex.: **🎓 Exame SB 3.1**). Com *Baralhar as perguntas* desligado, vêm exactamente
  pela ordem da folha.
- **Simular exame real** — no cartão do simulador, o campo *Exame* deixa escolher entre
  **Aleatório** (10 de cada módulo, como até aqui) e uma folha concreta. Escolhida uma
  folha, saem exactamente aquelas perguntas, pela ordem do papel e com as opções por
  baralhar.

Como as folhas nem sempre têm 10 perguntas por módulo, a regra dos "5 acertos em 10"
generaliza-se para **metade dos acertos do módulo** (arredondada para cima). Falhar um
módulo continua a levar a oral, dois ou mais a reprovação.

### Acrescentar outro exame

No `private/questions.json`, cada pergunta que faça parte de uma folha leva

```json
"exames": { "sb30": 12, "sb31": 28 }
```

— o `12` é a **posição dessa pergunta na folha**. Uma pergunta pode pertencer a vários
exames. Depois declara o exame no `meta`:

```json
"exames": [
  { "id": "sb30", "nome": "Exame SB 3.0", "descricao": "...", "total": 43 },
  { "id": "sb31", "nome": "Exame SB 3.1", "descricao": "...", "total": 40 }
]
```

Perguntas que já existam no banco **não se duplicam** — marcam-se com a posição nesta
folha. Só as inéditas é que entram como perguntas novas.

## Protecção por PIN

O site é estático e público, por isso um PIN comparado em JavaScript não protegeria
nada — bastava abrir o ficheiro das perguntas pelo URL. Em vez disso, **o conteúdo é
que está cifrado**:

- `private/questions.json` e `private/images/` — o conteúdo em claro. **Nunca vão para
  o Git** (estão no `.gitignore`); vivem só no teu computador.
- `content.enc.js` — o que é publicado: perguntas e imagens cifradas com **AES-256-GCM**,
  com a chave derivada do PIN por **PBKDF2-SHA256 (1 milhão de iterações)**.
- O PIN não está guardado em lado nenhum, nem sequer um resumo dele: se a
  desencriptação falhar, o PIN estava errado.
- "Lembrar neste dispositivo" guarda a chave já derivada no IndexedDB do browser, marcada
  como não-extraível — o PIN nunca é guardado e nem o próprio JavaScript consegue ler a
  chave, só usá-la.

### Mudar o PIN, ou publicar alterações

```bash
node tools/pack.js          # pede o PIN (duas vezes) e gera o content.enc.js
git add content.enc.js && git commit -m "Update content" && git push
```

Correr o script com outro PIN muda o PIN para toda a gente. Quem tinha "Lembrar neste
dispositivo" vê a mensagem *"O PIN mudou. Escreve o novo."*

Se perderes o `private/questions.json`, recupera-o com o PIN:

```bash
node tools/pack.js --unpack
```

### Até onde isto protege

Protege contra quem chega ao site ou ao repositório: não há forma de ler as perguntas
sem o PIN. **Não** protege contra alguém determinado: um PIN de 6 dígitos são só um
milhão de hipóteses e, com uma boa placa gráfica, dá para as experimentar todas ao
ficheiro cifrado em minutos a horas. Cada dígito a mais multiplica esse tempo por 10 —
o `tools/pack.js` aceita PIN de qualquer comprimento. Nota ainda que o conteúdo que
esteve publicado em claro antes desta mudança continua no histórico do Git.

Se um dia precisares de protecção a sério, o passo seguinte é alojar o site atrás de
autenticação de servidor (por exemplo Cloudflare Pages + Cloudflare Access, gratuito
até 50 utilizadores).

## Ficheiros

- `index.html` — a página
- `style.css` — o aspeto (cores da escola: roxo `#6a1856` e teal `#116f88`)
- `app.js` — a lógica do teste
- `auth.js` — o ecrã do PIN e a desencriptação
- `content.enc.js` — **as perguntas e as imagens, cifradas** (é o que a app lê)
- `tools/pack.js` — gera o `content.enc.js` a partir do `private/`
- `private/questions.json` — as perguntas em claro (fora do Git)
- `private/images/` — imagens das perguntas com símbolos (fora do Git)
- `icons/` — logótipo e ícones da RadarVirtual (o `logo.png` é o do site da escola;
  os ícones da app são o símbolo do logótipo recortado)

## Adicionar ou corrigir perguntas

As perguntas estão em **`private/questions.json`**. Abre o ficheiro num editor de texto
e acrescenta um objeto à lista `"perguntas"`, seguindo este formato:

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

Guarda o ficheiro e corre `node tools/pack.js` para voltar a cifrar o conteúdo — só
depois é que a alteração aparece na app. (Uma imagem nova é `private/images/xxx.png` e
entra no pacote sozinha; o campo `"imagem"` continua a ser `"images/xxx.png"`.)

**Números das perguntas:** cada pergunta tem um **número único e fixo** (1 a 242),
mostrado em cada pergunta como **"N.º 45"** — ao lado da matéria. Esse número **não
muda** quando as perguntas são baralhadas, por isso serve para identificar uma pergunta
em concreto (ex.: *"a pergunta N.º 45 tem a resposta errada"*). Não confundir com o
**"4 / 20"** no topo, que é apenas a posição no teste atual.

## Sobre as respostas

- As respostas das matérias **Sobrevivência, Primeiros Socorros e Responsabilidades Sociais**
  e várias de **Incêndios** foram tiradas dos **exames de correção oficiais** que
  forneceste (resposta assinalada com X).
- As restantes respostas de **Incêndios (PCI)** — cujo ficheiro só tinha as perguntas —
  foram preenchidas com conhecimento da matéria de segurança marítima.
- Algumas poucas perguntas têm uma **nota ℹ️** a sugerir que confirmes a resposta com
  o teu formador/manual (são as de resposta menos linear). Se encontrares alguma
  resposta que aches errada, é só corrigir o `correta` dessa pergunta no
  `private/questions.json` e correr `node tools/pack.js`.
