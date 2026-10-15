# Painel de TV Ápice

Implementado localmente em 14/10/2026, com a correção explícita do usuário: **fundo branco, contrastes azuis Ápice e equipe consolidada**. Identificação textual sem logomarca; indicadores no topo, duas listas operacionais à esquerda e colaboradores à direita, conforme composição da referência SolusVision. Não integra os atendimentos do CRM nem copia seus dados ou ativos.

## Usar e configurar

**Simulação temporária:** em desenvolvimento, **Simular operação** mostra tarefas fictícias entrando, mudando e sendo concluídas automaticamente; **Usar dados reais** retorna ao feed normal. Modo identificado, sem gravação no banco, pedido pelo usuário para remoção futura. Roteiro de remoção em [simulação temporária](TV-SIMULACAO-TEMPORARIA.md).

**Painel de TV → Abrir painel** mostra uma prévia da competência escolhida com **todos os departamentos autorizados** da conta. O seletor de departamento do portal não restringe essa prévia. Não cria dispositivo ou credencial; permanece vinculada à sessão humana. Para uma conta autorizada nos três departamentos, a visão reúne Fiscal, Contábil e Pessoal. Outros tenants e departamentos fora do acesso nunca entram no conjunto.

Para uma tela independente, cadastre um dispositivo com nome, departamentos e competência. O formulário inicia com todos os departamentos permitidos. A configuração permite escolher seis blocos: progresso, prazos, pendências, colaboradores, entregas por obrigação e últimas entregas. O padrão inclui progresso/prazos/pendências/colaboradores/últimas entregas quando o criador tem `tv.team.view`. Colaboradores ocupa a direita do grupo de listas; a ordem das demais listas e dos indicadores permanece configurável. Dispositivos existentes conservam o escopo e os blocos salvos, sem expansão automática.

A permissão de equipe é separada do acesso geral à TV. Sem ela, a prévia e os novos dispositivos exibem indicadores e tarefas sem nomes de pessoas. Incluir o bloco nominal, ampliar seus departamentos ou emitir código para esse dispositivo exige `tv.team.view`. Desabilitar o bloco retira os nomes também das listas de tarefas. A exposição de nomes das **empresas** continua uma opção separada, desligada por padrão.

Use **Gerar código** no dispositivo ativo. Na TV, abra a rota genérica `#/tv` e informe o código. Não existe login de pessoa nessa tela. O código é aleatório, vale dez minutos e tem uso único; gerar outro revoga imediatamente o código e a credencial anteriores. Desativar revoga o acesso; reativar exige novo pareamento. O botão de tela cheia depende do suporte e da interação exigida pelo navegador.

| Capacidade | Acesso |
| --- | --- |
| `tv.view` | Aba, prévia e consulta dos dispositivos dentro dos departamentos autorizados. |
| `tv.manage` | Cadastrar, ativar/desativar e gerar código de vinculação. Exige `tv.view`. |
| `tv.configure` | Alterar blocos, ordem, departamentos, competência, nomes e rodízio. Exige `tv.view`. |
| `tv.team.view` | Consultar nomes/andamento individual na prévia e autorizar esse conteúdo no dispositivo. Exige `tv.view`; configuração e pareamento continuam exigindo suas capacidades próprias. |

Cargo não é teto de acesso. O administrador pode conceder as capacidades a qualquer cargo, conforme decisão do usuário. A migração inicial acrescenta essas capacidades somente às contas que já possuíam `users.manage`, preservando a autoridade administrativa existente; não infere concessões de um cargo. As demais contas dependem de concessão explícita. O servidor revalida conta ativa, permissões e departamentos no banco, inclusive quando o frontend envia um ator ou cabeçalho divergente. Edição usa versão obrigatória; alterações simultâneas não sobrescrevem silenciosamente.

## Dados e atualização

O progresso é `(concluídas + dispensadas) / total da competência`, com zero quando não há tarefas. Os cinco contadores de prazo são exclusivos e somam o total: no prazo, vence hoje, meta vencida, prazo legal vencido e encerradas. Atraso legal tem prioridade; tarefas reabertas são avaliadas pela data atual.

