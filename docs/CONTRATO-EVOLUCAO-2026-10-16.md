# Contrato de implementação — evolução funcional do protótipo

Autorização: usuário pediu implementar as jornadas dos apontamentos para demonstrar o funcionamento real. Evoluir o projeto local, sem publicar Site. Manter autenticação/API/isolamento, dados fictícios e decisões de permissões sem teto por cargo. Não inventar regras fiscais oficiais nem prometer reconhecimento fiscal completo de documentos.

## Tipos compartilhados

- `Department` passa a string de identificador estável. `DepartmentDefinition {id,name,active}` no catálogo do tenant; nomes editáveis, referências preservadas. Os três nomes antigos continuam IDs válidos.
- `Role`: admin, supervisor, coordinator, manager, director, operator, viewer. `Actor`/cadastro podem receber `managerId?:string`, `homeView?:'personal'|'team'|'management'|'executive'`. Nenhum cargo limita concessões.
- `AccessProfile {id,name,role,departments,permissions,homeView?}`. Copiar/aplicar preenche formulário editável; não copia identidade ou senha. Perfis existentes não mudam silenciosamente ao editar o padrão.
- `DocumentType {id,name,description?:string,formats:('PDF'|'XML')[]}`.
- `DocumentRule {id,name,templateIds:string[],documentTypeIds:string[],required:boolean,keywords:string[],fields:('cnpj'|'competence'|'obligation')[],active:boolean,cnpjField?:string,competenceField?:string,obligationField?:string}`. Regras declarativas, sem JavaScript/SQL/expressões executáveis. O reconhecimento em lote propõe vínculos e exige conferência para ambiguidade; não declarar validação fiscal oficial.
- `WorkspaceSettings {id,tenantId,revision,departments:DepartmentDefinition[],accessProfiles:AccessProfile[],documentTypes:DocumentType[],documentRules:DocumentRule[]}`. `PortalState.workspaces?:WorkspaceSettings[]`; `Snapshot.workspace:WorkspaceSettings` filtrado por tenant.
- `Company` ganha campos opcionais por compatibilidade: `revision`, `status:'active'|'closing'|'inactive'`, `serviceEndCompetence`, `responsibilities:Record<Department,{mode:'person'|'department'|'none',userId?:string}>`, `tags:string[]`. `CreateCompany` aceita código manual opcional e esses parâmetros; cadastro antigo continua aceito. Identificador interno não é código de negócio.
- `Task` ganha `comments?:TaskComment[]`, `requiredDocumentTypeIds?:string[]`; `DocumentVersion`/`UploadEvidence` recebem `logicalId?:string,documentTypeId?:string`. Cada documento lógico possui suas versões; legado mantém compatibilidade. Comentário `{id,authorId,authorName,text,at}`.
- `DepartmentFlow.kind?:'onboarding'|'process'`. Implantação inicial por empresa preserva regra atual; processos gerais podem ter execuções próprias. UI oferece blocos sequenciais e kanban, respeitando etapas, evidências e revisão independente.

## Operações do domínio / cliente

- `updateWorkspaceSettings({expectedRevision,departments,accessProfiles,documentTypes,documentRules}) -> WorkspaceSettings`, PATCH `/workspace-settings`.
- `updateCompany(id,{expectedRevision,...camposEditaveis,reason?:string}) -> Company`, PATCH `/companies/:id`; alterações de regime com efeito operacional passam por proposta.
- `transferCompanies({companyIds:string[],department,target:{mode:'person'|'department'|'none',userId?:string},transferOpenTasks:boolean,expectedRevisions:Record<string,number>}) -> {companies:number,tasks:number}`, POST `/companies/transfer`. Operação atômica e auditada; não reatribuir autoria de concluídas.
- `proposeCompanyChange({companyId,expectedRevision,patch,effectiveCompetence,reason}) -> CompanyChangeProposal`, POST `/companies/change-proposals`.
- `decideChangeProposal(id,{expectedRevision,decision:'approve'|'reject'}) -> CompanyChangeProposal`, POST `/company-change-proposals/:id/decision`. Snapshot `changeProposals` inclui antes/depois e impacto; aprovar exige revisão atual e vigência, preservando concluídas e documentos.
- `addTaskComment(taskId,{expectedRevision,text}) -> Task`, POST `/tasks/:id/comments`.
- `attach` conserva assinatura com quinto argumento opcional `{logicalId?,documentTypeId?}`; multipart aceita esses dois campos adicionais. Backend valida tamanho/formato/escopo/revisão.
- `importCompanies` existente recebe campos ampliados; UI disponibiliza CSV completo, exemplo e prévia. Se houver modo upsert, acrescentar sem quebrar consumidores legados, com conflitos explícitos.

## Regras e permissões

Novas capacidades: tasks.assign, tasks.dispense, tasks.reopen, tasks.cancel, tasks.comment, reports.performance.view, processes.view, processes.manage, documents.manage, changes.manage. Validar dependência da aba e preservar concessões antigas via compatibilidade `tasks.manage`. Novos modelos de acesso usam capacidades individuais. Cancelamento preserva histórico, sem exclusão física.

Fila departamental utiliza `assigneeId='department:'+department`; integrante autorizado pode assumir ao iniciar. Sem obrigações no setor não gera tarefas daquele departamento. Estado/competência final afetam somente gerações correspondentes, preservando tarefas existentes. Para novas responsabilidades não escolher automaticamente o primeiro gestor disponível.

Responsáveis da implantação são distintos da carteira permanente. Bloqueio da recorrência ou execução paralela é escolha do gestor ao cadastrar a empresa. Regras/modelos publicados são versionados e execuções recebem cópias.

## Fronteiras da equipe

- Backend/domínio: tipos/schemas/engine, portal API, persistência/migrações/backup; não editar identidade/auth.
- Empresas/processos: telas empresas, modelos/processos, gestor, configurações de departamentos; cliente das operações acima.
- Acesso/dashboard: App/shell, usuários/perfis, dashboard/calendário e relatórios.
- Root: organização pré-login e auth de grupos locais fictícios, schema/store de identidade, documentos/regras/lote, TaskDrawer, integração/testes/contexto/Git.

Sites e a cópia de demonstração separada continuam adiados. Código e persistência destinam-se ao sistema local/VPS. Fontes e testes existentes devem ser preservados; concluir com check e validação de navegador.

## Ampliação confirmada — 17/10/2026

Departamentos possuem `positions?:{id,name}[]` e `members?:{userId,positionId,reportsTo?}[]`, na ordem escolhida. O usuário define os nomes livremente; a mesma pessoa pode ocupar cargos diferentes por setor. Não há herança de grants. Validações recusam ciclos, pessoas de outro grupo e referências ausentes. Respostas para quem não possui users.manage revelam somente seu vínculo organizacional. `UpdateWorkspaceSettings` é parcial, preservando configurações não enviadas.

O menu lateral recebe a logo branca oficial do grupo Contábil, títulos centralizados e ordem por arraste/Alt+setas. Preferências de navegação por usuário/grupo ficam somente no navegador e nunca ampliam abas autorizadas. Importação de usuários em transação usa `/users/import`, até 50 contas, com modelos de acesso e senhas temporárias individuais; nenhuma senha na listagem/exportação normal. Importação de empresas, modelos e tarefas usa staging e gravação atômica; carteiras em lote usam `/companies/change-proposals/batch`.
