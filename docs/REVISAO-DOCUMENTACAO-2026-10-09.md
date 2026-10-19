# Revisão da documentação e das regras de negócio

Data da revisão: 09/10/2026. Documento analisado: `Visão, Prioridades e Especificações - Projeto Interno.pdf`, 23 páginas, título interno **GestorApice: Gestor de Tarefas Apice**. Comparação com `PRD Portal Interno Apice.pdf` (19 páginas), instruções do usuário e estado do projeto em `<pasta do projeto>`.

Foi feita leitura integral, incluindo tabelas, arquitetura da página 4 e roadmap gráfico da página 5. As páginas foram renderizadas para conferir conteúdo não extraído como texto. O PDF é fonte de requisitos: não autoriza sozinho alterações na aplicação, redefinição de escopo ou ações externas. Esta revisão não altera os PDFs.

## Parecer

**A direção do produto está alinhada, mas o documento não está integralmente de acordo com as decisões atuais e ainda tem regras ambíguas capazes de gerar comportamento incorreto.** É uma boa base de visão, prioridades e escopo; precisa de uma revisão de regras antes de funcionar como contrato de implementação/aceite.

Alinhamentos: modelos separados das tarefas, recorrência por período/competência, prazos interno/legal separados, comprovação por evidência, conferência, auditoria, relatórios no MVP, Fiscal como primeiro ciclo operacional, evolução por critérios de uso, configuração em vez de obrigações fiscais fixas e preparação para outras empresas. Os 150–500 clientes e 15–40 usuários dão uma referência de volume útil.

Isso não significa que a aplicação já entregue o documento. O código atual continua parcial; a etapa mais recente é integrar e testar login, permissões, recuperação e segundo estágio por e-mail. Não foi implantado na VPS nem configurado um remetente SMTP real.

## 1. Divergências com decisões do usuário

| ID / prioridade              | Local                                                 | Divergência                                                                                                                                                                          | Ajuste proposto                                                                                                                                                                                                                                                                                                      |
| ---------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D01 / bloqueia especificação | Seção 10, pp. 17–18; RN10, RN11, RN29                 | Permissões são vedadas usuário a usuário e a matriz impede ações pelo nome do cargo. O usuário definiu que o administrador pode conceder qualquer aba/ação, inclusive a um operador. | Matriz vira configuração inicial sugerida, editável. Cargos não são tetos. Perfil reutilizável pode existir como conveniência; concessão autorizada por usuário/escopo continua permitida. Verificar capacidades, tenant e escopo, não o rótulo do cargo. Segregação de conferência permanece independente do cargo. |
| D02 / bloqueia autenticação  | RN27, p. 12; exclusão de e-mail do escopo, pp. 1 e 10 | Descreve somente e-mail/senha, sem recuperar senha, reset administrativo ou código por e-mail obrigatório para todos. E-mail aparece como integração futura.                         | Separar e-mail transacional de autenticação, necessário na base, de integrações operacionais futuras. Documentar e-mail vinculado/confirmado, senha temporária, recuperação, segundo estágio, expiração, tentativas, revogação e remetente/provedor.                                                                 |
| D03 / bloqueia padrão visual | Pp. 14 e 20; entidade Empresa, p. 20                  | Pede amarelo/vermelho/verde e logotipo no PDF, enquanto o usuário restringiu a paleta e proibiu logomarca.                                                                           | Manter identificação textual e paleta `#16AFC4`, `#0E7F87`, `#15202B`, `#F2F5F6`, branco e derivações. Diferenciar estados por texto/ícone e contraste. Não introduzir logomarca ou novas cores automaticamente.                                                                                                     |
| D04 / nomenclatura a fechar  | Seção 10 e RN28                                       | Usa Coordenador/Diretoria/Consulta; instruções recentes usam Administrador/Supervisor/Operador.                                                                                      | Definir nomes canônicos e se supervisor/coordenador são equivalentes. Não deduzir grants dessa equivalência. Diretoria como departamento e como cargo são conceitos separados.                                                                                                                                       |

