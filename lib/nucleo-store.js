// Núcleo do store: validação, workflow, histórico, ambientes, escala e anotações — sem dependência de Node.
import { STATUS, transicaoPermitida, STATUS_INFO } from './dominio/status.js';
import { normalizarLacuna, verificarIntegridade, anotarPrecisao } from './dominio/lacunas.js';
import { INCERTEZAS } from './dominio/impacto.js';
import { medirAmbiente } from './dominio/geometria.js';
import { lerNumeroBr } from './dominio/numeros.js';
import { ID_ANEXO, limparNome } from './dominio/anexo-id.js';

export { STATUS };
export const VERSAO_ESQUEMA = 2;
export const TIPOS_EVIDENCIA = ['documento', 'email', 'reuniao', 'prancha', 'foto', 'outro'];

const MAX_TEXTO = 2000;
const MAX_CURTO = 300;
const MAX_EVIDENCIAS = 20;

const respostaVazia = () => ({ status: 'aberta', campos: {}, observacao: '', revisao: 0 });
const texto = (v) => (typeof v === 'string' ? v.trim() : '');
const falha = (erro) => ({ ok: false, erro });

function validarNumero(v, nome) {
  if (v === null || v === undefined || v === '') return { ok: true, valor: null };
  const n = lerNumeroBr(v);
  if (!Number.isFinite(n) || n < 0 || n > 1e12) return falha(`${nome} deve ser um número não negativo.`);
  return { ok: true, valor: n };
}

function validarImpacto(impacto) {
  if (impacto === undefined || impacto === null) return { ok: true, valor: undefined };
  if (typeof impacto !== 'object') return falha('Impacto inválido.');
  const valor = {};
  for (const k of ['servico', 'material', 'unidade', 'origemQuantidade']) {
    valor[k] = texto(impacto[k]) || null;
    if ((valor[k] ?? '').length > MAX_CURTO) return falha(`Impacto: ${k} longo demais.`);
  }
  for (const [k, nome] of [['quantidade', 'Quantidade'], ['custoUnitario', 'Custo unitário'], ['valorEstimado', 'Valor estimado']]) {
    const n = validarNumero(impacto[k], nome);
    if (!n.ok) return n;
    valor[k] = n.valor;
  }
  valor.incerteza = INCERTEZAS[impacto.incerteza] ? impacto.incerteza : 'alta';
  valor.justificativa = texto(impacto.justificativa) || null;
  if ((valor.justificativa ?? '').length > MAX_TEXTO) return falha('Justificativa longa demais.');
  if (valor.valorEstimado !== null && !valor.justificativa) return falha('Valor estimado exige justificativa.');
  return { ok: true, valor };
}

function validarEvidencias(lista) {
  if (lista === undefined) return { ok: true, valor: [] };
  if (!Array.isArray(lista) || lista.length > MAX_EVIDENCIAS) return falha(`Evidências: envie uma lista de até ${MAX_EVIDENCIAS}.`);
  const valor = [];
  for (const e of lista) {
    if (!e || typeof e !== 'object') return falha('Evidência inválida.');
    const item = {
      tipo: TIPOS_EVIDENCIA.includes(e.tipo) ? e.tipo : 'outro',
      descricao: texto(e.descricao),
      referencia: texto(e.referencia) || null,
      data: texto(e.data) || null
    };
    if (e.anexo) {
      const a = e.anexo;
      if (!ID_ANEXO.test(a.id ?? '') || !/^[0-9a-f]{64}$/.test(a.sha256 ?? '') || !Number.isInteger(a.tamanho)) return falha('Anexo da evidência inválido.');
      item.anexo = { id: a.id, nome: limparNome(a.nome), tipo: a.id.split('.').pop(), tamanho: a.tamanho, sha256: a.sha256, enviadoEm: texto(a.enviadoEm) || null };
    }
    if (!item.descricao) return falha('Toda evidência precisa de descrição.');
    if (item.descricao.length > 500 || (item.referencia ?? '').length > MAX_CURTO || (item.data ?? '').length > 30) {
      return falha('Evidência com texto longo demais.');
    }
    valor.push(item);
  }
  return { ok: true, valor };
}

