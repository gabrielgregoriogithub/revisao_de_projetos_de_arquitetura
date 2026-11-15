// Vistas de apoio: Relatórios, Projeto e Configurações.
import { el, preferencia } from '../dom.js';
import { icone } from '../icones.js';
import { estado } from '../estado.js';
import { botao, etiqueta, avisar } from '../componentes.js';
import { aplicarTema } from '../tema.js';
import { api, abrirRelatorio, urlPrancha, ESTATICO, nuvem } from '../api.js';
import { painelNuvem } from './nuvem-painel.js';

const RELATORIOS = [
  ['executivo', 'Relatório executivo', 'Indicadores, alertas, prioridades e riscos — para apresentar ao cliente ou à incorporadora.'],
  ['abertas', 'Lacunas abertas', 'Tudo que ainda não tem resposta, com recorte da planta. Ideal para enviar ao escritório de arquitetura.'],
  ['disciplinas', 'Pendências por disciplina', 'Lacunas não resolvidas agrupadas por disciplina responsável.'],
  ['inconsistencias', 'Inconsistências entre pranchas', 'Divergências entre documentos e erros documentais (carimbo, numeração).'],
  ['respostas', 'Respostas recebidas', 'O que já foi respondido, por quem e com quais evidências.'],
  ['riscos', 'Riscos financeiros', 'Impacto calculado, estimado e não quantificado, sem somar valores incompatíveis.'],
  ['evolucao', 'Evolução da resolução', 'Série histórica e registro completo de alterações.'],
  ['especificacoes', 'Especificações consolidadas', 'Memorial do que foi respondido, separando o validado do não validado.']
];

export function relatorios(alvo) {
  let recortes = preferencia.ler('relRecortes', true);
  const desenhar = () => alvo.replaceChildren(el('div', { className: 'vista-pad' }, [
    el('header', { className: 'cab-vista' }, [
      el('div', {}, [el('h1', { textContent: 'Relatórios' }), el('p', { textContent: 'Documentos com identificação da obra, data de emissão e referências às pranchas. Abra e use "Imprimir / Salvar PDF".' })]),
      el('div', { className: 'acoes' }, [el('label', { className: 'check' }, [
        el('input', { type: 'checkbox', checked: recortes, onchange: (e) => { recortes = e.target.checked; preferencia.gravar('relRecortes', recortes); desenhar(); } }),
        'Incluir recortes das pranchas'])])
    ]),
    el('div', { className: 'cartoes-rel' }, RELATORIOS.map(([tipo, titulo, desc]) => el('article', { className: 'cartao cartao-rel' }, [
      el('div', { style: 'display:flex;gap:10px;align-items:center' }, [icone('relatorio'), el('h3', { textContent: titulo })]),
      el('p', { textContent: desc }),
      el('div', { className: 'acoes' }, [botao('Abrir', { classe: 'pri peq', ic: 'abrir', onclick: () => abrirRelatorio(tipo, { recortes }) })])
    ])))
  ]));
  desenhar();
  return {};
}

/** "Base de pranchas": importa um PDF como novo projeto ou nova revisão da obra. */
function formularioImportacao(atual) {
  const arquivo = el('input', { type: 'file', className: 'entrada', accept: 'application/pdf,.pdf', 'aria-label': 'PDF das pranchas' });
  const nome = el('input', { className: 'entrada', value: atual.nome, maxLength: 120 });
  const revisao = el('input', { className: 'entrada', placeholder: 'R01', maxLength: 3, style: 'max-width:90px' });
  const escala = el('input', { className: 'entrada', value: atual.escala?.denominador ?? 75, inputMode: 'numeric', style: 'max-width:90px' });
  const status = el('span', { className: 'muted', style: 'font-size:12px' });
  const enviar = botao('Importar pranchas', { classe: 'pri', ic: 'baixar' });
  enviar.onclick = async () => {
    const f = arquivo.files?.[0];
    if (!f) { arquivo.focus(); avisar('Escolha o PDF das pranchas.', { erro: true }); return; }
    enviar.disabled = true;
    status.textContent = 'Renderizando pranchas e extraindo texto… (pode levar um minuto)';
    try {
      const r = await api.importarPdf(f, { nome: nome.value.trim(), revisao: revisao.value.trim(), obra: atual.obraId ?? '', escala: Number(escala.value) || '' }, (msg) => { status.textContent = msg; });
      status.replaceChildren(`Projeto ${r.id} criado com ${r.pranchas} pranchas. `, ESTATICO
        ? 'Abra o projeto e marque as lacunas com a ferramenta "Nova lacuna" na tela Pranchas.'
        : `Peça ao Claude Code: "analise o projeto ${r.id} e gere as lacunas". `, botao('Abrir projeto', { classe: 'peq', onclick: async () => { await api.definirProjeto(r.id); location.hash = '#/pranchas'; location.reload(); } }));
      avisar(`Pranchas importadas em ${r.id}.`);
    } catch (erro) {
      status.textContent = '';
      avisar(erro.message, { erro: true, duracao: 8000 });
    } finally {
      enviar.disabled = false;
    }
  };
  return el('div', { style: 'margin-top:16px;padding-top:14px;border-top:1px solid var(--borda);display:grid;gap:10px' }, [
    el('strong', { textContent: 'Base de pranchas: importar PDF (novo projeto ou nova revisão)' }),
    el('div', { className: 'filtros', style: 'margin:0' }, [arquivo, el('label', { className: 'campo' }, ['Nome', nome]), el('label', { className: 'campo' }, ['Revisão', revisao]),
      el('label', { className: 'campo' }, ['Escala 1:', escala]), enviar]),
    status,
    el('p', { className: 'muted', style: 'margin:0;font-size:12px', textContent: ESTATICO
      ? 'Versão publicada: o PDF é processado no seu navegador (PDF.js) e fica guardado só nele — nada é enviado a servidor. As lacunas são marcadas por você com "Nova lacuna"; a análise automática pelo Claude Code exige a versão local.'
      : 'A importação renderiza as pranchas e extrai a camada de texto. As lacunas são geradas depois pelo Claude Code, que lê as pranchas. Mesma obra + revisão nova permite comparar em "Revisões".' })
  ]);
}