O login por e-mail da RN27 também difere do bootstrap de usuário solicitado e da entrada atual por nome de usuário. O e-mail vinculado não implica automaticamente que ele é o único identificador de login. A redação pode prever usuário/e-mail conforme a política escolhida, com exceção temporária do bootstrap, sem manter contas compartilhadas para operação.

## 2. Erros e ambiguidades nas regras

### R01 — Sem movimento não significa dispensa automática

**Local:** glossário de Dispensa, p. 3; Condição/variáveis, pp. 3 e 15.

O exemplo de cliente sem movimento pode induzir o configurador a dispensar uma obrigação fiscal apenas por não haver receita. Isso não vale para todas as obrigações. Para PGDAS-D, a Receita informa que a apuração deve ser transmitida mesmo sem receita, com receita zero. [Fonte oficial: Simples Nacional — Cálculo e Declaração](https://www8.receita.fazenda.gov.br/simplesnacional/servicos/grupo.aspx?grp=5).

**Correção:** dispensa significa não aplicabilidade comprovada para aquela obrigação/período, conforme regra validada pelo Fiscal; sem movimento é variável que pode selecionar uma entrega zerada, reduzir etapas ou justificar dispensa somente quando a obrigação permitir. O sistema não deve inferir isenção fiscal da simples ausência de movimento.

### R02 — A identidade da recorrência está incompleta

**Local:** RN01 e RN23–RN25, pp. 10–13; entidades, pp. 20–21.

Modelo + cliente + período não explicita o isolamento da empresa organizacional e a identidade do período. Competência não substitui necessariamente início/fim/exercício. Vínculos simultâneos por cliente, regime e agrupador podem encontrar o mesmo modelo várias vezes. Não está definido qual vínculo prevalece quando suas configurações divergem.

**Correção:** chave de negócio inclui empresa/tenant organizacional, alvo fiscal, modelo e período canônico. Gerar a união dos vínculos aplicáveis sem duplicar a ocorrência; definir inclusão/exclusão e precedência de overrides. Não incluir a versão do fluxo na chave de modo que uma edição crie outra tarefa para o mesmo período. Unicidade também precisa estar no banco.

### R03 — Vigência, geração antecipada e histórico precisam de fronteira explícita

**Local:** RN02–RN04/RN30, pp. 10 e 12.

Uma tarefa de dezembro pode ter sido gerada manualmente em outubro. Ao mudar o regime com vigência em novembro, ela é uma tarefa futura por competência, mas já existe e contém histórico/snapshot. O termo futuro não define se ela será recalculada, preservada ou substituída. A regra de versão preservada também não esclarece alterações de modelo, anexos ou prazos fora do fluxo.

**Correção sugerida:** versões/regimes/vínculos são resolvidos pela vigência do período, não pela data em que o job roda. Tarefas já geradas não são reescritas silenciosamente. Uma correção de aplicabilidade precisa de operação explícita, autorizada e auditada. Congelar versão do modelo/fluxo, exigências de anexo e cálculo de prazo usados na geração. Definir o que ocorre em períodos trimestrais/anuais que atravessam mudança de regime.

### R04 — Entrada e saída não têm semântica suficiente

**Local:** RN03/RN05, p. 10; Cliente, p. 21.

RN05 menciona uma data de saída, mas não diz se a geração cessa quando a data é cadastrada ou quando ela passa a valer. Tampouco há regra equivalente para entrada, reativação e recuperação de competências antigas. Uma saída programada para dezembro não pode parar outubro apenas porque foi informada hoje. Saída do escritório, baixa jurídica e inatividade fiscal não são o mesmo evento.

**Correção:** usar vigência de atendimento e período coberto, com uma convenção explícita para primeiro/último período, inclusive atendimento parcial e tarefas finais. Preservar pendências históricas; definir reativação e geração retroativa autorizada. Não interpretar cliente inativo no cadastro como inexistência de obrigações fiscais.

### R05 — Meta interna pode acabar posterior ao legal

**Local:** RN06/RN07, pp. 10–11; padrões, p. 14.

O modelo admite meta por dia fixo, sem declarar a validação entre as duas datas depois dos ajustes de calendário. Exemplo: legal em 05/11, meta fixa em 10/11, conclusão em 08/11. Ela satisfaz a meta, mas já ultrapassou o legal.

**Correção:** calcular/ajustar prazo legal primeiro; derivar ou validar a meta depois. Meta não pode ser posterior ao legal. Definir se igualdade é aceita e se X dias úteis pode ser zero. Calendário deve tratar mês curto/ano bissexto, dia inexistente e fusos/corte de dia. No projeto atual há validação simplificada da ordem dos dias, mas não o calendário completo.

### R06 — Calendário do escritório não basta para todo cliente

**Local:** RN07, p. 11; Feriado, p. 22.

Feriados são cadastrados por empresa organizacional, com DF padrão, enquanto clientes podem estar em outras UFs/municípios. O documento não identifica a jurisdição aplicável à obrigação nem resolve prorrogações excepcionais de um órgão. Não é correto presumir que um mesmo calendário do escritório serve a todos os clientes.

**Correção:** modelo seleciona calendário/regra da obrigação e resolve jurisdição do órgão/cliente quando pertinente. Padrão do tenant é conveniência de configuração. Prever exceções por obrigação/período, quem as aprova e trilha do cálculo. A equipe Fiscal deve validar regras; a implementação genérica não inventa prazos legais.

### R07 — Critérios simultâneos de situação de prazo não têm precedência

**Local:** tabela de situação, p. 14.

No dia do prazo legal, a meta interna já pode estar vencida: ambas as regras se aplicam. Dispensa não possui situação definida; espera poderia ser interpretada indevidamente como suspensão do prazo. Concluídas precisam usar data de conclusão, não envelhecer pelo relógio de hoje.

**Correção:** definir ordem de classificação e indicadores independentes. Exemplo sugerido: dispensada = não aplicável; concluída usa conclusão versus meta/legal; aberta usa atraso legal, vencimento hoje e meta vencida, com prioridade definida para exibição. Aguardar cliente pausa o tempo ativo, mas não altera automaticamente o prazo legal ou a meta. Se vencimento hoje for um indicador transversal, ele deve permitir sinalizar meta já vencida em paralelo.

### R08 — Não existe máquina de transições e política de operações em lote

**Local:** status, pp. 13–14; ações em lote, pp. 8 e 14.

A tabela informa quem altera, mas não as transições permitidas, pré-condições, reversões e estado após erro. Não diz se um lote tem rollback integral ou aceita sucessos parciais. O trecho que excepciona concluir sem anexo não cobre autorização, conferência, revisão ou evidências rejeitadas.

**Correção:** definir matriz de transições com estado de origem/destino, grant, responsável, revisão e motivo. Lotes executam as mesmas regras de uma operação individual. Escolher atomicidade e retorno por item; retries não devem gerar efeitos duplicados. Concorrência não pode permitir concluir uma revisão que mudou durante validação/upload.

### R09 — Conferência baseada apenas na etapa anterior é frágil

**Local:** RN13, p. 11; fluxos, p. 15.

Pessoa A pode executar quase todo o trabalho, B executar a última etapa e A aprovar. A RN13 literal permite isso, embora A esteja revisando parte da própria execução. Também falta indicar conferente autorizado, vínculo com a tarefa e comportamento quando não há outro elegível.

**Correção sugerida:** conferente não participou da execução do ciclo revisado, inclusive após redistribuição. Definir retorno à execução, quais etapas/documentos precisam ser refeitos e início de novo ciclo. Supervisor/operador com grant de conferência continua sujeito à segregação. Não bloquear a obrigação silenciosamente quando não houver conferente; escalar de forma visível.

### R10 — Reabertura pode apagar a referência que os relatórios precisam

**Local:** RN11/RN12, p. 11; fórmula de retrabalho, p. 19.

Não fica definido como preservar a primeira conclusão e a conclusão de cada ciclo, reiniciar o cronômetro sem somar esperas e atribuir tempo após troca de responsável. Uma única coluna conclusão não descreve todos os ciclos de uma tarefa reaberta.

**Correção:** manter registros de conclusão por ciclo e primeira conclusão; o novo ciclo possui status/tempos próprios. Distinguir devolução, reabertura e revisão documental. Indicadores informam se usam primeira entrega, conclusão corrente ou todas as entregas, evitando alterar retrospectivamente números sem explicação.

### R11 — Dispensa de tarefa e dispensa de anexo precisam ser separadas

**Local:** RN09/RN10/RN14, p. 11; entidades, p. 21.

Um anexo obrigatório dispensado não fica completo e aceito pela validação, mas uma dispensa válida deveria permitir o fluxo aplicável continuar. Não existe entidade/campo claro para pedido, decisão, motivo, aprovador e abrangência dessa dispensa. Sem essa exceção, RN09 pode impedir para sempre uma tarefa regularmente dispensada em parte.

**Correção:** cada exigência fica satisfeita por evidência aceita ou dispensa aprovada e auditada para aquele ciclo; uma dispensa de tarefa é outra decisão. Pedido não equivale a aprovação. Regras de aplicabilidade não substituem aprovação quando a política do modelo a exigir.

### R12 — Nome obrigatório do arquivo colide e altera o tipo

**Local:** padrão `CODCLIENTE_SIGLA_MMAAAA.pdf`, p. 14; RN14–RN16.

Força extensão PDF apesar de XML aceito. Guia e recibo da mesma tarefa, versões e avulsas repetidas no mês podem ter nomes iguais. Também não fica claro se validar nome original vem antes ou depois da renomeação pelo sistema.

**Correção:** preservar nome original e tipo real; gerar nome de exibição com tipo de exigência/identidade/versão/período, mantendo a extensão real. Armazenamento usa chave única independente do nome. Nome correto não comprova CNPJ/competência no conteúdo. Não converter XML apenas trocando extensão.

### R13 — Validação fiscal está insuficientemente especificada

**Local:** RN14/RN15, p. 11; validação inteligente, p. 8; referência de anexos, pp. 3 e 9.

Nome ou conteúdo permite aceitar um arquivo cujo nome diz o CNPJ esperado e o conteúdo outro. Há PDF digital, PDF escaneado, ausência de metadados, diferentes exigências e múltiplos anexos obrigatórios. Não há resultado inconclusivo, política de revisão manual ou pré-condição para publicar.

**Correção:** definir regras por exigência: tipo/tamanho, metadados exigidos, prioridade da fonte, divergência, aceito/rejeitado/inconclusivo e decisão manual autorizada. No MVP, usar validação estrutural e limites básicos sem chamá-los de validação fiscal. Planejar múltiplas exigências/versionamento individual na estrutura desde F1, mesmo que a inspeção fiscal só chegue na F2B.

### R14 — Ausência de responsável não é resolvida apenas mandando ao coordenador

**Local:** RN17–RN19, p. 11; carteira na F2B, p. 9.

Coordenador pode estar desativado, ausente, sem grant de execução ou haver mais de um. O próprio coordenador pode ser a pessoa desativada. Carteira é necessária para geração na F2A, mas o item que a nomeia foi agrupado na F2B.

**Correção:** responsável por cliente/departamento e fallback básico entram na base/F2A; redistribuição avançada pode ficar F2B. Destino deve ser ativo e elegível no escopo. Definir escalonamento para outro responsável/gestor e fila explícita, sem loops ou atribuição a quem não pode executar. Desativação revoga acesso imediatamente, independentemente de redistribuição; as tarefas precisam continuar visíveis ao gestor.

### R15 — Geração automática sem regra de recuperação e idempotência de comandos

**Local:** RN02/RN25/RN26, pp. 10–12.

Não diz o que ocorre se a VPS ficar desligada no dia 1, se o agendamento for reexecutado ou se geração manual e automática concorrerem. Eventual não possuir unicidade por competência é correto, mas não deve permitir que retry técnico de uma mesma requisição crie duas demandas sem intenção.

**Correção:** job registra execução/resultado e recupera períodos não processados, sob a mesma unicidade SQL. Uma demanda eventual repetida intencionalmente tem novo identificador; retries do mesmo comando usam idempotência técnica. Definir agenda/fuso, janela de retroatividade, início de vínculos e tratamento de lotes falhos.

### R16 — Novo cliente exige um cliente que ainda não foi criado

**Local:** processo Novos clientes, p. 16; cadastro/backlog, p. 7; RN26.

O processo começa no Financeiro e só depois Cadastro cria o cliente, enquanto toda tarefa nasce para um cliente existente. Falta o objeto inicial para o fluxo poder ser aberto.

**Correção:** criar previamente um cadastro provisório/demanda de onboarding com identificador estável, depois completar/ativar o cliente, sem duplicar histórico; ou inverter formalmente os passos. A recorrência só começa segundo a data/vigência de ativação, não antes de documentos e responsáveis exigidos.

### R17 — Último bloco obrigatório não garante que todos terminaram

**Local:** RN29–RN31, pp. 12–13; processos, pp. 15–17.

Se existir ramificação ou paralelismo, o último bloco na ordem pode acabar enquanto outro obrigatório segue pendente. RN09 fala todas as etapas, enquanto RN31 pode ser lida como apenas a última. A lista de blocos não inclui Fim, embora RN29 o exija.

**Correção:** conclusão exige todos os blocos obrigatórios aplicáveis e a chegada a um fim válido, sem pendências impeditivas. Definir grafo executável, início/fim, ramos, condição sem saída, ciclos, juntadas, etapas opcionais e o que acontece com blocos não aplicáveis. Se F2B suportar somente sequência linear, declarar essa restrição. Fim deve ter definição explícita mesmo como nó técnico.

### R18 — Departamento ainda inativo conflita com acesso e atribuição por área

**Local:** Financeiro/atribuição manual, pp. 7 e 15; RN28/RN31.

Uma etapa pode ser atribuída a pessoa de departamento que ainda não foi ativado. Não está claro como a pessoa terá acesso e onde a etapa aparecerá se o departamento está desabilitado. Desativar o departamento de um processo já iniciado também não tem regra.

**Correção:** distinguir departamento sem recorrência/modelos habilitados de departamento inexistente/inativo para acesso. Pessoas e blocos devem ter cadastro/escopo válido. Desativação não pode ocultar pendências; declarar escalonamento e fechamento do processo em andamento.

### R19 — Indicadores não têm universo e data de corte explícitos

**Local:** fórmulas, p. 19.

Competência, mês da execução/conclusão e período de referência são dimensões diferentes. Não está declarado qual população compõe cada fórmula, como avulsas, dispensa, reabertura e geração tardia participam, ou o que exibir com denominador zero.

**Correção:** declarar filtros, elegibilidade e data/hora de corte para cada indicador; numerador e denominador usam a mesma população. Um drill-down tem que carregar esses filtros e a mesma referência. Denominador zero deve resultar em sem base, não um sucesso de 100%.

### R20 — Taxa de retrabalho pode passar de 100% ou variar com o estado corrente

**Local:** p. 19.

Devolvidas ou reabertas dividido por concluídas não define se conta tarefas distintas ou eventos. Uma tarefa concluída e devolvida/reaberta três vezes pode resultar em 300% se o numerador soma eventos. Ao reabrir, ela deixa de estar atualmente concluída, alterando o denominador que originou o retrabalho.

**Correção sugerida:** taxa de incidência = tarefas distintas com retrabalho no conjunto definido ÷ tarefas distintas elegíveis desse mesmo conjunto; manter eventos/ciclos como outra métrica. Definir coorte por primeira entrega ou período de eventos, e não misturar um numerador histórico com estados correntes.

### R21 — Tempo médio mistura trabalho aberto com tarefas concluídas

**Local:** p. 19; RN11/RN31.

Tempo das etapas ÷ concluídas permite somar horas de tarefas ainda abertas. Dez concluídas com 100 horas e abertas com mais 100 horas resultariam em 20h, quando a média das concluídas é 10h. Espera, tempo ativo, tempo corrido, etapas paralelas e trabalho por vários colaboradores também são diferentes.

**Correção:** tempo ativo das tarefas/ciclos concluídos elegíveis ÷ quantidade desses mesmos concluídos. Separar esforço somado de tempo decorrido. Usar intervalos de trabalho início/pausa/retomada/fim e autoria; não contar Aguardando cliente. Tempo da conferência deve ter política própria.

### R22 — Índice de atraso legal pode ser diluído por tarefas dispensadas

**Local:** p. 19.

O denominador tarefas com prazo vencido pode incluir dispensadas, enquanto o numerador não inclui essas tarefas. Dez tarefas aplicáveis atrasadas mais 90 dispensadas pareceriam 10% em vez de 100% de atraso nas aplicáveis. Também é preciso distinguir uma task entregue em atraso de uma entregue antes do legal cujo vencimento já passou.

**Correção:** população explícita de tarefas aplicáveis cujo prazo legal chegou ao corte, excluindo dispensas válidas; numerador = abertas vencidas + concluídas após o legal nesse mesmo conjunto. Definir comparação estrita/inclusiva no dia do vencimento. Não mudar datas de conclusão para recompor indicadores.

### R23 — Cliente/empresa mudou de significado em relação ao PRD original

**Local:** visão multiempresa, p. 1; modelo, pp. 20–21; PRD original, hierarquia e modelo de dados.

No novo documento Empresa é uma organização Ápice, enquanto Cliente carrega um CNPJ/CPF. O PRD original prevê Client relacionado a uma ou várias empresas/CNPJs, além do tenant. A simplificação elimina essa relação sem dizer se foi deliberada. Uma etiqueta empresa_id em todas as tabelas, sozinha, não garante que FKs e consultas permaneçam isoladas.

**Correção:** nomear Organização/Tenant, Cliente/Grupo e Empresa atendida/Estabelecimento de forma inequívoca. Definir se um cliente agrega múltiplos CNPJs, onde nasce a obrigação e qual escopo uma pessoa pode atravessar. Preservar isolamento também em FKs, unicidade, storage, jobs e exports. A mesma pessoa pode precisar de memberships em várias organizações; não presumir contas/senhas duplicadas para cada uma.

### R24 — Arquivo nunca apagado e log imutável precisam de política operacional

**Local:** RN16/RN20/RN22, pp. 11–12; riscos, pp. 22–23.

Nunca apagar arquivo pode ser entendido como retenção infinita, sem política para arquivo malicioso, erro, backup ou descarte. Ninguém altera audit na aplicação não impede um owner do banco de alterá-lo. TV sem login de pessoa não significa acesso público sem credencial de dispositivo.

**Correção:** versões/evidências não são apagadas por edição operacional comum; retenção, quarentena e descarte autorizado/auditado precisam de política. Declarar o nível de proteção do log, inclusive frente a administração de banco. TV tem identidade própria, pareamento, revogação, expiração/rotação e escopo agregado mínimo; a exceção de RN27 à conta pessoal não é uma exceção à autenticação do dispositivo.

## 3. Escopo e fase: pré-requisitos fora do lugar

### R25 — Prazo legal obrigatório não serve a todas as tarefas genéricas

**Local:** RN06, p. 10; atividades internas/Diretoria, p. 9; processos, pp. 16–17.

Atividade interna pode ter apenas compromisso operacional, sem um vencimento legal. Obrigar o preenchimento desse campo cria prazo legal fictício e contamina indicadores de risco.

**Correção:** meta/prazo operacional obrigatório e prazo legal quando existir; classificação/relatórios distinguem ausência de prazo legal de ausência de prazo. Nos modelos fiscais com vencimento legal, a regra permanece obrigatória.

### R26 — Anual configurável pode receber a competência errada

**Local:** RN24/RN25 e tabela de periodicidade, pp. 12–13.

O período anual permite exercício configurado, mas a competência aparece sempre como 12/AAAA. Um exercício encerrado em junho não deveria receber dezembro sem decisão explícita. A regra geral de geração após o período e o padrão anual antes do prazo também precisam de precedência.

**Correção:** representar início/fim e identificador do exercício; competência segue a convenção configurada para aquele modelo. Momento da geração tem opção explícita, com padrão por periodicidade e regra anual documentada; não são dois gatilhos que criam ocorrências diferentes.

| Ponto                                                            | Local                                     | Ajuste                                                                                                                                                                                                      |
| ---------------------------------------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Carteira básica só nomeada na F2B                                | Pp. 7–9/RN17                              | Responsáveis por departamento e roteamento são pré-requisitos da F2A; lote/gestão avançada pode ser F2B.                                                                                                    |
| Espera/pausa somente F2B                                         | P. 15, contra status p. 14 e tempo da F2A | MVP precisa suportar pausa simples se a métrica exclui Aguardando cliente. Construtor visual pode vir depois.                                                                                               |
| Relatórios manipuláveis desde a visão, salvar/constructor na F2B | Pp. 1/9/18–20                             | Definir MVP: filtros/ordenação/exportação básica; colunas/agrupamentos/salvos F2B. Filtros salvos são citados também como tela-base sem fase clara.                                                         |
| Campos de Portal desde escopo/base, item apenas na F3            | Pp. 1/9/21–22                             | Reservar estados/campos no modelo inicial, com publicação efetiva futura. Não apresentar publicação como entregue quando só existe campo.                                                                   |
| Financeiro e faturamento condicionam conclusão de processos      | Pp. 16–17, integrações futuras            | Definir registro manual de execução/confirmacão externa nesta fase ou integração posterior. Critério faturado não implica emitir cobrança pelo portal sem contrato de integração.                           |
| Multiempresa somente configuração na F7/F8                       | Pp. 1/7/23                                | Tratar como objetivo de arquitetura, não garantia de zero código novo. Particularidades de Condomínios/GO ainda não foram levantadas.                                                                       |
| F1/F2A com critérios amplos, F5/F7/F8 abertos                    | Pp. 6–7/23                                | Acrescentar checklist de aceite, responsáveis pela aprovação, cenários de erro, volume/latência e evidências. Um fechamento completo sozinho não prova segurança, recuperação ou todos os casos de negócio. |

O roadmap descreve oito fases principais, com a F2 dividida em F2A/F2B. Isso não é um erro de contagem: são nove etapas mostradas, oito fases macro. A organização em seis módulos também é coerente quando Fluxos e Processos é tratado como um módulo.

## 4. Segurança, VPS e requisitos retirados/omitidos

O PRD original tinha critérios CA01–CA15 e requisitos não funcionais explícitos: isolamento, APIs/eventos, publicação condicionada, observabilidade, backups/restauração, segredos/certificados, retenção e disponibilidade. O novo PDF é mais enxuto e não substitui essas garantias por uma definição equivalente.

Sugestão: anexar matriz de aceite e uma seção técnica de operação na VPS, com frontend estático/proxy/API, PostgreSQL privado, migrações, persistência de anexos, TLS, firewall, segredos, jobs, filas, limites, observabilidade, backups e teste de recuperação. Fixar metas verificáveis para RN21 e volume acumulado: 4.000 tarefas/mês vira 48.000/ano só no Fiscal, antes de audit/versões/outros departamentos. Paginação deve ocorrer no backend/banco.

Para autenticação, incluir regras próprias: e-mail único no escopo definido, confirmação da caixa, senha temporária e reset administrativo, link de recuperação com uso único/expiração, código de acesso obrigatório para todos, limitação de tentativas/reenvio, revogação ao mudar senha/e-mail/desativar e procedimento quando o remetente estiver indisponível. Recuperação não concede sessão nem elimina o segundo estágio. E-mail de códigos e recuperação tem o mesmo canal: controle da caixa é um requisito de segurança; não caracterizar a solução como proteção independente contra comprometimento desse e-mail.

Documento precisa de versão, data, autor/aprovador e histórico de alterações. Adotar outro nome de produto ou omitir requisitos anteriores não equivale a uma decisão explícita do usuário de descartá-los.

## 5. Confronto com a implementação atual

O projeto é modular e já possui domínio/API/interface, PostgreSQL local, transações, RLS por tenant, revisão de tarefa, anexos versionados, geração mensal manual, audit, relatórios simples e permissões persistidas. A segunda etapa de autenticação por e-mail e recuperação estão em integração, com SMTP real pendente; não declarar o estado anterior como validação completa dessas mudanças.

Não atende ainda ao documento integralmente: departamentos/regimes/periodicidade têm opções fixas e geração usa datas simples; faltam calendário oficial, regimes por vigência, agrupadores/vínculos, carteira por departamento, geração automática, tempo ativo, modelos/fluxos inteiramente configuráveis, ações em lote completas, Excel/PDF nativos, constructor de relatórios, processos, TV e publicação. Um teste local de 4.000 tarefas não comprova desempenho no volume anual acumulado nem a VPS.

Também não atende RN19 integralmente: conta desativada perde acesso, mas tarefas existentes precisam de redistribuição autorizada; não há ainda a fila/fallback governado do documento. Não confundir a restrição de grants implementada com gestão completa de perfis por departamento.

## 6. Redações sugeridas para fechar primeiro

- **Acesso:** permissões de abas e ações são configuráveis e persistidas, atribuídas por administrador em escopo definido. Perfis são reutilizáveis, mas não impõem teto por cargo; concessões explícitas a qualquer cargo são permitidas. Tenant, departamento/carteira e segregação de conferência são verificados no servidor.
- **Recorrência:** geração usa empresa organizacional, alvo fiscal, modelo e período canônico, com unicidade SQL. Vigência é resolvida pelo período. Vínculos sobrepostos não duplicam ocorrência. Geração manual/automática e retries respeitam a mesma regra.
- **Histórico:** tarefa guarda as versões e regras que originaram sua ocorrência. Alteração posterior não reescreve histórico; ajuste de tarefa gerada é operação autorizada e auditada.
- **Prazos:** prazo legal deriva de regra/calendário aplicável à obrigação; meta é calculada depois e nunca posterior ao legal. Espera não suspende automaticamente vencimentos.
- **Conclusão:** todos os blocos/exigências obrigatórios aplicáveis devem estar satisfeitos por execução/evidência aceita ou dispensa aprovada. Conferência exigida deve ser feita por pessoa elegível que não participou da execução do ciclo.
- **Indicadores:** cada fórmula declara população, data de corte, critérios de dispensa/reabertura e tratamento de ausência de base. Eventos de retrabalho são distintos de taxa de tarefas com retrabalho. Tempo médio usa somente as horas das mesmas tarefas/ciclos que compõem o denominador.
- **Conta e e-mail:** todos os usuários têm e-mail confirmado e segundo estágio de acesso por código. Recuperação por link e reset administrativo invalidam sessões anteriores; após reset, a confirmação por código continua obrigatória.

Sequência indicada: ajustar divergências com o usuário → formalizar essas regras e os aceites → concluir/validar a fundação e autenticação → cadastros e calendário → geração/execução e relatórios do Fiscal. O PDF original permanece preservado; não foram aplicadas automaticamente suas regras divergentes.