/**
 * Valida o corpo enviado para uma lacuna. Mantém só as chaves de campo que a lacuna declara.
 * Regras que dependem do status anterior (transições, revisão) ficam no store.
 * @returns {{ok:true,valor:object}|{ok:false,erro:string}}
 */
export function validarResposta(lacuna, corpo) {
  if (!corpo || typeof corpo !== 'object') return falha('Corpo inválido.');
  const { status, campos = {}, observacao = '' } = corpo;

  if (!STATUS.includes(status)) return falha(`Status inválido: use ${STATUS.join(', ')}.`);
  if (typeof campos !== 'object' || campos === null) return falha('Campos inválidos.');

  const limpos = Object.fromEntries(lacuna.campos.map((c) => [c.chave, texto(campos[c.chave])]));
  const obs = texto(observacao);
  const responsavel = texto(corpo.responsavel);
  const notaValidacao = texto(corpo.notaValidacao);
  const todos = [...Object.values(limpos), obs, notaValidacao];

  if (todos.some((t) => t.length > MAX_TEXTO)) return falha(`Texto acima de ${MAX_TEXTO} caracteres.`);
  if (responsavel.length > 120) return falha('Responsável longo demais.');

  const evidencias = validarEvidencias(corpo.evidencias);
  if (!evidencias.ok) return evidencias;
  const impacto = validarImpacto(corpo.impacto);
  if (!impacto.ok) return impacto;

  if (status === 'respondida' && [...Object.values(limpos), obs].every((t) => t === '')) {
    return falha('Preencha ao menos um campo ou uma observação para responder.');
  }
  if (status === 'nao_aplicavel' && !obs) return falha('Para arquivar como "não aplicável", explique o motivo na observação.');
  if (status === 'validada' && (!notaValidacao || !evidencias.valor.length)) {
    return falha('Validar exige uma nota de validação e ao menos uma evidência (documento, e-mail, reunião…).');
  }

  const valor = { status, campos: limpos, observacao: obs, responsavel, evidencias: evidencias.valor, notaValidacao };
  if (impacto.valor !== undefined) valor.impacto = impacto.valor;
  return { ok: true, valor };
}

/** Junta lacunas (normalizadas) e respostas sem mutar as entradas. */
export function mesclarLacunas(lacunas, respostas, projeto = {}) {
  return lacunas.map((l) => ({
    ...normalizarLacuna(l, projeto),
    resposta: { ...respostaVazia(), ...(respostas[l.id] ?? {}) }
  }));
}

/** Lista as alterações entre duas respostas (para o histórico). */
export function diferencas(antes, depois) {
  const alteracoes = [];
  const comparar = (campo, a, b) => {
    const sa = JSON.stringify(a ?? null);
    const sb = JSON.stringify(b ?? null);
    if (sa !== sb) alteracoes.push({ campo, antes: a ?? null, depois: b ?? null });
  };
  comparar('status', antes.status, depois.status);
  const chaves = new Set([...Object.keys(antes.campos ?? {}), ...Object.keys(depois.campos ?? {})]);
  for (const k of chaves) comparar(`campos.${k}`, antes.campos?.[k] || null, depois.campos?.[k] || null);
  for (const k of ['observacao', 'responsavel', 'notaValidacao']) comparar(k, antes[k] || null, depois[k] || null);
  comparar('evidencias', antes.evidencias ?? [], depois.evidencias ?? []);
  if (depois.impacto !== undefined) comparar('impacto', antes.impacto ?? null, depois.impacto);
  return alteracoes;
}

const uuid = () => globalThis.crypto.randomUUID();

/**
 * Núcleo do store, independente de onde os dados ficam (disco no Node, IndexedDB no navegador).
 * @param {{ler:(nome:string,padrao?:any)=>Promise<any>, gravar:(nome:string,dados:any)=>Promise<void>,
 *   backup:(nome:string)=>Promise<string|null>, versao:(nomes:string[])=>Promise<string>, anexoExiste:(id:string)=>Promise<boolean>}} arm
 */