export function projeto(alvo, { navegar }) {
  const p = estado.projeto;
  const erros = estado.integridade.filter((x) => x.nivel === 'erro').length;
  const linha = (rotulo, valor) => [el('dt', { textContent: rotulo }), el('dd', { textContent: valor ?? '—' })];
  const corpoProjetos = el('div', { className: 'cartao-corpo' }, ['Carregando…']);
  const listaProjetos = el('section', { className: 'cartao c-12' }, [el('div', { className: 'cartao-cab' }, [el('h2', { textContent: 'Projetos e revisões' })]), corpoProjetos]);
  api.projetos().then(({ ativo, projetos }) => {
    corpoProjetos.replaceChildren(el('div', { className: 'lista-simples' }, projetos.map((x) => el('div', { className: 'conflito', style: 'cursor:default' }, [
      el('span', { className: 'codigo', textContent: x.revisao ?? '—' }),
      el('div', {}, [el('strong', { style: 'display:block;font-size:13px', textContent: x.nome }), el('span', { className: 'muted', style: 'font-size:12px', textContent: `${x.id} · obra ${x.obraId} · ${x.etapa} · análise ${x.analisadoEm ?? 'pendente'}` })]),
      x.id === ativo ? etiqueta('ativo') : botao('Abrir', { classe: 'peq', onclick: async () => { await api.definirProjeto(x.id); location.hash = '#/visao-geral'; location.reload(); } })
    ]))), formularioImportacao(p));
  }).catch((erro) => corpoProjetos.replaceChildren(erro.message));
  alvo.replaceChildren(el('div', { className: 'vista-pad' }, [
    el('header', { className: 'cab-vista' }, [el('div', {}, [el('h1', { textContent: 'Projeto' }), el('p', { textContent: 'Ficha técnica do projeto analisado.' })])]),
    el('div', { className: 'grade-dash' }, [
      el('section', { className: 'cartao c-7' }, [el('div', { className: 'cartao-cab' }, [el('h2', { textContent: p.nome })]), el('div', { className: 'cartao-corpo' }, [
        el('dl', { className: 'ficha' }, [
          ...linha('Obra', p.obra), ...linha('Etapa', p.etapa), ...linha('Endereço', p.endereco), ...linha('Autor do projeto', p.autorProjeto),
          ...linha('Data do projeto', p.dataProjeto), ...linha('Arquivo analisado', p.arquivo), ...linha('Análise', p.analisadoEm),
          ...linha('Integridade', erros ? `${erros} erros — ver Compatibilização` : 'Dados íntegros')
        ])
      ])]),
      el('section', { className: 'cartao c-5' }, [el('div', { className: 'cartao-cab' }, [el('h2', { textContent: `Pranchas (${p.pranchas.length})` })]), el('div', { className: 'cartao-corpo' }, [
        el('div', { className: 'lista-simples' }, p.pranchas.map((x) => el('button', { type: 'button', className: 'conflito', onclick: () => navegar('pranchas', { p: x.numero }) }, [
          el('img', { src: urlPrancha(x.miniatura ?? x.imagem), alt: '', style: 'width:72px;border-radius:4px;border:1px solid var(--borda);background:#fff' }),
          el('div', {}, [el('strong', { style: 'display:block;font-size:13px', textContent: `Folha ${x.folha} · ${x.titulo}` }), el('span', { className: 'muted', style: 'font-size:12px', textContent: `PDF p.${x.numero} · ${x.resolucaoDpi ?? '—'} dpi` })]),
          icone('proximo')
        ])))
      ])]),
      nuvem ? painelNuvem() : null,
      listaProjetos
    ])
  ]));
  return {};
}

