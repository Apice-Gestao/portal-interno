# Iconografia do portal

Família escolhida: [Phosphor Icons para React](https://github.com/phosphor-icons/react), versão 2.1.10, licença MIT. Foram consideradas também as documentações oficiais de [Iconoir](https://iconoir.com/docs/packages/iconoir-react) e [Hugeicons](https://hugeicons.com/docs/integrations/react/overview). Phosphor permite manter a mesma linguagem visual em ícones de navegação, indicadores e controles, com pesos diferentes.

Os componentes ficam em `apps/web/src/shared/icons/index.ts`. Importações individuais evitam carregar o catálogo inteiro. Usar esses nomes semânticos nas telas, em vez de importar diretamente a biblioteca. A curadoria substitui Lucide no frontend; os desenhos pertencem à biblioteca, não são exclusivos da Ápice.

- Navegação e indicadores: duotone, herdando o azul ou a cor semântica do contexto.
- Controles pequenos: regular ou bold para preservar leitura.
- Modelos: Stack; processos: FlowArrow; fluxos entre departamentos: TreeStructure; Central do gestor: GitDiff.
- Documentos: Folders; regras documentais: FileMagnifyingGlass; conciliação: Scales; relatórios: ChartLineUp.
- Segurança: ShieldCheck; conferência operacional: SealCheck. Dispensa: MinusCircle; cancelamento: Prohibit.
- Importar/exportar: FileArrowUp/FileArrowDown; anexar/baixar: UploadSimple/DownloadSimple.

O adaptador `create-icon.tsx` mantém SVG direto, tamanho consistente e cor herdada. Ícones decorativos ficam ocultos dos leitores de tela; botões continuam com texto ou rótulo acessível. Um ícone informativo pode receber `aria-label` ou `alt`. A configuração não muda permissões ou regras de negócio.

As marcas de seleção em CSS e o favicon também usam desenhos Phosphor locais. A licença original está em `apps/web/src/shared/icons/PHOSPHOR-LICENSE.txt`. Nenhum ícone depende de CDN. A logo oficial permanece um arquivo de marca separado, sem substituição por ícone.