export function criarNucleo(arm) {
  let fila = Promise.resolve(); // serializa todas as gravações
  let migrado = false;

  const enfileirar = (fn) => {
    const tarefa = fila.then(fn);
    fila = tarefa.catch(() => {});
    return tarefa;
  };

  const backup = (nome) => arm.backup(nome);

  /** Migra respostas.json do esquema 1 (sem revisão) para o 2, com backup antes. */
  async function garantirEsquema() {
    if (migrado) return;
    const esquema = await arm.ler('esquema.json', { versao: 1 });
    if (esquema.versao < VERSAO_ESQUEMA) {
      const respostas = await arm.ler('respostas.json', null);
      if (respostas) {
        await backup('respostas.json');
        const migradas = Object.fromEntries(Object.entries(respostas).map(([id, r]) => [id, { ...r, revisao: r.revisao ?? 1 }]));
        await arm.gravar('respostas.json', migradas);
      }
      await arm.gravar('esquema.json', { versao: VERSAO_ESQUEMA, migradoEm: new Date().toISOString(), de: esquema.versao });
    }
    migrado = true;
  }

  async function lerHistorico() {
    const h = await arm.ler('historico.json', { versao: 1, eventos: [] });
    return Array.isArray(h.eventos) ? h : { versao: 1, eventos: [] };
  }

  async function carregar() {
    await enfileirar(garantirEsquema);
    const [projeto, lacunas, respostas, historico, ambientes, textoPdf] = await Promise.all([
      arm.ler('projeto.json'),
      arm.ler('lacunas.json'),
      arm.ler('respostas.json', {}),
      lerHistorico(),
      arm.ler('ambientes.json', []),
      arm.ler('texto-pdf.json', null)
    ]);
    const anotacoes = await arm.ler('anotacoes.json', []);
    return {
      projeto,
      lacunas: mesclarLacunas(lacunas, respostas, projeto).map((l) => anotarPrecisao(l, textoPdf)),
      integridade: verificarIntegridade(projeto, lacunas),
      eventos: historico.eventos,
      ambientes: ambientes.map((a) => ({ ...a, medida: medirAmbiente(projeto, a) })),
      anotacoes,
      textoPdf
    };
  }

  /** Registra um evento que não é de lacuna (ambiente, escala) no histórico. */
  async function registrar(evento) {
    const h = await lerHistorico();
    await arm.gravar('historico.json', { versao: 1, eventos: [...h.eventos, { id: uuid(), em: new Date().toISOString(), lacuna: null, ...evento }] });
  }

  function validarAmbiente(projeto, corpo) {
    if (!corpo || typeof corpo !== 'object') return falha('Corpo inválido.');
    const nome = texto(corpo.nome);
    if (!nome || nome.length > 80) return falha('Informe o nome do ambiente (até 80 caracteres).');
    const pd = corpo.pd === null || corpo.pd === undefined || corpo.pd === '' ? null : lerNumeroBr(corpo.pd);
    if (pd !== null && (!Number.isFinite(pd) || pd <= 0 || pd > 50)) return falha('Pé-direito inválido.');
    if (!Array.isArray(corpo.poligonos) || corpo.poligonos.length > 50) return falha('Polígonos inválidos.');
    const ref = projeto.referencia;
    const numeros = new Set(projeto.pranchas.map((p) => p.numero));
    const poligonos = [];
    for (const p of corpo.poligonos) {
      if (!numeros.has(p?.prancha)) return falha('Polígono aponta para prancha inexistente.');
      if (!Array.isArray(p.pontos) || p.pontos.length < 3 || p.pontos.length > 200) return falha('Cada polígono precisa de 3 a 200 vértices.');
      const pontos = p.pontos.map((pt) => (Array.isArray(pt) ? pt.map(Number) : []));
      if (!pontos.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y) && x >= 0 && y >= 0 && x <= ref.largura && y <= ref.altura)) {
        return falha('Vértice fora dos limites da prancha.');
      }
      poligonos.push({ prancha: p.prancha, pontos: pontos.map(([x, y]) => [Math.round(x * 100) / 100, Math.round(y * 100) / 100]) });
    }
    const observacao = texto(corpo.observacao);
    if (observacao.length > 500) return falha('Observação longa demais.');
    return { ok: true, valor: { nome, pd, poligonos, observacao } };
  }

  /** Cria (id nulo) ou atualiza um ambiente do quadro. */
  const salvarAmbiente = (id, corpo, { autor = null } = {}) => enfileirar(async () => {
    const projeto = await arm.ler('projeto.json');
    const v = validarAmbiente(projeto, corpo);
    if (!v.ok) return { ok: false, codigo: 400, erro: v.erro };
    const lista = await arm.ler('ambientes.json', []);
    const agora = new Date().toISOString();
    let anterior = null;
    let novo;
    if (id) {
      anterior = lista.find((a) => a.id === id);
      if (!anterior) return { ok: false, codigo: 404, erro: `Ambiente ${id} não encontrado.` };
      novo = { ...anterior, ...v.valor, atualizadoEm: agora };
    } else {
      // IDs nunca são reaproveitados: considera também ambientes já excluídos (registrados no histórico).
      const { eventos } = await lerHistorico();
      const usados = [...lista.map((a) => a.id), ...eventos.map((e) => e.ambiente).filter(Boolean)];
      const maior = Math.max(0, ...usados.map((x) => Number(String(x).slice(1)) || 0));
      novo = { id: `A${String(maior + 1).padStart(2, '0')}`, ...v.valor, origem: 'medido no app sobre a prancha', criadoEm: agora, atualizadoEm: agora };
    }
    await arm.gravar('ambientes.json', id ? lista.map((a) => (a.id === id ? novo : a)) : [...lista, novo]);
    await registrar({ ambiente: novo.id, origem: 'app', autor, acao: id ? 'ambiente-alterado' : 'ambiente-criado', alteracoes: diferencasAmbiente(anterior, novo) });
    return { ok: true, ambiente: { ...novo, medida: medirAmbiente(projeto, novo) } };
  });

  const excluirAmbiente = (id, { autor = null } = {}) => enfileirar(async () => {
    const lista = await arm.ler('ambientes.json', []);
    const alvo = lista.find((a) => a.id === id);
    if (!alvo) return { ok: false, codigo: 404, erro: `Ambiente ${id} não encontrado.` };
    await backup('ambientes.json');
    await arm.gravar('ambientes.json', lista.filter((a) => a.id !== id));
    await registrar({ ambiente: id, origem: 'app', autor, acao: 'ambiente-excluido', alteracoes: [{ campo: 'ambiente', antes: alvo, depois: null }] });
    return { ok: true };
  });

  /** Calibra a escala do projeto (prancha nula) ou de uma prancha. Faz backup do projeto.json. */
  const definirEscala = (prancha, corpo, { autor = null } = {}) => enfileirar(async () => {
    const metrosPorRef = Number(corpo?.metrosPorRef);
    const origem = texto(corpo?.origem);
    if (!Number.isFinite(metrosPorRef) || metrosPorRef <= 0 || metrosPorRef > 10) return { ok: false, codigo: 400, erro: 'Escala inválida.' };
    if (!origem || origem.length > 300) return { ok: false, codigo: 400, erro: 'Descreva a origem da escala (ex.: cota de 4,50 m conferida na prancha).' };
    const projeto = await arm.ler('projeto.json');
    if (prancha !== null && !projeto.pranchas.some((p) => p.numero === prancha)) return { ok: false, codigo: 404, erro: 'Prancha inexistente.' };
    const { denominador, ...escalaAnterior } = projeto.escala ?? {}; // denominador deixa de valer após calibrar
    const escala = { ...escalaAnterior, metrosPorRef, origem, calibrada: corpo.calibrada !== false, atualizadaEm: new Date().toISOString() };
    const novo = prancha === null
      ? { ...projeto, escala }
      : { ...projeto, pranchas: projeto.pranchas.map((p) => (p.numero === prancha ? { ...p, escala } : p)) };
    await backup('projeto.json');
    await arm.gravar('projeto.json', novo);
    const antes = prancha === null ? projeto.escala : projeto.pranchas.find((p) => p.numero === prancha).escala;
    await registrar({ origem: 'app', autor, acao: 'escala', prancha, alteracoes: [{ campo: 'escala', antes: antes ?? null, depois: escala }] });
    return { ok: true, escala };
  });

  /** Anotações sobre a prancha (texto, linha, cota de distância). */
  const criarAnotacao = (corpo, { autor = null } = {}) => enfileirar(async () => {
    const projeto = await arm.ler('projeto.json');
    const tipo = corpo?.tipo;
    if (!['texto', 'linha', 'cota'].includes(tipo)) return { ok: false, codigo: 400, erro: 'Tipo de anotação inválido (texto, linha ou cota).' };
    if (!projeto.pranchas.some((p) => p.numero === corpo.prancha)) return { ok: false, codigo: 400, erro: 'Prancha inexistente.' };
    const n = tipo === 'texto' ? 1 : 2;
    const ref = projeto.referencia;
    const pontos = Array.isArray(corpo.pontos) ? corpo.pontos.slice(0, n).map((p) => (Array.isArray(p) ? p.map(Number) : [])) : [];
    if (pontos.length !== n || !pontos.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y) && x >= 0 && y >= 0 && x <= ref.largura && y <= ref.altura)) {
      return { ok: false, codigo: 400, erro: `A anotação "${tipo}" precisa de ${n} ponto(s) dentro da prancha.` };
    }
    const txt = texto(corpo.texto);
    if (tipo === 'texto' && !txt) return { ok: false, codigo: 400, erro: 'Escreva o texto da anotação.' };
    if (txt.length > 300) return { ok: false, codigo: 400, erro: 'Texto da anotação longo demais (300).' };
    const lista = await arm.ler('anotacoes.json', []);
    const nova = { id: uuid().slice(0, 8), tipo, prancha: corpo.prancha, pontos: pontos.map(([x, y]) => [Math.round(x * 100) / 100, Math.round(y * 100) / 100]), texto: txt || null, autor, criadaEm: new Date().toISOString() };
    await arm.gravar('anotacoes.json', [...lista, nova]);
    await registrar({ origem: 'app', autor, acao: 'anotacao-criada', alteracoes: [{ campo: 'anotacao', antes: null, depois: nova }] });
    return { ok: true, anotacao: nova };
  });

  const excluirAnotacao = (id, { autor = null } = {}) => enfileirar(async () => {
    const lista = await arm.ler('anotacoes.json', []);
    const alvo = lista.find((a) => a.id === id);
    if (!alvo) return { ok: false, codigo: 404, erro: 'Anotação não encontrada.' };
    await arm.gravar('anotacoes.json', lista.filter((a) => a.id !== id));
    await registrar({ origem: 'app', autor, acao: 'anotacao-excluida', alteracoes: [{ campo: 'anotacao', antes: alvo, depois: null }] });
    return { ok: true };
  });

  /** Lacuna criada manualmente no app (ID novo, nunca reaproveitado; origem registrada). */
  const CAMPOS_PADRAO = {
    piso: [['piso', 'Piso']], parede: [['parede', 'Acabamento de parede']], revestimento: [['piso', 'Piso'], ['parede', 'Revestimento de parede'], ['altura', 'Altura (m)']],
    forro: [['teto', 'Teto / forro']], iluminacao: [['modelo', 'Modelo / fabricante'], ['quantidade', 'Quantidade']],
    inconsistencia: [['resposta', 'Esclarecimento']], documentacao: [['resposta', 'Esclarecimento']]
  };
  const criarLacuna = (corpo, { autor = null } = {}) => enfileirar(async () => {
    const projeto = await arm.ler('projeto.json');
    const t = (k, max) => texto(corpo?.[k]).slice(0, max);
    const titulo = t('titulo', 140);
    const problema = t('problema', 2000);
    const pergunta = t('pergunta', 1000);
    const categoria = CAMPOS_PADRAO[corpo?.categoria] ? corpo.categoria : null;
    const prioridade = ['alta', 'media', 'baixa'].includes(corpo?.prioridade) ? corpo.prioridade : null;
    if (!titulo || !problema || !pergunta || !categoria || !prioridade) return { ok: false, codigo: 400, erro: 'Preencha título, categoria, prioridade, o que falta e a pergunta.' };
    const m = corpo.marcador ?? {};
    const ref = projeto.referencia;
    const marcador = { prancha: Number(m.prancha), x: Number(m.x), y: Number(m.y), w: Number(m.w), h: Number(m.h) };
    if (!projeto.pranchas.some((p) => p.numero === marcador.prancha) || ![marcador.x, marcador.y, marcador.w, marcador.h].every(Number.isFinite)
      || marcador.w <= 0 || marcador.h <= 0 || marcador.x < 0 || marcador.y < 0 || marcador.x + marcador.w > ref.largura || marcador.y + marcador.h > ref.altura) {
      return { ok: false, codigo: 400, erro: 'Desenhe o marcador dentro da prancha.' };
    }
    const lista = await arm.ler('lacunas.json');
    const maior = Math.max(0, ...lista.map((l) => Number(String(l.id).replace(/\D/g, '')) || 0));
    const ambientes = Array.isArray(corpo.ambientes) ? corpo.ambientes.map((a) => texto(a).slice(0, 80)).filter(Boolean).slice(0, 10) : [];
    const nova = {
      id: `L${String(maior + 1).padStart(2, '0')}`, titulo, categoria, prioridade,
      onde: t('onde', 300) || `Prancha p.${marcador.prancha}`, problema, pergunta, impacto: t('impacto', 1000) || 'A avaliar.',
      campos: CAMPOS_PADRAO[categoria].map(([chave, rotulo]) => ({ chave, rotulo })),
      marcadores: [{ ...marcador, x: Math.round(marcador.x * 10) / 10, y: Math.round(marcador.y * 10) / 10, w: Math.round(marcador.w * 10) / 10, h: Math.round(marcador.h * 10) / 10 }],
      ambientes, identificadaEm: new Date().toISOString().slice(0, 10), origem: `Criada manualmente no app${autor ? ` por ${autor}` : ''}`
    };
    await arm.backup('lacunas.json');
    await arm.gravar('lacunas.json', [...lista, nova]);
    await registrar({ lacuna: nova.id, origem: 'app', autor, acao: 'lacuna-criada', de: { status: null }, para: { status: 'aberta' }, alteracoes: [{ campo: 'lacuna', antes: null, depois: nova.titulo }] });
    return { ok: true, lacuna: nova };
  });

  function diferencasAmbiente(a, b) {
    return ['nome', 'pd', 'observacao', 'poligonos'].filter((k) => JSON.stringify(a?.[k] ?? null) !== JSON.stringify(b?.[k] ?? null))
      .map((k) => ({ campo: k, antes: k === 'poligonos' ? (a?.poligonos?.length ?? 0) : a?.[k] ?? null, depois: k === 'poligonos' ? b.poligonos.length : b[k] ?? null }));
  }

  /** Núcleo da gravação (já dentro da fila). */
  async function salvarInterno(id, corpo, { origem = 'app', autor = null, motivo = null } = {}) {
    const lacunas = await arm.ler('lacunas.json');
    const lacuna = lacunas.find((l) => l.id === id);
    if (!lacuna) return { ok: false, codigo: 404, erro: `Lacuna ${id} não encontrada.` };

    const v = validarResposta({ campos: lacuna.campos ?? [] }, corpo);
    if (!v.ok) return { ok: false, codigo: 400, erro: v.erro };
    for (const e of v.valor.evidencias) {
      if (e.anexo && !(await arm.anexoExiste(e.anexo.id))) return { ok: false, codigo: 400, erro: `Anexo ${e.anexo.nome} não encontrado no servidor.` };
    }

    const respostas = await arm.ler('respostas.json', {});
    const anterior = { ...respostaVazia(), ...(respostas[id] ?? {}) };

    if (corpo.revisaoEsperada !== undefined && corpo.revisaoEsperada !== anterior.revisao) {
      return { ok: false, codigo: 409, erro: `A lacuna ${id} foi alterada em outro lugar (revisão ${anterior.revisao}). Recarregue antes de salvar.` };
    }
    if (!transicaoPermitida(anterior.status, v.valor.status)) {
      const de = STATUS_INFO[anterior.status]?.rotulo ?? anterior.status;
      const para = STATUS_INFO[v.valor.status]?.rotulo ?? v.valor.status;
      return { ok: false, codigo: 409, erro: `Transição não permitida: ${de} → ${para}.` };
    }

    const agora = new Date().toISOString();
    const nova = {
      ...anterior,
      ...v.valor,
      impacto: v.valor.impacto !== undefined ? v.valor.impacto : anterior.impacto,
      revisao: anterior.revisao + 1,
      atualizadoEm: agora,
      respondidaEm: v.valor.status === 'respondida' && anterior.status !== 'respondida' ? agora : anterior.respondidaEm ?? null,
      validadaEm: v.valor.status === 'validada' ? agora : (v.valor.status === 'reaberta' ? null : anterior.validadaEm ?? null)
    };
    if (motivo) nova.ultimoProcessamento = { em: agora, origem, motivo };
    if (nova.impacto === undefined) delete nova.impacto;

    const alteracoes = diferencas(anterior, nova);
    await arm.gravar('respostas.json', { ...respostas, [id]: nova });
    if (alteracoes.length) {
      const historico = await lerHistorico();
      const evento = {
        id: uuid(), lacuna: id, em: agora, origem, autor, motivo,
        de: { status: anterior.status }, para: { status: nova.status }, revisao: nova.revisao, alteracoes
      };
      await arm.gravar('historico.json', { versao: 1, eventos: [...historico.eventos, evento] });
    }
    return { ok: true, resposta: nova };
  }

  const salvarResposta = (id, corpo, opcoes) => enfileirar(async () => {
    await garantirEsquema();
    return salvarInterno(id, corpo, opcoes);
  });

  /** Muda o status de várias lacunas preservando as respostas. Cada uma é validada individualmente. */
  const alterarStatusEmLote = (ids, status, { observacao, ...opcoes } = {}) => enfileirar(async () => {
    await garantirEsquema();
    const respostas = await arm.ler('respostas.json', {});
    const resultados = [];
    for (const id of ids) {
      const atual = { ...respostaVazia(), ...(respostas[id] ?? {}) };
      const { revisao, atualizadoEm, respondidaEm, validadaEm, ultimoProcessamento, ...corpo } = atual;
      const r = await salvarInterno(id, { ...corpo, status, observacao: observacao ?? corpo.observacao }, opcoes);
      resultados.push({ id, ok: r.ok, erro: r.erro ?? null });
    }
    return resultados;
  });

  /** Aplica as ações do processamento com backup prévio e origem "claude". */
  const aplicarProcessamento = async (acoes, opcoes = {}) => {
    await enfileirar(async () => { await garantirEsquema(); await backup('respostas.json'); });
    const resultados = [];
    for (const a of acoes) {
      const [r] = await alterarStatusEmLote([a.lacuna], a.para, { origem: 'claude', motivo: a.motivo, ...opcoes });
      resultados.push({ ...a, ok: r.ok, erro: r.erro });
    }
    return resultados;
  };

  const historico = async (id) => {
    const { eventos } = await lerHistorico();
    return id ? eventos.filter((e) => e.lacuna === id) : eventos;
  };

  /** Assinatura barata do estado em disco (mtime + tamanho), para o navegador detectar mudanças feitas pelo Claude. */
  /** Assinatura barata do estado salvo, para o navegador detectar mudanças feitas por fora (Claude). */
  const versao = () => arm.versao(['projeto.json', 'lacunas.json', 'respostas.json', 'historico.json', 'ambientes.json', 'anotacoes.json']);

  return { carregar, salvarResposta, alterarStatusEmLote, aplicarProcessamento, historico, backup, versao, salvarAmbiente, excluirAmbiente, definirEscala, criarAnotacao, excluirAnotacao, criarLacuna };
}
