# Prompt — Portal de treino para o exame de marinheiro

## Contexto e objetivo

Desenvolve uma aplicação web **responsive**, simples e intuitiva, para eu treinar
para o **exame de marinheiro** através de testes de **escolha múltipla**.

Não é preciso login, registo, nem qualquer backend/servidor. Deve funcionar como um
**site estático** (abrir o `index.html` no browser ou alojar em qualquer hosting
estático). Prioridade absoluta: **fácil de usar em telemóvel** e simples de manter.

## Como funcionam as perguntas

- As perguntas vêm de **exames anteriores** e serão fornecidas por mim ao longo do tempo.
- Cada pergunta tem: **enunciado**, um conjunto de **opções de resposta** e **uma
  resposta correta**.
- Guarda as perguntas num ficheiro de dados **`questions.json`** separado do código,
  fácil de editar e de expandir (para eu ir acrescentando perguntas sem mexer na lógica).

Estrutura de cada pergunta (exemplo):

```json
{
  "id": 1,
  "question": "Qual é o significado de bombordo?",
  "options": [
    "O lado direito da embarcação",
    "O lado esquerdo da embarcação",
    "A parte de trás da embarcação",
    "A parte da frente da embarcação"
  ],
  "correctIndex": 1,
  "category": "Nomenclatura"
}
```

> O campo `category` é opcional. Se for simples, começa sem categorias.

## Ecrãs / fluxo da aplicação

**1. Ecrã inicial**
- Título e uma breve explicação.
- Mostra o **total de perguntas disponíveis**.
- Botão grande **"Iniciar teste"**.
- Opções (com valores por defeito sensatos):
  - Número de perguntas do teste: **todas** ou um número à escolha (ex.: 10, 20, 40).
  - **Baralhar** as perguntas (ligado por defeito).
  - Baralhar a ordem das opções de cada pergunta (ligado por defeito).

**2. Ecrã de teste (uma pergunta de cada vez)**
- Mostra **uma pergunta de cada vez**, com as suas opções como botões grandes
  (fáceis de tocar no telemóvel).
- Barra e indicador de **progresso** (ex.: `3 / 20`).
- Contadores sempre visíveis: **Certas** e **Erradas**.
- Comportamento ao responder:
  - O utilizador escolhe uma opção.
  - Se **errar**: a opção escolhida fica **vermelha**, a pergunta **mantém-se** e ele
    pode **continuar a tentar até acertar**. Só depois de acertar é que pode avançar.
  - Se **acertar**: a opção correta fica **verde** e aparece o botão
    **"Próxima pergunta"** (ou termina, se for a última).
- **Regra de contagem (importante):**
  - Uma pergunta conta como **CERTA** apenas se for acertada **à primeira tentativa**.
  - Se for errada **pelo menos uma vez** (mesmo que depois acerte), conta como **ERRADA**.
- Botão **"Terminar teste"** sempre disponível, para parar a meio.

**3. Ecrã de resultados**
- Mostra o resultado **até ao momento em que o teste terminou** (seja no fim ou por
  ter terminado a meio):
  - Nº de **certas** e nº de **erradas**.
  - **Perguntas respondidas / total** do teste.
  - **Percentagem** de acerto.
- Botão **"Recomeçar"** para voltar ao ecrã inicial e fazer novo teste.

## Requisitos não funcionais

- **Responsive / mobile-first**: tem de ficar bem em telemóvel e em desktop.
- Interface **limpa, com bom contraste** e botões de toque generosos.
- **Simples e intuitiva** — sem instruções complicadas.
- **Sem login e sem backend.** Nada de contas nem base de dados.
- Feedback visual **imediato** ao responder (verde/vermelho).
- **Nunca avançar automaticamente** enquanto a pergunta não estiver certa.

## Stack técnica sugerida

- **HTML + CSS + JavaScript (vanilla)**, sem passo de build, para máxima simplicidade.
  (Se preferires, um framework leve serve, mas evita complexidade desnecessária.)
- Perguntas em **`questions.json`** carregado pela aplicação.
- Opcional: guardar em **`localStorage`** o histórico simples dos últimos resultados.
- Estrutura de ficheiros sugerida:
  - `index.html`
  - `style.css`
  - `app.js`
  - `questions.json`

## Extras opcionais (só se não complicar)

- Histórico dos últimos testes (data, certas/erradas, %).
- Rever no fim quais as perguntas erradas.
- Filtrar o teste por `category`.

## Notas finais

- Começa por criar a aplicação com **algumas perguntas de exemplo** no `questions.json`,
  para eu poder testar logo. Depois eu forneço as perguntas reais dos exames.
- Comenta o código de forma simples e deixa claro **onde e como acrescentar perguntas**.
