// Compatibilização: matriz disciplina × status, ocorrências multidisciplinares/multi-prancha,
// prévia determinística do processamento de respostas e integridade dos dados.
import { el } from '../dom.js';
import { estado } from '../estado.js';
import { api, ESTATICO } from '../api.js';
import { botao, seloStatus, etiqueta, vazio, carregando } from '../componentes.js';
import { DISCIPLINAS } from '/dominio/lacunas.js';
import { STATUS_INFO } from '/dominio/status.js';

const GRUPOS_STATUS = [
  ['Abertas', ['aberta', 'reaberta']], ['Aguardando', ['pendente', 'em_validacao']],
  ['Respondidas', ['respondida']], ['Validadas', ['validada']], ['N/A', ['nao_aplicavel']]
];

export function montar(alvo, { navegar }) {
  const previa = el('div', {}, [carregando('Calculando prévia…')]);

  function desenhar() {
    const { lacunas, integridade } = estado;
    const ir = (id) => navegar('pranchas', { l: id });
    const irDisc = (d) => { estado.definirFiltros({ disciplina: d, ids: null }); navegar('lacunas'); };

    const linhas = Object.entries(DISCIPLINAS).map(([k, nome]) => {
      const ls = lacunas.filter((l) => l.disciplinas.includes(k));
      return { k, nome, total: ls.length, por: GRUPOS_STATUS.map(([, sts]) => ls.filter((l) => sts.includes(l.resposta.status)).length) };
    });
    const max = Math.max(1, ...linhas.flatMap((l) => l.por));
    const calor = (v, i) => el('span', {
      className: 'celula-calor',
      style: v ? `background:color-mix(in srgb, ${i === 0 ? 'var(--vermelho)' : i === 1 ? 'var(--amarelo)' : i === 4 ? 'var(--cinza)' : 'var(--verde)'} ${12 + (v / max) * 40}%, transparent)` : '',
      textContent: v || '·'
    });
    const matriz = el('table', { className: 'matriz' }, [
      el('thead', {}, [el('tr', {}, [el('th', { textContent: 'Disciplina' }), ...GRUPOS_STATUS.map(([r]) => el('th', { textContent: r })), el('th', { textContent: 'Total' })])]),
      el('tbody', {}, linhas.map((l) => el('tr', { style: l.total ? 'cursor:pointer' : 'opacity:.55', onclick: l.total ? () => irDisc(l.k) : undefined, title: l.total ? 'Ver lacunas da disciplina' : 'Sem lacunas registradas' }, [
        el('td', { textContent: l.nome }), ...l.por.map((v, i) => el('td', {}, [calor(v, i)])), el('td', { className: 'num', textContent: l.total })
      ])))
    ]);

    const ocorrencias = lacunas.filter((l) => l.categoria === 'inconsistencia' || l.categoria === 'documentacao' || l.pranchas.length > 1 || l.disciplinas.length > 2);
    const lista = ocorrencias.length ? el('div', { className: 'lista-simples' }, ocorrencias.map((l) => el('button', { type: 'button', className: 'conflito', onclick: () => ir(l.id) }, [
      el('span', { className: 'codigo', textContent: l.id }),
      el('div', {}, [el('strong', { style: 'display:block;font-size:13px', textContent: l.titulo }),
        el('div', { className: 'disc' }, [...l.disciplinas.map((d) => etiqueta(DISCIPLINAS[d] ?? d)), ...l.pranchas.map((p) => etiqueta(`PDF p.${p}`))])]),
      seloStatus(l.resposta.status)
    ]))) : vazio('Nenhuma ocorrência entre disciplinas');

    const erros = integridade.filter((p) => p.nivel === 'erro');
    const integ = integridade.length
      ? el('ul', { className: 'problemas' }, integridade.map((p) => el('li', {}, [etiqueta(p.nivel), ` ${p.lacuna ?? '—'}: ${p.mensagem}`])))
      : el('p', { style: 'margin:0', textContent: `Dados íntegros: ${lacunas.length} lacunas com IDs únicos, marcadores dentro das pranchas e referências válidas.` });

    alvo.replaceChildren(el('div', { className: 'vista-pad' }, [
      el('header', { className: 'cab-vista' }, [el('div', {}, [el('h1', { textContent: 'Compatibilização' }),
        el('p', { textContent: 'Ocorrências entre disciplinas e documentos. A identificação é feita pelo Claude Code sobre as pranchas; o app não detecta interferências geométricas.' })])]),
      el('div', { className: 'grade-dash' }, [
        el('section', { className: 'cartao c-7' }, [el('div', { className: 'cartao-cab' }, [el('h2', { textContent: 'Disciplina × situação' })]), el('div', { className: 'cartao-corpo' }, [matriz])]),
        el('section', { className: 'cartao c-5' }, [el('div', { className: 'cartao-cab' }, [el('h2', { textContent: 'Prévia do processamento' }),
          el('div', { className: 'acao' }, [botao('Atualizar', { classe: 'fantasma peq', onclick: carregarPrevia })])]), el('div', { className: 'cartao-corpo' }, [previa])]),
        el('section', { className: 'cartao c-7' }, [el('div', { className: 'cartao-cab' }, [el('h2', { textContent: `Ocorrências multidisciplinares e entre pranchas (${ocorrencias.length})` })]), el('div', { className: 'cartao-corpo' }, [lista])]),
        el('section', { className: 'cartao c-5' }, [el('div', { className: 'cartao-cab' }, [el('h2', { textContent: `Integridade dos dados${erros.length ? ` · ${erros.length} erros` : ''}` })]), el('div', { className: 'cartao-corpo' }, [integ])])
      ])
    ]));
  }

  async function carregarPrevia() {
    previa.replaceChildren(carregando('Calculando prévia…'));
    try {
      const p = await api.previaProcessamento();
      previa.replaceChildren(
        el('p', { style: 'margin:0 0 10px;font-size:13px;color:var(--tinta-2)', textContent: ESTATICO ? 'O que o protocolo determinístico faria agora (nada é alterado aqui). A aplicação e a revisão técnica pelo Claude Code exigem a versão local.' : 'O que o protocolo determinístico faria agora (nada é alterado aqui). Para aplicar, peça ao Claude Code: "processe as respostas das lacunas".' }),
        p.acoes.length || p.contradicoes.length ? el('ul', { className: 'problemas' }, [
          ...p.acoes.map((a) => el('li', {}, [el('strong', { textContent: `${a.lacuna}: ` }), seloStatus(a.de), ' → ', seloStatus(a.para), el('div', { className: 'muted', style: 'font-size:12px', textContent: a.motivo })])),
          ...p.contradicoes.map((c) => el('li', {}, [el('strong', { textContent: `Contradição ${c.lacunas.join(' × ')}` }), ` em ${c.campo} (${c.ambientes.join(', ')}): "${c.valores[0]}" ≠ "${c.valores[1]}"`]))
        ]) : vazio('Nada a processar', `Nenhuma lacuna com status "${STATUS_INFO.respondida.rotulo}".`, 'check')
      );
    } catch (erro) {
      previa.replaceChildren(vazio('Não foi possível calcular', erro.message, 'alerta'));
    }
  }

  desenhar();
  carregarPrevia();
  const sair = estado.assinar((m) => { if (m === 'dados') { desenhar(); carregarPrevia(); } });
  return { destruir: sair };
}
