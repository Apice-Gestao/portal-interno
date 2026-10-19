# Auditoria de lógica e fluxos — Claude Code — 19/10/2026

Pedido do usuário: “realize testes de todas as funções em paralelo e veja se identifica erro de lógica, fluxo de processos etc.”. As duas sessões paralelas não iniciaram (o Claude Desktop pediu para confiar no repositório), então a bateria foi executada nesta sessão. Só dados fictícios e bases descartáveis; nenhum segredo neste documento.

## O que foi executado

| Bateria | Resultado |
| --- | --- |
| `npm run test:massive` (tipagem, lint, testes, builds, banco, modelos, jornadas entre módulos, TV) | Aprovada: 315 testes; 25 cenários PostgreSQL; 8 de modelos/versões; 29 de jornadas e relatórios; 13 de TV. Banco principal inalterado, nenhuma base temporária restante |
| `test:e2e` (navegador, login real com código por e-mail) | 2/2 aprovados, pela primeira vez desde 13/10 |
| Passeio aleatório no motor (temporário, removido depois) | 5 sequências × 1.500 ações (início, etapas, anexo, envio, aprovação, devolução, espera, dispensa, cancelamento, reabertura, transferência, comentário) por administrador, operadores e coordenador. Todas as ações foram aceitas ao menos uma vez; ~1.000 aceitas e ~6.500 recusadas com motivo de negócio. **Nenhuma violação** das regras verificadas: estado válido, revisão +1, registro na auditoria, ação só em tarefa visível, conclusão só com etapas completas e data de conclusão, conferência independente, operador sem concessão não aprova/dispensa/cancela/reabre, transferência só para pessoa do setor, recusa sem alteração parcial, nenhum erro não tratado, totais iguais às listas e nenhum vazamento de tarefa no snapshot de cada perfil |
| Navegador na prévia | Competência inicial, datas sugeridas em Nova tarefa, Baixar Excel (.xlsx) e Baixar PDF (.pdf) |

## Achados

### L01 — P2 — Tarefa avulsa nasce num mês que o portal não abre

`engine.ts` (`addTask`) grava a tarefa avulsa na competência do mês corrente (`businessDate(now)`), enquanto o portal abre na competência que acabou de fechar (regra de Brasília desde 19/10). Quem cria a tarefa é levado ao mês dela, mas o **responsável** não a vê ao entrar: precisa avançar a folhinha. Antes de 19/10 o mesmo acontecia com a data fixa.

Sugestão (decisão do usuário): escolher a competência no formulário da tarefa avulsa (padrão: a competência aberta na tela) ou derivá-la do prazo legal.

### L02 — P2 — Painel de TV fica preso à competência do cadastro

O dispositivo de TV guarda uma competência fixa (`tv.ts`, `device.competence`). Uma TV cadastrada em outubro continua mostrando setembro em novembro, até alguém editar o dispositivo.

Sugestão: opção “acompanhar a competência atual” (padrão), calculada pelo relógio de Brasília a cada atualização, mantendo a escolha fixa como alternativa.

### Decisões ainda em aberto (não são defeitos)

- A02 — recuperação de meses perdidos: fluxo sugerido detectar → mostrar ao gestor → confirmar → registrar por empresa/setor.
- Permissões diferentes por setor para a mesma pessoa; periodicidade trimestral/anual; feriados e dias úteis nos prazos.

## Limites

O passeio aleatório cobre o motor de tarefas; empresas, propostas, fluxos entre setores, relatórios e TV foram cobertos pelas baterias existentes (jornadas, banco, TV) e pelos testes de regressão de 18/10, não por sequências aleatórias. Não houve teste na VPS nem pentest.
