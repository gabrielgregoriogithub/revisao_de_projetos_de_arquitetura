// Revisão de pranchas: miniaturas + lista filtrada | visualizador com marcadores | detalhe redimensionável.
import { el, preferencia } from '../dom.js';
import { estado, lacunasFiltradas } from '../estado.js';
import { botao, barraFiltros, vazio, avisar, confirmar, corStatus, preservarFoco } from '../componentes.js';
import { criarVisor } from '../visor.js';
import { renderizarDetalhe } from './detalhe.js';
import { criarMedicao } from '../medicao.js';
import { api, urlPrancha } from '../api.js';
import { escalaDe } from '/dominio/geometria.js';

export function montar(alvo, { navegar, params }) {
  const projeto = estado.projeto;
  let prancha = Number(params.get('p')) || preferencia.ler('prancha', projeto.pranchas[0].numero);
  if (!projeto.pranchas.some((p) => p.numero === prancha)) prancha = projeto.pranchas[0].numero;
  let ativa = params.get('l') || null;
  let marcadorAtual = -1;
  let painel = { sujo: () => false };

  const colLista = el('aside', { className: 'col-lista', 'aria-label': 'Pranchas e lacunas' });
  const viewport = el('div', { className: 'viewport', tabIndex: 0, 'aria-label': 'Prancha. Arraste para mover, role para ampliar.' });
  const zoomVal = el('span', { className: 'zoom-val', textContent: '—' });
  const titulo = el('div', { className: 'titulo-prancha' });
  const detalheCol = el('aside', { className: 'detalhe-col', 'aria-label': 'Detalhe da lacuna' });
  const divisor = el('div', { className: 'divisor', role: 'separator', 'aria-orientation': 'vertical', title: 'Arraste para redimensionar' });
  const raiz = el('div', { className: 'revisao' });

  const visor = criarVisor({
    viewport, referencia: projeto.referencia,
    aoClicarMarca: (id) => selecionar(id, { focar: false }),
    aoMudarZoom: (e) => { zoomVal.textContent = `${Math.round(e * 100)}%`; },
    aoClicarAnotacao: async (a) => {
      if (medicao.ativo()) return;
      const ok = await confirmar({ titulo: 'Excluir anotação?', texto: `"${a.texto ?? a.tipo}" será removida da prancha (fica registrado no histórico).`, confirmar: 'Excluir', perigo: true });
      if (!ok) return;
      try { await api.excluirAnotacao(a.id, preferencia.ler('autor', '') || null); await estado.recarregarEventos(); } catch (erro) { avisar(erro.message, { erro: true }); }
    }
  });

  let mostrarAmb = preferencia.ler('camadaAmbientes', true);
  let mostrarTexto = preferencia.ler('camadaTexto', false);
  const alternador = (rotulo, titulo, obter, definir) => {
    const b = botao(rotulo, { classe: 'peq alternador', titulo });
    b.setAttribute('aria-pressed', String(obter()));
    b.onclick = () => { definir(!obter()); b.setAttribute('aria-pressed', String(obter())); desenharCamadas(); };
    return b;
  };
  const alternadorAmb = alternador('Ambientes', 'Mostrar ambientes medidos', () => mostrarAmb, (v) => { mostrarAmb = v; preferencia.gravar('camadaAmbientes', v); });
  const alternadorTexto = alternador('Texto do PDF', 'Mostrar palavras extraídas do PDF (posições exatas)', () => mostrarTexto, (v) => { mostrarTexto = v; preferencia.gravar('camadaTexto', v); });
  alternadorTexto.disabled = !estado.textoPdf;
  const escalaInfo = el('span', { className: 'muted', style: 'font-size:12px' });

  function desenharCamadas() {
    const esc = escalaDe(estado.projeto, prancha);
    escalaInfo.textContent = esc ? `Escala ${esc.calibrada ? 'calibrada' : 'declarada'}` : 'Sem escala';
    escalaInfo.title = esc?.origem ?? 'Calibre a escala para medir.';
    visor.definirCamadas({
      ambientes: mostrarAmb ? estado.ambientes.map((a) => ({ ...a, poligonos: a.poligonos.filter((p) => p.prancha === prancha) })).filter((a) => a.poligonos.length) : [],
      palavras: mostrarTexto ? (estado.textoPdf?.pranchas?.[prancha] ?? []) : [],
      anotacoes: (estado.anotacoes ?? []).filter((a) => a.prancha === prancha).map((a) => ({ ...a, rotulo: a.tipo === 'texto' ? null : a.texto }))
    });
  }

  const barra = el('div', { className: 'barra-visor' }, [
    botao('', { classe: 'fantasma peq icone', ic: 'anterior', titulo: 'Prancha anterior ( [ )', onclick: () => trocarPrancha(-1) }),
    titulo,
    botao('', { classe: 'fantasma peq icone', ic: 'proximo', titulo: 'Próxima prancha ( ] )', onclick: () => trocarPrancha(1) }),
    el('span', { className: 'sep' }),
    el('div', { className: 'grupo-botoes' }, [
      botao('', { classe: 'peq icone', ic: 'menos', titulo: 'Diminuir zoom ( - )', onclick: () => visor.zoomMenos() }),
      botao('', { classe: 'peq icone', ic: 'mais', titulo: 'Aumentar zoom ( + )', onclick: () => visor.zoomMais() })
    ]),
    zoomVal,
    botao('Ajustar', { classe: 'peq', ic: 'ajustar', titulo: 'Ajustar à tela ( F )', onclick: () => visor.ajustar() }),
    botao('100%', { classe: 'peq', ic: 'real', titulo: 'Tamanho original ( 0 )', onclick: () => visor.tamanhoReal() }),
    el('span', { className: 'sep' }),
    el('div', { className: 'grupo-botoes', role: 'group', 'aria-label': 'Ferramentas de desenho' }, [
      botao('Área', { classe: 'peq', titulo: 'Medir a área de um ambiente (polígono) ( M )', onclick: () => medicao.medirArea() }),
      botao('Distância', { classe: 'peq', titulo: 'Medir distância entre dois pontos ( D )', onclick: () => medicao.medirDistancia() }),
      botao('Linha', { classe: 'peq', titulo: 'Desenhar linha de anotação ( L )', onclick: () => medicao.desenharLinha() }),
      botao('Texto', { classe: 'peq', titulo: 'Escrever anotação na prancha ( T )', onclick: () => medicao.anotarTexto() })
    ]),
    botao('Nova lacuna', { classe: 'peq', ic: 'mais', titulo: 'Marcar uma nova lacuna na prancha ( N )', onclick: () => medicao.novaLacuna() }),
    botao('Calibrar', { classe: 'peq fantasma', titulo: 'Calibrar a escala com uma cota conhecida', onclick: () => medicao.calibrar() }),
    alternadorAmb, alternadorTexto, escalaInfo,
    el('div', { className: 'direita' }, [
      el('span', { className: 'muted', style: 'font-size:12px', textContent: 'Marcadores' }),
      botao('', { classe: 'peq icone', ic: 'anterior', titulo: 'Marcador anterior nesta prancha ( Shift+K )', onclick: () => pularMarcador(-1) }),
      botao('', { classe: 'peq icone', ic: 'proximo', titulo: 'Próximo marcador nesta prancha ( Shift+J )', onclick: () => pularMarcador(1) })
    ])
  ]);

  const colVisor = el('section', { className: 'col-visor' }, [barra, viewport]);
  raiz.append(colLista, colVisor, divisor, detalheCol);
  alvo.replaceChildren(raiz);
  const medicao = criarMedicao({ visor, container: colVisor, prancha: () => prancha });

  const visiveis = () => lacunasFiltradas();
  const marcasDaPrancha = () => estado.lacunas.flatMap((l) => l.marcadores
    .map((m, indice) => ({ id: l.id, status: l.resposta.status, titulo: l.titulo, marcador: m, indice }))
    .filter((x) => x.marcador.prancha === prancha));

  function desenharLista() {
    const lista = visiveis();
    const pend = (n) => new Set(estado.lacunas.filter((l) => !['validada', 'nao_aplicavel'].includes(l.resposta.status) && l.pranchas.includes(n)).map((l) => l.id)).size;
    colLista.replaceChildren(
      el('div', { className: 'miniaturas' }, projeto.pranchas.map((p) => el('button', {
        type: 'button', className: 'mini', 'aria-current': String(p.numero === prancha), title: `Folha ${p.folha} – ${p.titulo}`,
        onclick: () => irParaPrancha(p.numero)
      }, [el('img', { src: urlPrancha(p.miniatura ?? p.imagem), alt: '', loading: 'lazy' }),
        `p.${p.numero} · F${p.folha}`, pend(p.numero) ? el('span', { className: 'bolha', textContent: pend(p.numero) }) : null]))),
      el('div', { className: 'lista-busca' }, [barraFiltros({ compacta: true })]),
      lista.length ? el('ul', { className: 'lista-compacta', role: 'listbox', 'aria-label': 'Lacunas' }, lista.map((l) => el('li', {}, [el('button', {
        type: 'button', className: 'item-lacuna', 'aria-current': String(l.id === ativa), role: 'option', 'aria-selected': String(l.id === ativa),
        onclick: () => selecionar(l.id)
      }, [el('span', { className: 'codigo', textContent: l.id }), el('span', { className: 'tit', textContent: l.titulo }),
        el('span', { className: 'meta' }, [el('i', { className: 'ponto', style: `background:${corStatus(l.resposta.status)}` }),
          `${l.prioridade} · p.${l.pranchas.join(', ')}`])])])))
        : vazio('Nenhuma lacuna', 'Ajuste os filtros.', 'lacunas')
    );
    colLista.querySelector('[aria-current="true"].item-lacuna')?.scrollIntoView({ block: 'nearest' });
  }

  function desenharMarcas() {
    visor.desenharMarcas(marcasDaPrancha(), { ativa, visiveis: estado.temFiltro() ? new Set(visiveis().map((l) => l.id)) : null });
  }

  function desenharDetalhe() {
    raiz.classList.toggle('sem-detalhe', !ativa);
    if (!ativa) { painel = { sujo: () => false }; return; }
    painel = renderizarDetalhe(detalheCol, ativa, {
      aoVerMarcador: (m) => focarMarcador(m),
      aoNavegar: (d) => navegarLacuna(d),
      aoFechar: () => fechar(),
      aoAbrir: (rid) => selecionar(rid)
    });
  }

  async function irParaPrancha(numero) {
    const p = projeto.pranchas.find((x) => x.numero === numero);
    if (!p) return;
    prancha = numero;
    preferencia.gravar('prancha', numero);
    titulo.replaceChildren(`Folha ${p.folha} · ${p.titulo}`, el('small', { textContent: `PDF p.${p.numero} de ${projeto.pranchas.length}` }));
    viewport.append(el('div', { className: 'visor-vazio' }, [el('div', { className: 'giro' })]));
    try {
      await visor.carregar(urlPrancha(p.imagem));
    } catch (erro) {
      avisar(erro.message, { erro: true });
    }
    viewport.querySelector('.visor-vazio')?.remove();
    desenharCamadas();
    desenharMarcas();
    desenharLista();
  }

  async function focarMarcador(m) {
    if (m.prancha !== prancha) await irParaPrancha(m.prancha);
    visor.focar(m);
  }

  async function podeSair() {
    if (!painel.sujo()) return true;
    return confirmar({ titulo: 'Descartar alterações?', texto: 'Há alterações não salvas nesta lacuna.', confirmar: 'Descartar', perigo: true });
  }

  async function selecionar(id, { focar = true } = {}) {
    if (id !== ativa && !(await podeSair())) return;
    if (id !== ativa) estado.definirSincronizacao('ok');
    ativa = id;
    history.replaceState(null, '', `#/pranchas?l=${encodeURIComponent(id)}&p=${prancha}`);
    const l = estado.lacuna(id);
    desenharDetalhe();
    desenharLista();
    desenharMarcas();
    const m = l.marcadores.find((x) => x.prancha === prancha) ?? l.marcadores[0];
    marcadorAtual = marcasDaPrancha().findIndex((x) => x.id === id);
    if (m && focar) await focarMarcador(m);
    else desenharMarcas();
  }

  async function fechar() {
    if (!(await podeSair())) return;
    ativa = null;
    estado.definirSincronizacao('ok');
    history.replaceState(null, '', `#/pranchas?p=${prancha}`);
    desenharDetalhe(); desenharLista(); desenharMarcas();
  }

  function navegarLacuna(delta) {
    const lista = visiveis();
    if (!lista.length) return;
    const i = lista.findIndex((l) => l.id === ativa);
    selecionar(lista[(i + delta + lista.length) % lista.length].id);
  }

  function pularMarcador(delta) {
    const ms = marcasDaPrancha();
    if (!ms.length) return;
    marcadorAtual = (marcadorAtual + delta + ms.length) % ms.length;
    const alvoM = ms[marcadorAtual];
    if (alvoM.id !== ativa) selecionar(alvoM.id, { focar: false }).then(() => visor.focar(alvoM.marcador));
    else visor.focar(alvoM.marcador);
  }

  function trocarPrancha(d) {
    const i = projeto.pranchas.findIndex((p) => p.numero === prancha);
    irParaPrancha(projeto.pranchas[(i + d + projeto.pranchas.length) % projeto.pranchas.length].numero);
  }

  // Divisor redimensionável
  divisor.addEventListener('pointerdown', (e) => {
    divisor.setPointerCapture(e.pointerId);
    divisor.classList.add('ativo');
    const mover = (ev) => {
      const largura = Math.min(720, Math.max(320, raiz.getBoundingClientRect().right - ev.clientX));
      document.documentElement.style.setProperty('--largura-detalhe', `${largura}px`);
    };
    const parar = () => {
      divisor.classList.remove('ativo');
      preferencia.gravar('larguraDetalhe', getComputedStyle(document.documentElement).getPropertyValue('--largura-detalhe').trim());
      divisor.removeEventListener('pointermove', mover);
    };
    divisor.addEventListener('pointermove', mover);
    divisor.addEventListener('pointerup', parar, { once: true });
  });

  const sair = estado.assinar((motivo) => {
    if (motivo === 'filtros') { preservarFoco(desenharLista); desenharMarcas(); }
    if (motivo === 'dados' || motivo === 'resposta') { desenharLista(); desenharMarcas(); desenharCamadas(); if (!painel.sujo()) desenharDetalhe(); }
  });

  desenharDetalhe();
  irParaPrancha(prancha).then(() => { if (ativa) selecionar(ativa); });

  return {
    destruir: () => { sair(); visor.destruir(); },
    podeSair,
    teclas: {
      j: () => navegarLacuna(1), k: () => navegarLacuna(-1),
      J: () => pularMarcador(1), K: () => pularMarcador(-1),
      '[': () => trocarPrancha(-1), ']': () => trocarPrancha(1),
      '+': () => visor.zoomMais(), '=': () => visor.zoomMais(), '-': () => visor.zoomMenos(),
      f: () => visor.ajustar(), 0: () => visor.tamanhoReal(), m: () => medicao.medirArea(),
      d: () => medicao.medirDistancia(), n: () => medicao.novaLacuna(), l: () => medicao.desenharLinha(), t: () => medicao.anotarTexto(),
      Enter: () => medicao.teclas.Enter(),
      Backspace: () => medicao.teclas.Backspace(),
      Escape: () => (medicao.ativo() ? medicao.teclas.Escape() : ativa && fechar()),
      salvar: () => painel.salvarAtalho?.()
    }
  };
}
