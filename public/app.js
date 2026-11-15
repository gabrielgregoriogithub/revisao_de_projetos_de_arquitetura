// Shell do app: navegação por hash, cabeçalho, sincronização e atalhos de teclado.
import { el, $ } from './dom.js';
import { icone, logotipo } from './icones.js';
import { estado } from './estado.js';
import { botao, carregando, vazio, dialogo, avisar } from './componentes.js';
import { aplicarTema } from './tema.js';
import { calcularIndicadores } from '/dominio/indicadores.js';
import * as visaoGeral from './vistas/visao-geral.js';
import * as pranchas from './vistas/pranchas.js';
import * as lacunas from './vistas/lacunas.js';
import * as compat from './vistas/compatibilizacao.js';
import * as orcamento from './vistas/orcamento.js';
import * as ambientes from './vistas/ambientes.js';
import * as revisoes from './vistas/revisoes.js';
import { api } from './api.js';
import { relatorios, projeto, configuracoes, tabelaAtalhos } from './vistas/outras.js';
import { preferencia } from './dom.js';

const ROTAS = [
  { id: 'visao-geral', rotulo: 'Visão geral', ic: 'visao', grupo: 'Análise', montar: visaoGeral.montar },
  { id: 'pranchas', rotulo: 'Pranchas', ic: 'prancha', grupo: 'Análise', montar: pranchas.montar, cheia: true },
  { id: 'lacunas', rotulo: 'Lacunas', ic: 'lacunas', grupo: 'Análise', montar: lacunas.montar, cheia: true, contagem: true },
  { id: 'compatibilizacao', rotulo: 'Compatibilização', ic: 'compat', grupo: 'Análise', montar: compat.montar },
  { id: 'ambientes', rotulo: 'Quadro de ambientes', ic: 'ajustar', grupo: 'Análise', montar: ambientes.montar },
  { id: 'orcamento', rotulo: 'Orçamento / EAP', ic: 'orcamento', grupo: 'Entregas', montar: orcamento.montar },
  { id: 'relatorios', rotulo: 'Relatórios', ic: 'relatorio', grupo: 'Entregas', montar: relatorios },
  { id: 'revisoes', rotulo: 'Revisões', ic: 'historico', grupo: 'Projeto', montar: revisoes.montar },
  { id: 'projeto', rotulo: 'Projeto', ic: 'projeto', grupo: 'Projeto', montar: projeto },
  { id: 'configuracoes', rotulo: 'Configurações', ic: 'config', grupo: 'Projeto', montar: configuracoes }
];
const ATALHO_G = { v: 'visao-geral', p: 'pranchas', l: 'lacunas', c: 'compatibilizacao', o: 'orcamento', r: 'relatorios' };

let vistaAtual = null;
let rotaAtual = null;

function lerHash() {
  const [caminho, query = ''] = location.hash.replace(/^#\/?/, '').split('?');
  return { id: ROTAS.some((r) => r.id === caminho) ? caminho : 'visao-geral', params: new URLSearchParams(query) };
}

export function navegar(id, params = {}) {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== null && v !== undefined)).toString();
  location.hash = `#/${id}${qs ? `?${qs}` : ''}`;
}

function desenharNav() {
  const pendentes = estado.lacunas.filter((l) => ['aberta', 'reaberta'].includes(l.resposta.status)).length;
  const grupos = [...new Set(ROTAS.map((r) => r.grupo))];
  $('#nav').replaceChildren(...grupos.flatMap((g) => [
    el('div', { className: 'nav-grupo', textContent: g }),
    ...ROTAS.filter((r) => r.grupo === g).map((r) => el('a', {
      href: `#/${r.id}`, 'aria-current': r.id === rotaAtual ? 'page' : undefined, onclick: () => $('#app').classList.remove('menu-aberto')
    }, [icone(r.ic), r.rotulo, r.contagem && pendentes ? el('span', { className: 'contagem', textContent: pendentes, title: 'Abertas' }) : null]))
  ]));
}

function desenharTopo() {
  const p = estado.projeto;
  const ind = calcularIndicadores(p, estado.lacunas, estado.eventos);
  $('#topo-nome').textContent = p.nome;
  $('#topo-obra').textContent = `${p.obra ?? ''} · ${p.etapa}`;
  $('#topo-progresso').replaceChildren(
    el('span', { className: 'rotulo-prog', textContent: `${ind.percentualResolucao}% resolvido` }),
    el('div', { className: 'trilho', title: `${ind.validadas} validadas, ${ind.naoAplicaveis} não aplicáveis, ${ind.comResposta} com resposta` }, [
      el('i', { style: `width:${ind.percentualResolucao}%;background:var(--verde-escuro)` }),
      el('i', { style: `width:${Math.max(0, ind.percentualRespondidas - ind.percentualResolucao)}%;background:var(--verde);opacity:.5` })
    ]),
    el('span', { textContent: `${ind.abertas} abertas` })
  );
  $('#sidebar-rodape').textContent = `${p.pranchas.length} pranchas · ${estado.lacunas.length} lacunas · análise ${p.analisadoEm}`;
}

function desenharSync() {
  const s = estado.sincronizacao;
  const textos = { ok: 'Sincronizado', salvando: 'Salvando…', erro: 'Erro ao salvar', sujo: 'Alterações não salvas' };
  const no = $('#sync');
  no.dataset.estado = s;
  no.textContent = textos[s] ?? s;
}

