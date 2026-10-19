# Envio da cópia revisada ao GitHub

Em 15/10/2026, o usuário autorizou enviar o conteúdo de `Portal-Apice-2026-10-14.zip` para `https://github.com/Apice-Gestao/portal-interno.git`, preservando as exclusões de credenciais da cópia revisada anterior.

- Pacote de origem: `Portal-Apice-2026-10-14.zip`, sem acrescentar o estado posterior do projeto de trabalho.
- SHA-256 do ZIP: `7335381e68eaf6361fa95599fe7807da28172e53ee606b4ae3d727e789707cbb`.
- Arquivos: 159, com os 158 hashes do manifesto conferidos. O manifesto não inclui o próprio hash.
- Destino: [Apice-Gestao/portal-interno](https://github.com/Apice-Gestao/portal-interno), branch `main`.
- Commit remoto: [`f8cb5f0f919ae63e7b9d2198272a76a10116a12f`](https://github.com/Apice-Gestao/portal-interno/commit/f8cb5f0f919ae63e7b9d2198272a76a10116a12f).

## Revisão antes do envio

Conferidos caminhos do ZIP, ausência de entradas inseguras/symlinks/duplicidades e exclusões de `.env` privado, `.local`, `.git`, `.openai`, banco, dependências, builds, logs e arquivos de credenciais. Comparação em memória com os valores privados do ambiente do projeto e busca de assinaturas de chaves privadas, tokens de provedor/JWT e referências à identidade do computador não encontraram correspondências bloqueantes. Valores não foram impressos ou incluídos no relatório. A revisão independente do pacote confirmou as exclusões e classificou os literais restantes como placeholders ou fixtures de testes.

## Publicação e confirmação

O repositório de destino estava vazio. A cópia foi extraída em checkout isolado e publicada como um commit inicial, sem enviar os objetos ou a configuração Git do projeto principal. A autoria do novo commit usa a identificação genérica `Portal Ápice <noreply@github.com>`, sem reutilizar a identidade local do computador. Não houve force push nem substituição de histórico remoto existente.

Depois do push, novo fetch e consulta ao remoto confirmaram `main` e HEAD no commit acima. Os 159 blobs da branch remota foram comparados byte a byte com o ZIP, incluindo as terminações de linha originais. Conteúdo, inventário e manifesto foram preservados. O ZIP original e o diretório de trabalho principal não foram alterados por esse envio.

O usuário cancelou o fluxograma em árvore durante esta etapa. Não foi gerado ou publicado um novo PowerPoint de árvore. A apresentação anterior permanece separada desta cópia do projeto de 14/10.
