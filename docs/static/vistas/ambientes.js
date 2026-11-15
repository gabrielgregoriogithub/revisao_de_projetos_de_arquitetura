// Quadro de ambientes: áreas e perímetros medidos sobre as pranchas, ligados às lacunas e à EAP.
import { el, preferencia } from '../dom.js';
import { estado } from '../estado.js';
import { api } from '../api.js';
import { botao, vazio, avisar, confirmar, seloStatus, etiqueta } from '../componentes.js';
import { chaveAmbiente, escalaDe } from '/dominio/geometria.js';

const fmt = (v) => (v === null || v === undefined ? '—' : v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const CAMPOS_ACAB = { piso: 'Piso', parede: 'Parede', teto: 'Teto', produto: 'Piso (produto)' };

function editar(a) {
  const nome = el('input', { className: 'entrada', value: a.nome, maxLength: 80 });
  const pd = el('input', { className: 'entrada', value: a.pd ?? '', inputMode: 'decimal', placeholder: 'ex.: 2,50' });
  const obs = el('textarea', { className: 'entrada', value: a.observacao ?? '', maxLength: 500 });
  const salvar = botao('Salvar', { classe: 'pri' });
  const cancelar = botao('Cancelar', { classe: 'fantasma' });
  const d = el('dialog', { className: 'modal' }, [
    el('div', { className: 'modal-corpo', style: 'display:grid;gap:10px' }, [el('h2', { textContent: `Editar ${a.id}` }),
      el('label', { className: 'campo' }, ['Nome', nome]), el('label', { className: 'campo' }, ['Pé-direito (m)', pd]), el('label', { className: 'campo' }, ['Observação', obs])]),
    el('div', { className: 'modal-acoes' }, [cancelar, salvar])
  ]);
  const fechar = () => { d.close(); d.remove(); };
  cancelar.onclick = fechar;
  salvar.onclick = async () => {
    try {
      await api.salvarAmbiente(a.id, { nome: nome.value, pd: pd.value, observacao: obs.value, poligonos: a.poligonos, autor: preferencia.ler('autor', '') || null });
      fechar();
      await estado.recarregarEventos();
      avisar(`${a.id} atualizado.`);
    } catch (erro) { avisar(erro.message, { erro: true }); }
  };
  document.body.append(d);
  d.showModal();
}

export function montar(alvo, { navegar }) {
  function desenhar() {
    const { ambientes, lacunas, projeto } = estado;
    const lacunasDe = (nome) => lacunas.filter((l) => l.ambientes.some((x) => chaveAmbiente(x) === chaveAmbiente(nome)));
    const medidos = new Set(ambientes.map((a) => chaveAmbiente(a.nome)));
    const citados = [...new Set(lacunas.flatMap((l) => l.ambientes))].filter((n) => !medidos.has(chaveAmbiente(n)));
    const total = ambientes.reduce((t, a) => t + (a.medida.area ?? 0), 0);
    const esc = projeto.escala;

    const acabamentos = (nome) => lacunasDe(nome).flatMap((l) => Object.entries(CAMPOS_ACAB)
      .filter(([k]) => (l.resposta.campos?.[k] ?? '').trim())
      .map(([k, r]) => el('div', { style: 'font-size:12px' }, [`${r}: ${l.resposta.campos[k]} `, seloStatus(l.resposta.status)])));

    const tabela = ambientes.length ? el('table', { className: 'tabela-lacunas' }, [
      el('thead', {}, [el('tr', {}, ['ID', 'Ambiente', 'Área (m²)', 'Perímetro (m)', 'PD (m)', 'Acabamentos informados', 'Lacunas', ''].map((t) => el('th', { textContent: t })))]),
      el('tbody', {}, ambientes.map((a) => el('tr', { style: 'cursor:default' }, [
        el('td', {}, [el('span', { className: 'codigo', textContent: a.id })]),
        el('td', {}, [el('div', { className: 'tit', textContent: a.nome }),
          el('div', { className: 'sub', textContent: `${a.poligonos.length} polígono(s) · p.${[...new Set(a.poligonos.map((p) => p.prancha))].join(', ')}${a.observacao ? ` · ${a.observacao}` : ''}` })]),
        el('td', { className: 'mono', textContent: a.medida.area !== null ? fmt(a.medida.area) : a.medida.motivo }),
        el('td', { className: 'mono', textContent: fmt(a.medida.perimetro) }),
        el('td', { className: 'mono', textContent: a.pd ? fmt(a.pd) : '—' }),
        el('td', {}, acabamentos(a.nome).length ? acabamentos(a.nome) : [el('span', { className: 'muted', textContent: 'nenhum' })]),
        el('td', {}, lacunasDe(a.nome).map((l) => el('button', { type: 'button', className: 'etiqueta', style: 'border:0;cursor:pointer;margin:1px', textContent: l.id, onclick: () => navegar('lacunas', { l: l.id }) }))),
        el('td', {}, [el('div', { style: 'display:flex;gap:4px' }, [
          botao('', { classe: 'fantasma peq icone', ic: 'alvo', titulo: 'Ver na prancha', onclick: () => navegar('pranchas', { p: a.poligonos[0]?.prancha }) }),
          botao('', { classe: 'fantasma peq icone', ic: 'config', titulo: 'Editar nome, PD e observação', onclick: () => editar(a) }),
          botao('', { classe: 'fantasma peq icone', ic: 'lixo', titulo: 'Excluir medição', onclick: async () => {
            if (!(await confirmar({ titulo: `Excluir ${a.id} · ${a.nome}?`, texto: 'A medição sai do quadro e da EAP. Fica um backup e o registro no histórico.', confirmar: 'Excluir', perigo: true }))) return;
            try { await api.excluirAmbiente(a.id, preferencia.ler('autor', '') || null); await estado.recarregarEventos(); avisar(`${a.id} excluído.`); } catch (erro) { avisar(erro.message, { erro: true }); }
          } })
        ])])
      ])))
    ]) : vazio('Nenhum ambiente medido', 'Na tela Pranchas, use a ferramenta "Área" e clique nos cantos do ambiente. As áreas alimentam a EAP.', 'ajustar');

    alvo.replaceChildren(el('div', { className: 'vista-pad' }, [
      el('header', { className: 'cab-vista' }, [
        el('div', {}, [el('h1', { textContent: 'Quadro de ambientes' }), el('p', { textContent: 'Áreas medidas sobre as pranchas. Na EAP, viram quantidade de piso e forro (e de parede, quando a altura do revestimento é numérica).' })]),
        el('div', { className: 'acoes' }, [botao('Medir na prancha', { classe: 'pri', ic: 'prancha', onclick: () => navegar('pranchas', { p: 2 }) })])
      ]),
      el('div', { className: 'grade-dash' }, [
        el('section', { className: 'cartao c-8' }, [el('div', { className: 'cartao-cab' }, [el('h2', { textContent: `Ambientes medidos (${ambientes.length})` }),
          el('div', { className: 'acao', textContent: ambientes.length ? `Total: ${fmt(total)} m²` : '' })]), el('div', { className: 'cartao-corpo', style: 'overflow:auto' }, [tabela])]),
        el('section', { className: 'cartao c-4' }, [el('div', { className: 'cartao-cab' }, [el('h2', { textContent: 'Escala' })]), el('div', { className: 'cartao-corpo', style: 'display:grid;gap:8px;font-size:13px' }, [
          esc ? el('p', { style: 'margin:0', textContent: esc.origem }) : el('p', { style: 'margin:0;color:var(--vermelho)', textContent: 'Projeto sem escala definida.' }),
          esc ? etiqueta(esc.calibrada ? 'Calibrada com cota' : 'Declarada, não calibrada') : null,
          ...projeto.pranchas.filter((p) => p.escala).map((p) => el('p', { className: 'muted', style: 'margin:0', textContent: `p.${p.numero}: ${escalaDe(projeto, p.numero).origem}` })),
          el('p', { className: 'muted', style: 'margin:0;font-size:12px', textContent: 'Para calibrar, use "Calibrar" na tela Pranchas sobre uma cota conhecida. As áreas são recalculadas na hora.' })
        ])]),
        citados.length ? el('section', { className: 'cartao c-12' }, [el('div', { className: 'cartao-cab' }, [el('h2', { textContent: `Ambientes citados nas lacunas ainda sem medição (${citados.length})` })]),
          el('div', { className: 'cartao-corpo', style: 'display:flex;flex-wrap:wrap;gap:6px' }, citados.map((n) => etiqueta(n, 'Meça este ambiente com o mesmo nome para ligar à EAP')))]) : null
      ])
    ]));
  }
  desenhar();
  const sair = estado.assinar((m) => { if (m === 'dados') desenhar(); });
  return { destruir: sair };
}
