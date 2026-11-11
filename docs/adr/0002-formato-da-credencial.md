# ADR-0002: Formato da credencial (carteirinha digital)

- **Status:** Aceito
- **Data:** 09/11/2026
- **Decisor:** aluno (projeto individual)
- **Relacionado:** `docs/dominio.md`, `docs/spike-deno.md`

## Contexto

A carteirinha do sócio precisa ser um documento que:

1. o sócio guarda e apresenta a cada empréstimo;
2. o servidor consegue verificar (autenticidade e validade) **sem consultar o banco**, deixando a consulta ao banco só para revogação e limite;
3. detecta qualquer alteração de conteúdo.

O projeto roda em Deno 2, onde a criptografia está disponível pela Web Crypto (`crypto.subtle`), incluindo Ed25519 (validado na spike, conforme relato do aluno; anexar evidência em `docs/spike-deno.md`). O prazo de entrega é curto (13/11), então o risco de implementação pesa na decisão.

## Decisão

Usar **JWS compacto** (`cabecalho.payload.assinatura`, cada parte em base64url), **implementado à mão** com Web Crypto e o algoritmo **fixado em EdDSA (Ed25519)**.

Regras de verificação que decorrem da decisão:

- Aceitar somente `alg: EdDSA`. Qualquer outro valor (inclusive `none`) é rejeitado.
- O cabeçalho carrega um `kid`; chave desconhecida é rejeitada.
- A assinatura cobre os **bytes exatos** das duas primeiras partes, então não há etapa de canonicalização de JSON.
- O payload leva só identidade e categoria (`jti`, `sub`, `categoria`, `iat`, `exp`). O limite de empréstimos fica no código, não na credencial.

## Alternativas consideradas

| Alternativa | Por que foi descartada |
|---|---|
| **JSON com chaves ordenadas e assinatura separada** | Exige canonicalização. Ordem de chaves, espaços e representação de números são fonte clássica de bugs sutis, em que emissor e verificador discordam sobre os bytes assinados. É risco desnecessário para o prazo |
| **Biblioteca `jose` via `npm:`** | Reduziria código próprio, mas acrescenta uma dependência cujo comportamento no Deno ainda teria de ser validado, dentro de um prazo curto. A implementação à mão é pequena e rende testes negativos que demonstram o domínio do assunto |
| **JWT com HS256 (segredo compartilhado)** | Quem verifica precisaria da mesma chave que assina, o que permitiria a um verificador forjar credenciais. Com Ed25519, a chave pública verifica e só o emissor assina |
| **ACA-Py, Aries, AnonCreds ou W3C Verifiable Credentials** | Exigem agentes, carteiras, DID e (em geral) um ledger. A operação é desproporcional para um projeto individual de 6 dias e não traz benefício para o problema, em que a biblioteca é emissora e verificadora ao mesmo tempo (confiança centralizada) |

## Consequências

**Positivas**

- Verificação de assinatura e validade é código puro, testável sem banco e sem servidor.
- Sem canonicalização, some uma classe inteira de bugs.
- Formato padrão e conhecido, o que facilita explicar e documentar.

**Negativas e riscos**

- A implementação à mão exige disciplina no tratamento do cabeçalho (algoritmo fixo, `kid` conhecido, partes bem formadas). Mitigação: testes negativos listados em `docs/dominio.md` (invariante I3).
- Sem privacidade seletiva: o verificador vê todos os dados da credencial.
- Revogação depende de consulta ao banco; a credencial sozinha não prova que não foi revogada.
- Um único emissor e uma única chave. O `kid` deixa a rotação possível no futuro, mas ela não é implementada agora.

## Critério para reavaliar

Reabrir esta decisão se: (a) houver mais de um emissor ou necessidade de interoperar com sistemas externos (aí vale considerar W3C Verifiable Credentials); (b) a implementação à mão gerar bugs de verificação que uma biblioteca madura evitaria; (c) surgir exigência de divulgação seletiva de dados.
