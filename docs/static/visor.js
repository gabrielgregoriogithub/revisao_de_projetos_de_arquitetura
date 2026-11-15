// Visualizador de pranchas: zoom ancorado no cursor/pinça, arraste, ajuste, 100% e marcadores.
// Marcadores ficam dentro do mesmo "palco" transformado da imagem, então nunca se deslocam dela.
import { el, svg } from './dom.js';

const ZOOM_MAX = 2;
const PASSO = 1.2;

/**
 * @param {{viewport:HTMLElement, referencia:{largura:number,altura:number},
 *   aoClicarMarca:(id:string)=>void, aoMudarZoom?:(escala:number, ajuste:number)=>void}} opcoes
 */
export function criarVisor({ viewport, referencia, aoClicarMarca, aoMudarZoom = () => {}, aoClicarAnotacao = () => {} }) {
  const img = el('img', { alt: 'Prancha do projeto', draggable: false, decoding: 'async' });
  const marcas = el('div', { className: 'marcas' });
  const camadas = svg('svg', { class: 'camadas', viewBox: `0 0 ${referencia.largura} ${referencia.altura}`, preserveAspectRatio: 'none' });
  const palco = el('div', { className: 'palco' }, [img, camadas, marcas]);
  viewport.replaceChildren(palco);

  let estado = { x: 0, y: 0, escala: 0.1 };
  let escalaAjuste = 0.1;
  const ponteiros = new Map();
  let gesto = null;

  const aplicar = () => {
    palco.style.transform = `translate(${estado.x}px, ${estado.y}px) scale(${estado.escala})`;
    palco.style.setProperty('--inv', String(1 / estado.escala));
    aoMudarZoom(estado.escala, escalaAjuste);
    if (typeof redesenharCamadas === 'function' && (base.ambientes.length || base.palavras.length || base.anotacoes.length || modo)) redesenharCamadas();
  };
  const limitar = (e) => Math.min(ZOOM_MAX, Math.max(escalaAjuste * 0.5, e));

  function zoomEm(fator, cx, cy) {
    const escala = limitar(estado.escala * fator);
    const k = escala / estado.escala;
    estado = { escala, x: cx - (cx - estado.x) * k, y: cy - (cy - estado.y) * k };
    aplicar();
  }

  function ajustar() {
    if (!img.naturalWidth) return;
    const { clientWidth: w, clientHeight: h } = viewport;
    escalaAjuste = Math.min(w / img.naturalWidth, h / img.naturalHeight) * 0.96;
    estado = { escala: escalaAjuste, x: (w - img.naturalWidth * escalaAjuste) / 2, y: (h - img.naturalHeight * escalaAjuste) / 2 };
    aplicar();
  }

  /** 100%: um pixel da imagem por pixel de tela, centrado no meio da vista atual. */
  function tamanhoReal() {
    const { clientWidth: w, clientHeight: h } = viewport;
    zoomEm(1 / estado.escala, w / 2, h / 2);
  }

  /** Centraliza e amplia um marcador (coordenadas no sistema de referência). */
  function focar(m) {
    const f = img.naturalWidth / referencia.largura;
    const { clientWidth: w, clientHeight: h } = viewport;
    const alvoW = Math.max(m.w * f, 140 * f);
    const alvoH = Math.max(m.h * f, 140 * f);
    const escala = Math.min(ZOOM_MAX * 0.6, Math.max(escalaAjuste, Math.min(w / (alvoW * 3.2), h / (alvoH * 3.2))));
    const cx = (m.x + m.w / 2) * f;
    const cy = (m.y + m.h / 2) * f;
    estado = { escala, x: w / 2 - cx * escala, y: h / 2 - cy * escala };
    palco.style.transition = 'transform 280ms cubic-bezier(.2,.7,.2,1)';
    aplicar();
    setTimeout(() => { palco.style.transition = ''; }, 300);
  }

  function carregar(src) {
    return new Promise((resolve, reject) => {
      img.onload = () => {
        for (const c of [marcas, camadas]) {
          c.style.width = `${img.naturalWidth}px`;
          c.style.height = `${img.naturalHeight}px`;
        }
        ajustar();
        resolve();
      };
      img.onerror = () => reject(new Error('Não foi possível carregar a imagem da prancha.'));
      img.src = src;
    });
  }

  /** @param {{id:string,status:string,titulo:string,marcador:object,indice:number}[]} itens */
  function desenharMarcas(itens, { ativa = null, visiveis = null } = {}) {
    const pct = (v, total) => `${(v / total) * 100}%`;
    marcas.replaceChildren(...itens.map(({ id, status, titulo, marcador: m, indice }) => {
      const b = el('button', {
        type: 'button',
        className: `marcador m-${status}${id === ativa ? ' ativo' : ''}${visiveis && !visiveis.has(id) ? ' esmaecido' : ''}`,
        'aria-label': `${id}: ${titulo}`,
        'data-id': id,
        style: `left:${pct(m.x, referencia.largura)};top:${pct(m.y, referencia.altura)};width:${pct(m.w, referencia.largura)};height:${pct(m.h, referencia.altura)}`
      }, [el('span', { className: 'rot' }, [`${id}${indice > 0 ? `·${indice + 1}` : ''}`, el('em', { textContent: titulo })])]);
      b.addEventListener('pointerdown', (e) => e.stopPropagation());
      b.addEventListener('click', () => aoClicarMarca(id));
      return b;
    }));
  }

  // ── Camadas (ambientes medidos, texto do PDF) e modos de medição ──
  let modo = null; // null | { tipo:'area'|'calibrar', pontos:[], aoConcluir }
  let base = { ambientes: [], palavras: [], anotacoes: [], destaque: null };

  /** Converte coordenadas de tela em coordenadas de referência da prancha. */
  function paraRef(clientX, clientY) {
    const r = viewport.getBoundingClientRect();
    const f = referencia.largura / img.naturalWidth;
    return [((clientX - r.left - estado.x) / estado.escala) * f, ((clientY - r.top - estado.y) / estado.escala) * f];
  }

  function redesenharCamadas() {
    const inv = (1 / estado.escala) * (referencia.largura / (img.naturalWidth || referencia.largura));
    const pts = (p) => p.map(([x, y]) => `${x},${y}`).join(' ');
    const filhos = [
      ...base.ambientes.flatMap((a) => a.poligonos.map((p) => svg('polygon', {
        class: `amb${a.id === base.destaque ? ' destaque' : ''}`, points: pts(p.pontos), 'stroke-width': 2 * inv
      }, [svg('title', {}, [document.createTextNode(`${a.id} · ${a.nome}${a.medida?.area ? ` · ${a.medida.area} m²` : ''}`)])]))),
      ...base.palavras.map((w) => svg('rect', { class: 'txt-pdf', x: w.x, y: w.y, width: Math.max(w.w, 1), height: Math.max(w.h, 1), 'stroke-width': 1 * inv },
        [svg('title', {}, [document.createTextNode(`Texto do PDF: "${w.texto}" (posição exata)`)])])),
      ...base.anotacoes.flatMap((a) => {
        const titulo = svg('title', {}, [document.createTextNode(`${a.rotulo ?? a.texto ?? ''} — clique para excluir`)]);
        const clique = (no) => { no.addEventListener('pointerdown', (e) => e.stopPropagation()); no.addEventListener('click', () => aoClicarAnotacao(a)); return no; };
        if (a.tipo === 'texto') {
          const [x, y] = a.pontos[0];
          return [clique(svg('text', { class: 'anot-texto', x, y, 'font-size': 14 * inv }, [document.createTextNode(a.texto), titulo]))];
        }
        const [[x1, y1], [x2, y2]] = a.pontos;
        return [
          clique(svg('line', { class: `anot-linha${a.tipo === 'cota' ? ' cota' : ''}`, x1, y1, x2, y2, 'stroke-width': 2.5 * inv }, [titulo])),
          a.rotulo ? clique(svg('text', { class: 'anot-texto', x: (x1 + x2) / 2, y: (y1 + y2) / 2 - 6 * inv, 'font-size': 13 * inv, 'text-anchor': 'middle' }, [document.createTextNode(a.rotulo)])) : null
        ].filter(Boolean);
      })
    ];
    if (modo?.pontos.length) {
      const fechado = modo.tipo === 'area' && modo.pontos.length > 2;
      filhos.push(svg(fechado ? 'polygon' : 'polyline', { class: 'medindo', points: pts(modo.pontos), 'stroke-width': 2 * inv }));
      filhos.push(...modo.pontos.map(([x, y]) => svg('circle', { class: 'vertice', cx: x, cy: y, r: 4 * inv })));
    }
    camadas.replaceChildren(...filhos);
  }

  function definirCamadas({ ambientes = [], palavras = [], anotacoes = [], destaque = null }) {
    base = { ambientes, palavras, anotacoes, destaque };
    redesenharCamadas();
  }

  /** Entra num modo de medição. aoMudar(pontos) é chamado a cada vértice; o chamador decide quando concluir. */
  function iniciarMedicao(tipo, aoMudar) {
    modo = { tipo, pontos: [], aoMudar };
    viewport.classList.add('medindo');
    redesenharCamadas();
  }
  function encerrarMedicao() {
    const pontos = modo?.pontos ?? [];
    modo = null;
    viewport.classList.remove('medindo');
    redesenharCamadas();
    return pontos;
  }
  function desfazerVertice() {
    if (!modo?.pontos.length) return;
    modo.pontos = modo.pontos.slice(0, -1);
    modo.aoMudar(modo.pontos);
    redesenharCamadas();
  }

  let inicioClique = null;
  viewport.addEventListener('pointerdown', (e) => { inicioClique = { x: e.clientX, y: e.clientY }; }, true);
  viewport.addEventListener('pointerup', (e) => {
    if (!modo || !inicioClique || Math.hypot(e.clientX - inicioClique.x, e.clientY - inicioClique.y) > 4) return;
    const [x, y] = paraRef(e.clientX, e.clientY);
    if (x < 0 || y < 0 || x > referencia.largura || y > referencia.altura) return;
    modo.pontos = [...modo.pontos, [Math.round(x * 100) / 100, Math.round(y * 100) / 100]];
    modo.aoMudar(modo.pontos);
    redesenharCamadas();
  });

  // Roda do mouse: zoom no cursor
  viewport.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = viewport.getBoundingClientRect();
    const fator = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0022));
    zoomEm(fator, e.clientX - r.left, e.clientY - r.top);
  }, { passive: false });

  // Arraste (1 ponteiro) e pinça (2 ponteiros)
  viewport.addEventListener('pointerdown', (e) => {
    viewport.setPointerCapture(e.pointerId);
    ponteiros.set(e.pointerId, { x: e.clientX, y: e.clientY });
    viewport.classList.add('arrastando');
    gesto = null;
  });
  viewport.addEventListener('pointermove', (e) => {
    if (!ponteiros.has(e.pointerId)) return;
    const antes = [...ponteiros.values()];
    ponteiros.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const agora = [...ponteiros.values()];
    if (agora.length === 1) {
      estado = { ...estado, x: estado.x + agora[0].x - antes[0].x, y: estado.y + agora[0].y - antes[0].y };
      aplicar();
    } else if (agora.length === 2) {
      const dist = (p) => Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
      const r = viewport.getBoundingClientRect();
      const cx = (agora[0].x + agora[1].x) / 2 - r.left;
      const cy = (agora[0].y + agora[1].y) / 2 - r.top;
      if (gesto) zoomEm(dist(agora) / gesto, cx, cy);
      gesto = dist(agora);
    }
  });
  const soltar = (e) => {
    ponteiros.delete(e.pointerId);
    if (ponteiros.size < 2) gesto = null;
    if (!ponteiros.size) viewport.classList.remove('arrastando');
  };
  viewport.addEventListener('pointerup', soltar);
  viewport.addEventListener('pointercancel', soltar);

  const observador = new ResizeObserver(() => { if (Math.abs(estado.escala - escalaAjuste) < 1e-6) ajustar(); });
  observador.observe(viewport);

  const centro = () => [viewport.clientWidth / 2, viewport.clientHeight / 2];
  return {
    carregar, ajustar, focar, tamanhoReal, desenharMarcas, definirCamadas, iniciarMedicao, encerrarMedicao, desfazerVertice,
    emMedicao: () => Boolean(modo),
    zoomMais: () => zoomEm(PASSO, ...centro()),
    zoomMenos: () => zoomEm(1 / PASSO, ...centro()),
    destruir: () => observador.disconnect()
  };
}