async function trocarVista() {
  const { id, params } = lerHash();
  if (vistaAtual?.podeSair && id !== rotaAtual && !(await vistaAtual.podeSair())) {
    history.replaceState(null, '', `#/${rotaAtual}`);
    return;
  }
  vistaAtual?.destruir?.();
  rotaAtual = id;
  estado.definirSincronizacao('ok');
  const rota = ROTAS.find((r) => r.id === id);
  const alvo = $('#vista');
  alvo.style.overflow = rota.cheia ? 'hidden' : 'auto';
  alvo.replaceChildren();
  document.title = `${rota.rotulo} · Lacunas.obra`;
  desenharNav();
  try {
    vistaAtual = rota.montar(alvo, { navegar, params }) ?? {};
  } catch (erro) {
    alvo.replaceChildren(vazio('Erro ao abrir a tela', erro.message, 'alerta'));
    vistaAtual = {};
  }
  alvo.scrollTop = 0;
}

let esperaG = false;
function teclado(e) {
  const t = e.target;
  const digitando = t instanceof HTMLElement && (t.matches('input, textarea, select') || t.isContentEditable);
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault();
    vistaAtual?.teclas?.salvar?.();
    return;
  }
  if (!digitando && (e.key === 'Enter' || e.key === 'Backspace') && vistaAtual?.teclas?.[e.key] && !document.querySelector('dialog[open]')) {
    if (vistaAtual.teclas[e.key]() !== false) e.preventDefault();
    return;
  }
  if (digitando || e.altKey || e.ctrlKey || e.metaKey || document.querySelector('dialog[open]')) {
    if (e.key === 'Escape' && digitando) t.blur();
    return;
  }
  if (esperaG) {
    esperaG = false;
    if (ATALHO_G[e.key]) { e.preventDefault(); navegar(ATALHO_G[e.key]); }
    return;
  }
  if (e.key === 'g') { esperaG = true; setTimeout(() => { esperaG = false; }, 1200); return; }
  if (e.key === '/') { const b = $('#busca-lacunas'); if (b) { e.preventDefault(); b.focus(); } return; }
  if (e.key === '?') { dialogo('Atalhos de teclado', tabelaAtalhos()); return; }
  const fn = vistaAtual?.teclas?.[e.key];
  if (fn) { e.preventDefault(); fn(); }
}

async function iniciar() {
  aplicarTema();
  const larg = preferencia.ler('larguraDetalhe', null);
  if (larg) document.documentElement.style.setProperty('--largura-detalhe', larg);
  $('#logo').prepend(logotipo());
  const menu = $('#botao-menu');
  menu.append(icone('menu'));
  menu.onclick = () => {
    const aberto = $('#app').classList.toggle('menu-aberto');
    menu.setAttribute('aria-expanded', String(aberto));
  };
  $('#app').addEventListener('click', (e) => { if (e.target === $('#app')) $('#app').classList.remove('menu-aberto'); });
  api.projetos().then(({ ativo, projetos }) => {
    if (projetos.length < 2) return;
    const sel = el('select', { className: 'entrada', 'aria-label': 'Projeto / revisão', style: 'width:auto;min-height:30px;padding:3px 8px;font-size:12px' },
      projetos.map((p) => el('option', { value: p.id, selected: p.id === ativo, textContent: `${p.nome} · ${p.revisao ?? p.etapa}` })));
    sel.onchange = async () => {
      if (vistaAtual?.podeSair && !(await vistaAtual.podeSair())) { sel.value = ativo; return; }
      try { await api.definirProjeto(sel.value); location.hash = '#/visao-geral'; location.reload(); } catch (erro) { avisar(erro.message, { erro: true }); sel.value = ativo; }
    };
    $('#topo-acoes').prepend(sel);
  }).catch(() => {});
  $('#topo-acoes').append(botao('Atalhos', { classe: 'fantasma peq', ic: 'teclado', titulo: 'Atalhos de teclado (?)', onclick: () => dialogo('Atalhos de teclado', tabelaAtalhos()) }));
  $('#vista').replaceChildren(carregando('Carregando projeto…'));

  try {
    await estado.carregar();
  } catch (erro) {
    $('#vista').replaceChildren(vazio('Não foi possível carregar o projeto', erro.message, 'alerta'));
    $('#topo-nome').textContent = 'Falha ao carregar';
    return;
  }
  desenharTopo();
  estado.assinar((m) => {
    if (m === 'dados' || m === 'resposta') { desenharTopo(); desenharNav(); }
    if (m === 'sync') desenharSync();
  });
  window.addEventListener('hashchange', trocarVista);
  window.addEventListener('keydown', teclado);
  // Sincronização com mudanças feitas fora do app (Claude Code): ao focar a aba e a cada 5 s.
  let verificando = false;
  const verificar = async () => {
    if (verificando || document.hidden) return;
    verificando = true;
    try {
      if (await estado.verificarMudancasExternas()) avisar('Dados atualizados: houve alterações fora do app (ex.: processamento do Claude Code).');
      if (estado.sincronizacao === 'erro') estado.definirSincronizacao('ok');
    } catch {
      estado.definirSincronizacao('erro');
    } finally {
      verificando = false;
    }
  };
  window.addEventListener('focus', verificar);
  document.addEventListener('visibilitychange', verificar);
  setInterval(verificar, 5000);
  window.addEventListener('beforeunload', (e) => { if (estado.sincronizacao === 'sujo') { e.preventDefault(); e.returnValue = ''; } });
  trocarVista();
}

iniciar();