As tarefas exibem o nome do **responsável cadastrado** em destaque, com obrigação, empresa, departamento e prazo abaixo/ao lado. Não inferir responsável pelo cargo nem distribuir tarefas fictícias para preencher o painel. Se a conta responsável estiver indisponível no escopo, usar indicação explícita, sem resolver nomes de outro tenant. O quadro de colaboradores inclui todas as contas ativas do escopo, mesmo com zero tarefas, e mostra pendências, encerradas/total e progresso. Conta ou credencial inativa é excluída. Cada pessoa aparece uma vez, com seus departamentos autorizados. Os dados são da competência, não uma classificação de desempenho ou cálculo de tempo trabalhado.

Entregas por obrigação contabilizam encerramento. Últimas entregas incluem conclusões com data válida, ordenadas da mais recente para a mais antiga; exibem até 30 registros. Pendências priorizam atraso legal, vencimento hoje, meta vencida e demais tarefas abertas; exibem até 60 registros, com indicação de recorte quando houver mais. Totais e contagens por pessoa incluem todo o escopo. A quantidade visível de linhas é medida pela altura do bloco e pelo conteúdo, inclusive na prévia embutida, evitando sobreposição de texto em telas largas. O rodízio usa 12 segundos inicialmente, configurável entre cinco e 60 segundos; a consulta é atualizada a cada cinco segundos. Esses são padrões técnicos iniciais, não intervalos exigidos pelos PDFs.

Sem nomes de empresas, elas aparecem pelo código interno e títulos livres de avulsas ficam como **Tarefa avulsa**. Colaboradores autorizados entregam apenas nome de apresentação, iniciais, departamentos do escopo e contagens; não incluem IDs pessoais, e-mail, cargo, concessões ou credenciais. O feed não inclui CNPJ, valores de guias, snapshot humano, documentos ou auditoria. Listas desabilitadas não são transmitidas. Títulos de modelos são textos definidos pelo gestor; não inserir dados particulares nesses títulos.

Falha de conexão mantém o último feed recebido e indica **DESATUALIZADO**, sem trocar números por zero. Acesso negado/expirado retira os dados da tela/cache e interrompe a consulta automática até novo pareamento. **AO VIVO** depende de resposta recente. A prévia humana mantém as regras normais da sessão; a continuidade em falhas de rede é destinada à tela independente.

## Identidade e persistência

Configurações ficam em `portal.tv_devices`, com migrações SQL. Pareamento e credencial são guardados apenas como hashes em colunas privadas separadas do payload. A credencial aleatória de 32 bytes permanece em cookie HttpOnly, SameSite Strict, limitado a `/api/v1/tv`, com validade inicial de 30 dias. Nenhum segredo é colocado em URL, JSON de resposta, localStorage, auditoria ou documentação.

A TV só consulta o endpoint específico de feed; sua credencial não autentica APIs de pessoas ou ações de tarefas. A RLS resolve somente o hash apresentado e limita leitura/gravação ao tenant correspondente. Gestão revalida o escopo humano; tentativas de pareamento são limitadas, incluindo corpos inválidos. Configurações/auditoria e mudanças de credenciais são transacionais. A revogação vale para consultas seguintes; uma resposta já em trânsito pode conter o último estado autorizado.

Exportação portátil inclui configurações, sem códigos ou credenciais da TV; após importar, os dispositivos precisam parear novamente. Arquivos antigos v2 sem dispositivos permanecem compatíveis. Backup PostgreSQL continua disponível. O adaptador de memória não oferece identidades de dispositivos e responde indisponível para gestão/pareamento.

## Validação e limites

Testes de domínio cobrem métricas, escopos, datas, limites, anonimização e imutabilidade. `npm run test:tv` usa bases PostgreSQL temporárias e verifica autorização, concorrência, código de uso único/expiração, cookie, revogação, DTO, RLS, auditoria sem segredos, migração e limite de tentativas. Não valida o login normal por senha/e-mail/MFA.

A execução atual é local: a API aceita origens/hosts locais e exige development. Uma TV em outro computador ainda depende da implantação/autorização de rede na VPS; HTTPS, proxy, origens e remoção dos atalhos de testes continuam necessários antes da produção. O cookie foi preparado para Secure em produção, mas isso não libera nem comprova essa implantação. Não foram adicionados áudio, alertas sonoros, relatórios formais de desempenho ou dados de atendimento do CRM nesta entrega.
