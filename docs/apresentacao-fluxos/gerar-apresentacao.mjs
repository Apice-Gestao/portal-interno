/** Gera slides nativos, mantendo cada print real como uma imagem independente.
 * Dependência: @oai/artifact-tool. Execute a partir de uma pasta com essa dependência
 * disponível, ou informe ARTIFACT_TOOL_ENTRY apontando para o módulo exportado.
 * Saídas intermediárias: .local/deck-build. Nunca acessa banco, API ou credenciais.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const outputDir=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(outputDir,'../..');
const build=path.join(root,'.local/deck-build');
const {Presentation,PresentationFile}=await import(process.env.ARTIFACT_TOOL_ENTRY || '@oai/artifact-tool');
const data=JSON.parse(await fs.readFile(path.join(outputDir,'conteudo.json'),'utf8'));
const C={blue:'#16AFC4',deep:'#0E7F87',ink:'#15202B',muted:'#54616B',light:'#F2F5F6',line:'#D9E4E8',white:'#FFFFFF',amber:'#996600'};
const p=Presentation.create({slideSize:{width:1600,height:900}});
const records=[];
const shape=(s,name,x,y,w,h,fill,line=C.line,geometry='rect')=>s.shapes.add({name,geometry,position:{left:x,top:y,width:w,height:h},fill,line:{fill:line,width:1}});
function text(s,name,txt,x,y,w,h,size=26,color=C.ink,bold=false,align='left'){
  const a=shape(s,name,x,y,w,h,'#FFFFFF00','#FFFFFF00','textbox');
  a.text=txt;a.text.style={typeface:'Arial',fontSize:size,color,bold,alignment:align,verticalAlignment:'top',wrap:'square',autoFit:'none',insets:0};return a;
}
function base(section,title,id){
  const s=p.slides.add();s.background.fill=C.white;
  text(s,'section',section.toLocaleUpperCase('pt-BR'),70,20,1300,24,17,C.deep,true);
  text(s,'slide-title',title,70,51,1460,58,40,C.ink,true);
  shape(s,'rule',70,113,1460,2,C.line,C.line);
  text(s,'footer','Ápice Contábil  /  Fluxos do portal',70,875,1230,20,15,C.muted);
  text(s,'page',`${String(p.slides.items.length).padStart(2,'0')}  /  ${id}`,1300,875,230,20,15,C.muted,false,'right');
  return s;
}
function caption(s,txt){text(s,'summary',txt,90,790,1420,78,26,C.ink);}
function node(s,label,detail,x,y,w,h=150,fill=C.light){
  const a=shape(s,label,x,y,w,h,fill,C.line,'roundRect');
  text(s,label+'-title',label,x+22,y+23,w-44,66,27,C.deep,true);
  if(detail)text(s,label+'-detail',detail,x+22,y+88,w-44,h-100,23,C.ink);
  return a;
}
function arrow(s,a,b){s.shapes.connect(a,b,{kind:'straight',fromSide:'right',toSide:'left',line:{fill:C.deep,width:3},tail:{type:'arrow',width:'med',length:'med'}});}
{
 const s=p.slides.add();s.background.fill=C.white;
 text(s,'cover-brand','Ápice Contábil',90,86,1300,48,32,C.deep,true);
 text(s,'cover-title',data.title,90,260,1400,100,68,C.ink,true);
 text(s,'cover-subtitle',data.subtitle,94,381,1350,70,36,C.deep);
 text(s,'cover-description','Telas reais do protótipo e uma explicação breve de cada jornada',94,478,1300,90,29,C.muted);
 shape(s,'cover-rule',94,610,1412,3,C.blue,C.blue);
 text(s,'cover-date',data.date,94,802,800,30,21,C.muted);
 text(s,'cover-note','Capturas com dados fictícios',970,802,535,30,21,C.muted,false,'right');
 s.speakerNotes.text='Apresentação funcional conforme direção do usuário em 15/10/2026. Prints reais do protótipo local, sem composição de telas. Os textos explicam a jornada e o funcionamento esperado. Não contém balanço de implementação.';
 records.push({slide:1,id:'CAPA',title:data.title});
}
for(const item of data.slides){
 const s=base(item.section,item.title,item.id);
 if(item.image){
   shape(s,'screenshot-frame',198,125,1204,646,C.light,C.line,'roundRect');
   s.images.add({blob:await fs.readFile(path.join(outputDir,'screenshots',item.image)),contentType:'image/jpeg',alt:`Print real do protótipo: ${item.title}`,fit:'contain',position:{left:202,top:129,width:1196,height:638}});
 } else if(item.layout==='overview'){
   const labels=[['Empresas','Carteira e contexto fiscal'],['Modelos','Obrigações e etapas'],['Tarefas','Competência e responsável'],['Execução','Evidência e conferência'],['Resultados','Documentos, relatórios e TV']];
   const nodes=labels.map(([label,detail],i)=>node(s,label,detail,70+i*300,305,260,202));
   nodes.slice(1).forEach((n,i)=>arrow(s,nodes[i],n));
   text(s,'access-context','Login e permissões definem as abas, as ações e os dados disponíveis em cada etapa.',100,598,1400,90,29,C.muted,false,'center');
 } else if(item.layout==='regime'){
   text(s,'flow-label','FLUXO DE FUNCIONAMENTO',90,164,1400,30,19,C.deep,true);
   const labels=[['Registrar mudança','Regime, motivo e data de efeito'],['Validar vigência','Regra oficial do caso'],['Revisar impacto','Obrigações e competências afetadas'],['Confirmar e aplicar','Atualizar tarefas sem duplicar']];
   const nodes=labels.map(([label,detail],i)=>node(s,label,detail,70+i*380,255,320,215));
   nodes.slice(1).forEach((n,i)=>arrow(s,nodes[i],n));
   node(s,'Antes da vigência','Preservar tarefas, entregas e evidências do regime anterior.',120,545,625,175);
   node(s,'A partir da vigência','Aplicar o conjunto de obrigações válido para cada competência.',855,545,625,175);
 } else if(item.layout==='regime-example'){
   text(s,'flow-label','REVISÃO DO IMPACTO POR COMPETÊNCIA',90,166,1420,35,21,C.deep,true);
   node(s,'Entram','Gerar as novas obrigações aplicáveis, com responsáveis e prazos.',90,260,430,240);
   node(s,'Permanecem','Manter as obrigações comuns e o andamento já registrado.',585,260,430,240);
   node(s,'Deixam de se aplicar','Encerrar o vínculo pela vigência. Revisar as tarefas existentes.',1080,260,430,240);
   text(s,'review-note','O usuário confirma o plano antes de o sistema atualizar as tarefas.',160,596,1280,90,33,C.deep,true,'center');
 }
 caption(s,item.caption);
 s.speakerNotes.text=[`Tela ou fluxo: ${item.id}.`,item.image?`Captura real: screenshots/${item.image}. Dados fictícios. Capturada em 15/10/2026 no protótipo local.`:'Diagrama nativo de funcionamento esperado. Não é captura nem representação de uma interface.',...item.sources.map(x=>`Fonte: ${x}`)].join('\n');
 records.push({slide:p.slides.items.length,...item});
}
await fs.mkdir(path.join(build,'renders'),{recursive:true});
const candidate=path.join(build,'candidate.pptx');
await (await PresentationFile.exportPptx(p)).save(candidate);
for(let i=0;i<p.slides.items.length;i++){
 const png=await p.export({slide:p.slides.items[i],format:'png',scale:1});
 await fs.writeFile(path.join(build,'renders',`slide-${String(i+1).padStart(2,'0')}.png`),new Uint8Array(await png.arrayBuffer()));
 console.log(`RENDER ${i+1}/${p.slides.items.length}`);
}
await fs.writeFile(path.join(build,'slides-manifest.json'),JSON.stringify(records,null,2));
console.log(`DECK_READY ${p.slides.items.length} slides`);
