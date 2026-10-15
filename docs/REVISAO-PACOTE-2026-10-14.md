# Revisão da cópia ZIP — 14/10/2026

O usuário solicitou uma cópia ZIP do projeto atual na Área de Trabalho e uma verificação de credenciais específicas do computador antes da entrega. Esta revisão cobre os arquivos do projeto selecionados para a cópia; não é uma varredura do Windows, de outros aplicativos ou do gerenciador de senhas.

## O que foi encontrado e tratado

- O ambiente local possui `.env` com conexões privadas do PostgreSQL, segredo de MFA e configuração dos acessos temporários. Esse arquivo não integra o ZIP. Valores não foram colocados em relatórios, comandos ou documentação.
- `.local` contém banco PostgreSQL, registros, arquivos de execução e verificações privadas. Todo esse diretório fica fora da cópia; o pacote não é um backup dos dados ou das contas existentes.
- A documentação contém referências ao perfil/caminho local do Windows. Elas são generalizadas **somente na cópia exportada**, preservando o projeto de trabalho.
- `.git` fica fora da cópia para não levar metadados locais, identidade do autor, configurações de remotos ou objetos históricos. O desenvolvimento original continua usando Git. A consulta aos nomes de arquivos históricos não encontrou versionamento de `.env` ou `.local`.
- `.openai`, dependências, builds, capturas de tela, relatórios de navegador, cobertura, logs e backups também são excluídos. Evita transportar configurações de hospedagem, metadados de ferramentas ou conteúdo gerado da máquina.
- `.env.example` contém placeholders e campos vazios. Os valores literais detectados em testes automatizados são exemplos sintéticos; não são credenciais do Windows. Os atalhos temporários continuam implementados conforme pedido anterior, mas sua configuração privada/contas não são exportadas. A simulação da TV também permanece com o roteiro de remoção já documentado.

## Conferência

Os arquivos selecionados são revisados por padrões de chaves privadas, tokens de provedores, JWTs literais, URLs autenticadas, atribuições sensíveis e referências a perfis locais. As conexões privadas, senhas aleatórias do banco e segredo de MFA são comparados em memória com os textos selecionados, sem imprimir os valores. Correspondências de palavras comuns dos testes são classificadas separadamente; nomes de cargos não são tratados como segredo pessoal.

Nenhuma chave privada, token pessoal de provedor ou cópia das conexões/segredo MFA locais foi identificada nos arquivos de código/documentação selecionados. Isso descreve a revisão realizada e não substitui uma auditoria de produção nem uma garantia contra qualquer formato desconhecido de segredo.

O ZIP final é reaberto para conferir nomes relativos seguros, exclusões, hashes e conteúdo dos arquivos. O pacote recebe inventário SHA-256 e instruções de preparação. As dependências e o banco devem ser preparados no destino; as credenciais precisam ser novas/configuradas ali. Não copiar o `.env` deste computador nem a pasta do banco para dentro do pacote.

## Execução após extrair

1. Instalar Node.js/npm e PostgreSQL compatíveis; abrir o terminal na pasta extraída.
2. Executar `npm ci`, `npm run db:setup` e `npm run dev`. O setup gera novas credenciais locais e uma base nova; não copiar `.env.example` para `.env` antes dele.
3. Configurar a própria conta inicial e o envio de e-mails/segundo fator conforme a documentação. O ZIP não fornece login pronto nem as contas do computador de origem.
4. No Windows, após a preparação, `Iniciar Sistema.cmd` pode iniciar os serviços. Se o PostgreSQL não estiver no caminho padrão, definir `PG_BIN_DIR`.

Esta cópia mantém o estado de desenvolvimento atual, inclusive recursos temporários explicitamente solicitados. Não é uma implantação pronta para VPS.
