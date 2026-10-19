# Apresentação de fluxos

Material em 16:9 com prints reais do protótipo e resumos curtos abaixo de cada tela. O foco é a jornada e o funcionamento esperado, incluindo a adaptação de tarefas quando o regime muda. Não apresenta balanço de implementação.

## Arquivos

- `Apresentacao_Fluxos_Projeto.pptx`: apresentação com textos, frames e diagramas nativos editáveis. Cada captura é uma imagem independente.
- `Apresentacao_Fluxos_Projeto.pdf`: prévia para leitura, com o mesmo conteúdo e marcadores de navegação.
- `conteudo.json`: títulos, resumos e fontes de cada slide.
- `gerar-apresentacao.mjs`: geração do PowerPoint e renderização dos slides.
- `exportar-pdf.py`: exportação da prévia PDF a partir dos slides renderizados.
- `screenshots/`: capturas utilizadas, com dados fictícios.
- `MAPEAMENTO_FLUXOS.md`: sequência das jornadas, origem das telas e fontes.

## Atualização

1. Atualize o conteúdo em `conteudo.json` e substitua capturas por novos prints reais com os mesmos nomes, ou ajuste os nomes no JSON.
2. Execute o gerador com Node.js e `@oai/artifact-tool` disponíveis. Também é possível apontar `ARTIFACT_TOOL_ENTRY` para o arquivo de entrada do pacote, em URL `file:///...`.
3. O gerador salva o candidato `.local/deck-build/candidate.pptx`, as imagens de conferência e o manifesto. Revise todos os slides antes de substituir a entrega final.
4. Para o PDF, execute `python docs/apresentacao-fluxos/exportar-pdf.py`, com `reportlab` disponível. Essa via mantém o PDF idêntico às imagens revisadas.

O gerador não acessa o banco, a API ou credenciais. O PowerPoint entregue abre sem dependência do projeto. O PDF é uma prévia estática. Não modificar screenshots para simular botões ou telas inexistentes.
