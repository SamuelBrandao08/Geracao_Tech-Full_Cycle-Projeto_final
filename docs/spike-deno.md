# Spike: viabilidade do Deno 2 na stack do projeto

Data: 08/11/2026 · Projeto: biblioteca com carteirinha digital verificável (nível B)

## Objetivo

Validar, antes de investir no projeto, se **Deno 2 + TypeScript + Fastify + PostgreSQL + `deno test`** se sustenta no prazo (entrega em 13/11). Regra de decisão combinada: se algum item travasse por mais de ~30 minutos, voltaríamos para Node.js.

Código da spike: `spike/deno/` (descartável; só as lições entram no projeto).

## Legenda da coluna "Evidência"

- **Visto**: a saída do comando foi colada e analisada na conversa de tutoria.
- **Reportado**: o aluno informou que passou, mas a saída não foi analisada. **Anexar a saída ou um print antes da entrega.**

## Resultados por item

| # | Item | Critério de aceitação | Resultado | Evidência | Tempo |
|---|---|---|---|---|---|
| 1a | Fastify sobe no Deno | `GET /health` responde 200 com JSON | Passou, com `--allow-sys=networkInterfaces` | Visto | |
| 1b | Validação por schema | Body inválido retorna 400 sem exceção não tratada | Passou | Reportado | |
| 2a | Conexão com PostgreSQL via Compose | `GET /db-check` retorna 200 com a hora do banco | Passou (após corrigir variáveis de ambiente) | Visto | |
| 2b | Índice único parcial | Segundo empréstimo ativo do mesmo exemplar é rejeitado; após devolução, novo empréstimo é aceito | Passou | Visto | |
| 2c | Resiliência a falha do banco | Com o banco parado: 503 e `app` continua `Up`; ao religar, volta a 200 sem reiniciar o `app` | Passou | Reportado | |
| 3 | Ed25519 | Assina, verifica, rejeita payload alterado em 1 caractere, verifica com chave pública reimportada | Passou | Reportado | |
| 4 | `deno test` com `inject()` | Teste da rota válida e inválida, cobertura em lcov, sem recursos pendentes | Passou | Reportado | |
| 5 | pino e prom-client | Log JSON por requisição; `/metrics` com contador que incrementa | Passou | Reportado | |
| 6a | Imagem Docker | `docker build` conclui | Passou | Visto | |
| 6b | Container responde | `/health` retorna 200 dentro do container | Passou (após aguardar a aplicação subir) | Visto | |
| 6c | Aplicação e Postgres no Compose | Os dois serviços sobem; `postgres` fica healthy | Passou | Visto | |
| 6d | Usuário não root | `docker exec spike-app id` mostra uid diferente de 0 | Passou | Reportado | |
| 6e | Segredos fora do Git e da imagem | `.env` não versionado; sem senha no histórico da imagem | Passou | Reportado | |

**Tempo total real da spike:** ______ (previsto: 1 a 2 horas; o tempo extra foi consumido principalmente por erros de configuração do Compose e do Docker, ver lições 3 a 7).

## Lições e achados

Cada achado é um risco que o projeto final deve evitar ou documentar.

| # | Achado | Causa | O que fazer no projeto | Status |
|---|---|---|---|---|
| 1 | Container caía ao iniciar com `NotCapable: Requires sys access to "networkInterfaces"` | O Fastify lista as interfaces de rede ao imprimir o endereço de escuta, e o Deno nega por padrão | Conceder só `--allow-sys=networkInterfaces` no `CMD` (menor privilégio) | Confirmado |
| 2 | O Deno pediu `sys` para `"uid"` ao rodar localmente | Hipótese: o driver tenta usar o usuário do sistema quando o usuário do banco não é informado | Rodar com `--no-prompt` para descobrir a lista mínima de permissões; no container não há prompt | **Hipótese, não confirmada** |
| 3 | `curl` logo após `docker run -d` falhava com "conexão fechada" | O container existia, mas a aplicação ainda não escutava | Usar `healthcheck` e `depends_on: service_healthy`; nunca presumir que "container no ar" significa "aplicação pronta" | Confirmado (com `sleep 3` respondeu 200) |
| 4 | Aplicação escutava na porta 3000, mapeamento publicava 8000 | Porta fixa no código, divergente do `-p` | Ler a porta de variável de ambiente (`PORT`) e declarar em um só lugar | Confirmado |
| 5 | `POSTRGRES_USER` e `POSTRGRES_PASSWORD` no Compose, `POSTGRES_*` no código | Erro de digitação em nome de variável: o Compose aceita qualquer chave, e o erro só aparece depois, vindo do banco | Validar na partida que as variáveis obrigatórias existem, com mensagem que nomeia a que falta | Confirmado |
| 6 | `catch` genérico devolvia 503 e escondia um `TypeError` do próprio código | Toda exceção virava "serviço indisponível" e nada era registrado | Registrar o erro completo no log; só falha de **dependência** vira 503, bug de código não | Confirmado |
| 7 | `docker compose up` mostrava `Running` e o ambiente não mudava | O Compose só recria o container quando a configuração do serviço muda | Inspecionar com `docker compose config` e forçar com `--force-recreate` | Confirmado |
| 8 | `id` pulou de 1 para 3 após inserção rejeitada | Sequências do Postgres não voltam atrás | Não usar `id` como contador sem lacunas | Confirmado |
| 9 | Violação do índice único retorna código `23505` | Comportamento do Postgres | Mapear para **409 Conflict** na API e cobrir com teste negativo de integração | Proposta |
| 10 | Senha apareceu em texto puro na saída de `docker compose config` | A `DATABASE_URL` carrega a senha dentro da URL | Mascarar saídas antes de compartilhar; preferir variáveis separadas; evitar duas convenções de configuração | Confirmado (valor de exemplo) |
| 11 | Erros `sql is not a function` e `ReferenceError` durante a integração da rota | Falha de escopo e de passagem de argumento no código; o parâmetro sem tipo não acusou o erro antes de rodar | Tipar parâmetros e rodar `deno check` (candidato a passo do CI) | Resolvido; causa exata não verificada |

## Decisão

**Deno 2 mantido** como runtime do projeto, sujeito às pendências abaixo.

- Critério de retorno ao Node.js (algum item travar por mais de ~30 min): **não acionado** nos itens de integração com Fastify, PostgreSQL e Docker. Os atrasos vieram de erros de configuração, não de incompatibilidade do Deno.
- Dependências validadas via `npm:`: `fastify`, `postgres`. As demais (`pino`, `prom-client`) constam como reportadas, sem evidência anexada.

## Pendências antes de fechar este documento

1. Anexar evidência (saída de comando ou print) para todas as linhas marcadas "Reportado".
2. Preencher a coluna "Tempo" e o tempo total real.
3. Confirmar a lição 2 rodando `deno run --no-prompt ...` e registrar a **lista final de permissões** usada no `CMD` do Dockerfile.
4. Registrar as versões usadas: `deno --version`, `docker compose version`, imagem `postgres:16-alpine`, `fastify`, `postgres` (3.4.9, conforme o log).

## Lista final de permissões do Deno

```
--allow-net --allow-env --allow-sys=networkInterfaces
```

Atualizar esta linha com o que a verificação da pendência 3 mostrar.
