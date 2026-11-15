// Comparação de revisões (ex.: R00 × R01): lacunas resolvidas/novas/mantidas e diferença visual das pranchas.
import { el } from '../dom.js';
import { api, urlPrancha, ESTATICO } from '../api.js';
import { estado } from '../estado.js';
import { botao, vazio, carregando, seloStatus, etiqueta, avisar } from '../componentes.js';

export function montar(alvo) {
  const corpo = el('div', {}, [carregando('Carregando projetos…')]);
  alvo.replaceChildren(el('div', { className: 'vista-pad' }, [
    el('header', { className: 'cab-vista' }, [el('div', {}, [el('h1', { textContent: 'Revisões' }),
      el('p', { textContent: 'Compare duas revisões do projeto: o que foi resolvido, o que surgiu e o que mudou no desenho.' })])]),
    corpo
  ]));

  (async () => {
    let lista;
    try { lista = (await api.projetos()).projetos; } catch (erro) { corpo.replaceChildren(vazio('Falha ao listar projetos', erro.message, 'alerta')); return; }
    if (lista.length < 2) {
      corpo.replaceChildren(el('div', { className: 'aviso-futuro' }, [el('span', { textContent:
        `Há só uma revisão cadastrada (${lista[0]?.revisao ?? lista[0]?.id}). `
        + (ESTATICO ? 'Importe a próxima revisão em Projeto › Base de pranchas (mesmo nome, revisão R01) e a comparação aparece aqui.'
          : 'Quando chegar a próxima, importe em Projeto › Base de pranchas ou peça ao Claude Code: "crie a revisão R01 a partir do PDF X e analise". A comparação aparece aqui.') })]));
      return;
    }
    const opcao = (p, sel) => el('option', { value: p.id, selected: sel, textContent: `${p.nome} · ${p.revisao ?? p.etapa} (${p.id})` });
    const atual = estado.projetoId;
    const outros = lista.filter((p) => p.id !== atual);
    const de = el('select', { className: 'entrada', style: 'width:auto' }, lista.map((p) => opcao(p, p.id === outros[0].id)));
    const para = el('select', { className: 'entrada', style: 'width:auto' }, lista.map((p) => opcao(p, p.id === atual)));
    const resultado = el('div');
    const comparar = async () => {
      if (de.value === para.value) { avisar('Escolha revisões diferentes.', { erro: true }); return; }
      resultado.replaceChildren(carregando('Comparando…'));
      try { desenharResultado(resultado, await api.comparar(de.value, para.value)); } catch (erro) { resultado.replaceChildren(vazio('Falha ao comparar', erro.message, 'alerta')); }
    };
    corpo.replaceChildren(el('div', { className: 'filtros' }, ['De', de, 'para', para, botao('Comparar', { classe: 'pri', onclick: comparar })]), resultado);
    comparar();
  })();
  return {};
}

function desenharResultado(alvo, { de, para, lacunas }) {
  const secao = (titulo, itens, linha) => el('section', { className: 'cartao c-4' }, [
    el('div', { className: 'cartao-cab' }, [el('h2', { textContent: `${titulo} (${itens.length})` })]),
    el('div', { className: 'cartao-corpo' }, [itens.length ? el('ul', { className: 'lista-simples' }, itens.map((i) => el('li', {}, linha(i)))) : vazio('Nenhuma')])
  ]);
  const comuns = de.projeto.pranchas.filter((p) => para.projeto.pranchas.some((q) => q.numero === p.numero));
  const visual = el('div');
  const sel = el('select', { className: 'entrada', style: 'width:auto' }, comuns.map((p) => el('option', { value: p.numero, textContent: `PDF p.${p.numero} – ${p.titulo}` })));
  const modo = el('select', { className: 'entrada', style: 'width:auto' }, [el('option', { value: 'diferenca', textContent: 'Diferença (o que mudou aparece claro)' }), el('option', { value: 'sobrepor', textContent: 'Sobrepor com transparência' })]);
  const opac = el('input', { type: 'range', min: 0, max: 100, value: 50, 'aria-label': 'Transparência da revisão nova' });
  const desenharVisual = () => {
    const n = Number(sel.value);
    const a = de.projeto.pranchas.find((p) => p.numero === n);
    const b = para.projeto.pranchas.find((p) => p.numero === n);
    const novo = el('img', { src: urlPrancha(b.imagem, para.id), alt: `Revisão nova, p.${n}` });
    if (modo.value === 'sobrepor') novo.style.opacity = String(Number(opac.value) / 100);
    visual.replaceChildren(el('div', { className: `diff${modo.value === 'diferenca' ? ' modo-diferenca' : ''}` }, [
      el('img', { src: urlPrancha(a.imagem, de.id), alt: `Revisão anterior, p.${n}` }), novo]),
    el('p', { className: 'muted', style: 'font-size:12px', textContent: modo.value === 'diferenca'
      ? 'Modo diferença: áreas iguais ficam pretas; o que mudou entre as revisões aparece claro. Requer pranchas no mesmo enquadramento.'
      : 'Arraste o controle para alternar entre a revisão anterior e a nova.' }));
  };
  sel.onchange = desenharVisual; modo.onchange = desenharVisual; opac.oninput = desenharVisual;

  alvo.replaceChildren(el('div', { className: 'grade-dash' }, [
    secao('Resolvidas na revisão', lacunas.resolvidasNaRevisao, (i) => [el('span', { className: 'codigo', textContent: i.id }), ` ${i.titulo} `, etiqueta('confirmar no desenho')]),
    secao('Novas', lacunas.novas, (i) => [el('span', { className: 'codigo', textContent: i.id }), ` ${i.titulo} `, etiqueta(i.prioridade)]),
    secao('Mantidas', lacunas.mantidas, (i) => [el('span', { className: 'codigo', textContent: `${i.idAntes}→${i.idDepois}` }), ` ${i.titulo} `,
      seloStatus(i.statusAntes), ' → ', seloStatus(i.statusDepois), i.problemaMudou ? etiqueta('descrição mudou') : null]),
    el('section', { className: 'cartao c-12' }, [el('div', { className: 'cartao-cab' }, [el('h2', { textContent: 'Diferença visual das pranchas' })]),
      el('div', { className: 'cartao-corpo' }, comuns.length ? [el('div', { className: 'filtros' }, [sel, modo, opac]), visual] : [vazio('Sem pranchas em comum')])])
  ]));
  if (comuns.length) desenharVisual();
}
