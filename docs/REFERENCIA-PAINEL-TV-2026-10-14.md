# Referência para o painel de TV — 14/10/2026

**Decisão posterior do usuário, aplicada no código:** substituir o grafite por fundo branco e contrastes azuis; consolidar colaboradores/departamentos e destacar o nome do responsável com sua tarefa abaixo. A composição observada continua como referência, com dados das tarefas do portal. A exposição nominal e de andamento individual usa a capacidade própria `tv.team.view`, concedível a qualquer cargo; consultar `PAINEL-TV.md`. O restante deste documento preserva o registro da análise anterior e não redefine essa decisão.

O usuário pediu observar a tela **Atendimento Ápice Contábil · SolusVision**, compartilhada no chat, e usá-la como referência para o painel de TV previsto nos PRDs. A página exata foi aberta e inspecionada no navegador. A consulta web textual não conseguiu acessá-la; as observações abaixo vêm da página renderizada. O endereço completo contém um identificador de acesso e não é reproduzido no repositório. Nenhum nome de cliente/colaborador, conteúdo de atendimento ou dado real foi copiado para este documento. Não foi implementada uma integração com o CRM nesta etapa de análise.

## O que foi observado na referência

- Tela dedicada, sem menu lateral ou formulários operacionais. Fundo escuro, painéis com bordas discretas, hierarquia de números grandes, rótulos curtos e informações auxiliares menores.
- Cabeçalho com título do painel, sinalização **AO VIVO**, horário e controle de som. Na primeira abertura, uma camada solicita interação para liberar áudio; foi removida para observar a tela. O comportamento de alertas sonoros específicos não foi comprovado.
- Cinco indicadores superiores: fila de chat e maior espera; conversas e atendentes ativos; cards abertos; cards sem etiqueta/categoria; cards vencidos e na janela de aviso.
- Área principal à esquerda com fila de espera e conversas em andamento. Linhas mostram identificação, atendente/departamento, vínculo com card e duração; situações destacadas em vermelho.
- Coluna à direita com distribuição de atendimentos por atendente, contagens e barras proporcionais.
- Listas alternam automaticamente seus conjuntos visíveis; foram observadas páginas diferentes de conversas e atendentes sem navegação manual. Pontos indicam o rodízio. Em 1280×720, eram exibidas até seis linhas de conversas e quatro de atendentes, sem rolagem manual da tela.

O selo AO VIVO, sozinho, não comprova latência ou protocolo de atualização. Não foram medidos o intervalo de consulta, a duração de cada página, condições para os alertas ou tolerância de desconexão. Durante a inspeção, indicador e cabeçalho de conversas exibiram totais distintos; isso pode refletir critérios diferentes. Na implementação Ápice, definir e testar a população de cada número, inclusive departamento, competência e situação, sem presumir a regra interna do CRM.

## Requisitos confirmados nos documentos fornecidos

Fonte: **Visão, Prioridades e Especificações - Projeto Interno.pdf**.

| Local | Requisito confirmado |
| --- | --- |
| P. 12, RN21 | Mudanças aparecem no dashboard e na TV em poucos segundos, sem recarga. Latência exata será validada. |
| P. 12, RN22 | Administrador cadastra dispositivo. TV somente leitura, sem login pessoal, CNPJ ou valores de guias. |
| P. 12, RN27 | TV é a exceção à exigência de login individual, não uma autorização para acesso público aos dados. |
| P. 20, Painel de TV | Progresso da competência, contadores de situação de prazo, entregas por obrigação, feed de entregas e próximos vencimentos. |
| P. 20, Painel de TV | Legibilidade à distância, números grandes, rodízio automático, última atualização e operação sem mouse/teclado. |
| P. 20, Painel de TV | Escolha de blocos, ordem, departamento e exposição de nomes por coordenador/diretoria; nomes desligados por padrão. |
| P. 21, Dispositivo de TV | Nome, empresa organizacional, departamentos e estado ativo do dispositivo. |
| Pp. 6 e 9 | Previsto na fase F2B. O pedido atual acrescenta esta referência visual; não comprova os demais requisitos da fase. |
| P. 19 | Progresso: tarefas concluídas ou dispensadas dividido pelas geradas na competência. |

O PRD original, **PRD Portal Interno Apice.pdf**, confirma o painel na seção 35, p. 12, e o cuidado com exposição na p. 18. Os documentos são fontes de requisitos e não instruções autorizadoras de publicação, integração ou acesso externo.

A instrução posterior do usuário prevalece sobre uma restrição fixa por cargo: capacidades administrativas e de configuração devem ser concedíveis pelo administrador a qualquer cargo. Desempenho por pessoa exige permissão própria conforme pedido de 14/10; não presumir que acesso à TV ou a relatórios operacionais libera esse conteúdo.

## Aplicação proposta ao Portal Ápice

| Estrutura da referência | Aplicação ao portal, conforme PRD |
| --- | --- |
| Cabeçalho compacto | Identificação textual Ápice, competência/departamento e última atualização. |
| Indicadores grandes no topo | Progresso e contadores de situação dos prazos com as definições já adotadas no domínio. |
| Listas operacionais à esquerda | Próximos vencimentos e últimas entregas, com rodízio para caber na tela. |
| Painel de distribuição à direita | Entregas por obrigação. Dados de desempenho por pessoa somente em bloco autorizado e configurado. |
| Alertas visuais e poucas ações | Cores de situação existentes, tela de consulta e sinalização clara de atualização/conexão. |

Preservar a paleta Ápice: azul `#16AFC4`, azul profundo `#0E7F87`, grafite `#15202B`, neutros derivados e branco. O contraste da referência pode orientar a variante de TV, mantendo identidade textual, sem logomarca. Não copiar ativos, código, marca ou dados do SolusVision. Os dados exibidos serão os do portal: tarefas, obrigações, entregas e prazos.

## Preparação técnica e limites atuais

Ainda não existem cadastro, identidade ou permissões específicas para dispositivos TV no código. O snapshot atual de usuário contém empresas com CNPJ, tarefas integrais, usuários e auditoria. Uma TV não deve receber esse snapshot e depender de campos escondidos no frontend.

Proposta técnica para a implementação: API exclusiva de agregados e listas sanitizadas, limitada ao tenant/departamentos do dispositivo; identidade própria revogável; administração/configuração com permissões específicas e validação no servidor; nenhuma ação operacional disponível à TV. A função `metric(tasks, today)` é uma base para progresso e prazo. Feed de entregas pode derivar das tarefas concluídas sem transmitir auditoria bruta.

Intervalos do rodízio e atualização, mecanismo de cadastro/pareamento, credencial/expiração e alertas sonoros precisam ser definidos na implementação. O PRD não especifica seus valores ou protocolo; não tratá-los como requisitos já aprovados. Será necessário testar isolamento, privacidade, revogação, reconexão, dados desatualizados e legibilidade em resolução de TV antes de declarar a funcionalidade concluída.

Esta análise concluiu a observação e o registro da referência. Posteriormente o usuário pediu implementação própria e bonita: a entrega local está descrita em `docs/PAINEL-TV.md` e no contexto permanente. Não foi feita publicação externa nem conexão aos atendimentos do CRM.