const ATALHOS = [
  ['J / K', 'Próxima / anterior lacuna (lista filtrada)'], ['Shift+J / Shift+K', 'Próximo / anterior marcador na prancha'],
  ['[ / ]', 'Prancha anterior / próxima'], ['+ / −', 'Zoom'], ['F', 'Ajustar prancha à tela'], ['0', 'Tamanho original (100%)'],
  ['Ctrl+S', 'Salvar a lacuna aberta'], ['/', 'Buscar lacunas'], ['Esc', 'Fechar o detalhe'], ['G e V / P / L / O', 'Ir para Visão geral / Pranchas / Lacunas / Orçamento'], ['?', 'Mostrar atalhos']
];
export const tabelaAtalhos = () => el('table', { className: 'tabela-atalhos' }, ATALHOS.map(([k, d]) => el('tr', {}, [el('td', {}, k.split(' ').map((t) => (t.length <= 7 && t !== 'e' && t !== '/' ? el('kbd', { textContent: t }) : ` ${t} `))), el('td', { textContent: d })])));

export function configuracoes(alvo) {
  const autor = el('input', { className: 'entrada', value: preferencia.ler('autor', ''), maxLength: 80, placeholder: 'Ex.: Gabriel – engenharia de custos' });
  const tema = el('select', { className: 'entrada' }, [['sistema', 'Seguir o sistema'], ['claro', 'Claro'], ['escuro', 'Escuro']]
    .map(([v, t]) => el('option', { value: v, textContent: t, selected: preferencia.ler('tema', 'sistema') === v })));
  tema.onchange = () => { preferencia.gravar('tema', tema.value); aplicarTema(); };

  alvo.replaceChildren(el('div', { className: 'vista-pad' }, [
    el('header', { className: 'cab-vista' }, [el('div', {}, [el('h1', { textContent: 'Configurações' }), el('p', { textContent: 'Preferências deste navegador.' })])]),
    el('div', { className: 'grade-dash' }, [
      el('section', { className: 'cartao c-6' }, [el('div', { className: 'cartao-cab' }, [el('h2', { textContent: 'Identificação e aparência' })]), el('div', { className: 'cartao-corpo', style: 'display:grid;gap:14px' }, [
        el('label', { className: 'campo' }, ['Seu nome', el('small', { textContent: 'Registrado como autor no histórico de cada alteração. O app não tem login.' }), autor]),
        el('label', { className: 'campo' }, ['Tema', tema]),
        el('div', {}, [botao('Salvar', { classe: 'pri', onclick: () => { preferencia.gravar('autor', autor.value.trim()); avisar('Preferências salvas.'); } })])
      ])]),
      el('section', { className: 'cartao c-6' }, [el('div', { className: 'cartao-cab' }, [el('h2', { textContent: 'Atalhos de teclado' })]), el('div', { className: 'cartao-corpo' }, [tabelaAtalhos()])]),
      el('section', { className: 'cartao c-12' }, [el('div', { className: 'cartao-cab' }, [el('h2', { textContent: 'Dados e segurança' })]), el('div', { className: 'cartao-corpo' }, [
        el('ul', { className: 'problemas' }, (ESTATICO ? [
          'Versão publicada: os dados ficam só no IndexedDB deste navegador (nada é enviado a servidor). Limpar os dados do site apaga respostas e projetos importados.',
          'Use uma aba por vez: abas simultâneas podem sobrescrever a mesma lacuna nesta versão.',
          'Para trabalho real com o cliente, use a versão local (npm start), com arquivos e backups no disco.'
        ] : [
          'Servidor acessível só em 127.0.0.1; escrita exige origem local e JSON.',
          'Respostas em dados/projetos/<id>/respostas.json, histórico em historico.json, backups automáticos em backups/.',
          'Cada lacuna tem número de revisão: duas abas editando a mesma lacuna não se sobrescrevem (a segunda recebe aviso).'
        ]).map((t) => el('li', {}, [etiqueta('ok'), ` ${t}`])))
      ])])
    ])
  ]));
  return {};
}
