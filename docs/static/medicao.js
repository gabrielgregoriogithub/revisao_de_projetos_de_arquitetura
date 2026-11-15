// Medição sobre a prancha: área de ambientes (vai para o quadro) e calibração de escala por cota conhecida.
import { el, preferencia } from './dom.js';
import { api } from './api.js';
import { estado } from './estado.js';
import { botao, avisar } from './componentes.js';
import { areaRef, perimetroRef, escalaDe } from '/dominio/geometria.js';
import { lerNumeroBr } from '/dominio/numeros.js';

const fmt = (v, casas = 2) => v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });

/**
 * @param {{visor:object, container:HTMLElement, prancha:()=>number}} o
 */
export function criarMedicao({ visor, container, prancha }) {
  const painel = el('div', { className: 'painel-medicao', hidden: true, role: 'dialog', 'aria-label': 'Medição' });
  container.append(painel);
  let tipo = null;
  let pontos = [];

  const escala = () => escalaDe(estado.projeto, prancha());
  const mostrar = (...filhos) => painel.replaceChildren(...filhos.filter(Boolean));
  const fechar = () => { tipo = null; pontos = []; visor.encerrarMedicao(); painel.hidden = true; };

  function desenharArea() {
    const esc = escala();
    const area = pontos.length > 2 && esc ? areaRef(pontos) * esc.metrosPorRef ** 2 : null;
    const per = pontos.length > 1 && esc ? perimetroRef(pontos, pontos.length > 2) * esc.metrosPorRef : null;
    mostrar(
      el('strong', { textContent: 'Medir área de ambiente' }),
      el('span', { className: 'muted', textContent: 'Clique nos cantos do ambiente. Enter conclui, Backspace desfaz, Esc cancela.' }),
      el('div', { className: 'valor', textContent: area !== null ? `${fmt(area)} m²` : `${pontos.length} vértice(s)` }),
      per !== null ? el('span', { textContent: `Perímetro: ${fmt(per)} m` }) : null,
      !esc ? el('span', { style: 'color:var(--vermelho)', textContent: 'Esta prancha não tem escala: calibre antes de medir.' })
        : el('span', { className: 'muted', style: 'font-size:12px', textContent: `Escala: ${esc.origem.slice(0, 90)}${esc.calibrada ? '' : ' (não calibrada)'}` }),
      el('div', { className: 'linha' }, [
        botao('Desfazer', { classe: 'peq', onclick: () => visor.desfazerVertice(), desativado: !pontos.length }),
        botao('Cancelar', { classe: 'peq fantasma', onclick: fechar }),
        botao('Concluir', { classe: 'peq pri', onclick: concluir, desativado: pontos.length < 3 || !esc })
      ])
    );
  }

  function formularioSalvar(poligono) {
    const nomes = [...new Set(estado.lacunas.flatMap((l) => l.ambientes))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    const lista = el('datalist', { id: 'nomes-ambientes' }, nomes.map((n) => el('option', { value: n })));
    const destino = el('select', { className: 'entrada' }, [
      el('option', { value: '', textContent: 'Novo ambiente' }),
      ...estado.ambientes.map((a) => el('option', { value: a.id, textContent: `Somar a ${a.id} · ${a.nome}` }))
    ]);
    const nome = el('input', { className: 'entrada', placeholder: 'Nome (use o mesmo das lacunas, ex.: Banheiros)', maxLength: 80, autocomplete: 'off' });
    nome.setAttribute('list', 'nomes-ambientes');
    const pd = el('input', { className: 'entrada', placeholder: 'PD (m), opcional', inputMode: 'decimal', style: 'max-width:140px' });
    destino.onchange = () => { nome.disabled = pd.disabled = Boolean(destino.value); };
    const salvar = async () => {
      const autor = preferencia.ler('autor', '') || null;
      try {
        if (destino.value) {
          const a = estado.ambientes.find((x) => x.id === destino.value);
          await api.salvarAmbiente(a.id, { nome: a.nome, pd: a.pd, observacao: a.observacao, poligonos: [...a.poligonos, poligono], autor });
        } else {
          if (!nome.value.trim()) { nome.focus(); return; }
          await api.criarAmbiente({ nome: nome.value.trim(), pd: pd.value, poligonos: [poligono], autor });
        }
        fechar();
        await estado.recarregarEventos();
        avisar('Medição salva no quadro de ambientes.');
      } catch (erro) {
        avisar(erro.message, { erro: true });
      }
    };
    mostrar(el('strong', { textContent: 'Salvar medição' }), lista, destino, nome, pd,
      el('div', { className: 'linha' }, [botao('Descartar', { classe: 'peq fantasma', onclick: fechar }), botao('Salvar no quadro', { classe: 'peq pri', onclick: salvar })]));
    (destino.value ? destino : nome).focus();
  }

  function desenharCalibracao() {
    const comprimentoRef = pontos.length === 2 ? Math.hypot(pontos[1][0] - pontos[0][0], pontos[1][1] - pontos[0][1]) : null;
    const atual = escala();
    const real = el('input', { className: 'entrada', placeholder: 'Medida real (m), ex.: 4,50', inputMode: 'decimal', style: 'max-width:180px' });
    const alcance = el('select', { className: 'entrada' }, [
      el('option', { value: 'projeto', textContent: 'Aplicar ao projeto todo' }),
      el('option', { value: 'prancha', textContent: `Só à prancha p.${prancha()}` })
    ]);
    const aplicar = async () => {
      const m = lerNumeroBr(real.value);
      if (!(m > 0) || !comprimentoRef) { real.focus(); return; }
      try {
        await api.definirEscala({
          prancha: alcance.value === 'prancha' ? prancha() : null,
          metrosPorRef: m / comprimentoRef,
          origem: `Calibrada no app: ${fmt(m)} m medidos sobre a prancha p.${prancha()}`,
          autor: preferencia.ler('autor', '') || null
        });
        fechar();
        await estado.recarregarEventos();
        avisar('Escala calibrada. As áreas do quadro foram recalculadas.');
      } catch (erro) {
        avisar(erro.message, { erro: true });
      }
    };
    mostrar(
      el('strong', { textContent: 'Calibrar escala' }),
      el('span', { className: 'muted', textContent: 'Clique nas duas extremidades de uma cota conhecida (ex.: largura de um vão cotado).' }),
      atual ? el('span', { className: 'muted', style: 'font-size:12px', textContent: `Atual: ${atual.origem.slice(0, 100)}` }) : null,
      comprimentoRef && atual ? el('span', { textContent: `Pela escala atual: ${fmt(comprimentoRef * atual.metrosPorRef)} m` }) : null,
      pontos.length === 2 ? el('div', { className: 'linha' }, [real, alcance]) : el('div', { className: 'valor', textContent: `${pontos.length}/2 pontos` }),
      el('div', { className: 'linha' }, [botao('Cancelar', { classe: 'peq fantasma', onclick: fechar }),
        botao('Aplicar escala', { classe: 'peq pri', onclick: aplicar, desativado: pontos.length !== 2 })])
    );
    if (pontos.length === 2) real.focus();
  }

  /** Distância e linha: 2 pontos. Texto: 1 ponto. Todas podem virar anotação salva na prancha. */
  function desenharAnotacao() {
    const esc = escala();
    const dist = pontos.length === 2 && esc ? Math.hypot(pontos[1][0] - pontos[0][0], pontos[1][1] - pontos[0][1]) * esc.metrosPorRef : null;
    const titulos = { distancia: 'Medir distância', linha: 'Desenhar linha', texto: 'Anotar texto' };
    const necessarios = tipo === 'texto' ? 1 : 2;
    const campoTexto = el('input', { className: 'entrada', maxLength: 300, placeholder: tipo === 'texto' ? 'Texto da anotação' : 'Legenda (opcional)' });
    const salvar = async () => {
      if (tipo === 'texto' && !campoTexto.value.trim()) { campoTexto.focus(); return; }
      const tipoApi = tipo === 'distancia' ? 'cota' : tipo;
      const rotulo = dist !== null && tipo === 'distancia' ? `${fmt(dist)} m` : null;
      try {
        await api.criarAnotacao({ tipo: tipoApi, prancha: prancha(), pontos, texto: [rotulo, campoTexto.value.trim()].filter(Boolean).join(' – ') || null, autor: preferencia.ler('autor', '') || null });
        fechar();
        await estado.recarregarEventos();
        avisar('Anotação salva na prancha.');
      } catch (erro) { avisar(erro.message, { erro: true }); }
    };
    mostrar(
      el('strong', { textContent: titulos[tipo] }),
      el('span', { className: 'muted', textContent: tipo === 'texto' ? 'Clique onde o texto deve ficar.' : 'Clique nos dois pontos. Esc cancela.' }),
      tipo === 'distancia' ? el('div', { className: 'valor', textContent: dist !== null ? `${fmt(dist)} m` : `${pontos.length}/2 pontos` }) : null,
      tipo === 'distancia' && !esc ? el('span', { style: 'color:var(--vermelho)', textContent: 'Sem escala: calibre antes de medir.' }) : null,
      pontos.length === necessarios ? campoTexto : null,
      el('div', { className: 'linha' }, [botao('Cancelar', { classe: 'peq fantasma', onclick: fechar }),
        botao(tipo === 'distancia' ? 'Salvar como cota' : 'Salvar anotação', { classe: 'peq pri', onclick: salvar, desativado: pontos.length !== necessarios })])
    );
    if (pontos.length === necessarios) campoTexto.focus();
  }

  /** Nova lacuna: dois cantos de um retângulo + formulário. */
  function desenharNovaLacuna() {
    if (pontos.length < 2) {
      mostrar(el('strong', { textContent: 'Nova lacuna' }), el('span', { className: 'muted', textContent: 'Clique em dois cantos opostos da região com problema.' }),
        el('div', { className: 'valor', textContent: `${pontos.length}/2 cantos` }), el('div', { className: 'linha' }, [botao('Cancelar', { classe: 'peq fantasma', onclick: fechar })]));
      return;
    }
    const [[x1, y1], [x2, y2]] = pontos;
    const marcador = { prancha: prancha(), x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) };
    const campo = (rot, no) => el('label', { className: 'campo' }, [rot, no]);
    const titulo = el('input', { className: 'entrada', maxLength: 140, placeholder: 'Ex.: Banheiro sem especificação de piso' });
    const categoria = el('select', { className: 'entrada' }, [['piso', 'Piso'], ['parede', 'Parede'], ['revestimento', 'Revestimento'], ['forro', 'Forro / teto'],
      ['iluminacao', 'Iluminação'], ['inconsistencia', 'Inconsistência entre pranchas'], ['documentacao', 'Documentação']].map(([v, t]) => el('option', { value: v, textContent: t })));
    const prioridade = el('select', { className: 'entrada' }, [['alta', 'Alta'], ['media', 'Média'], ['baixa', 'Baixa']].map(([v, t]) => el('option', { value: v, textContent: t, selected: v === 'media' })));
    const problema = el('textarea', { className: 'entrada', maxLength: 2000, placeholder: 'O que está faltando ou conflitante' });
    const pergunta = el('textarea', { className: 'entrada', maxLength: 1000, placeholder: 'O que precisa ser respondido' });
    const ambiente = el('input', { className: 'entrada', maxLength: 80, placeholder: 'Ambiente (opcional)' });
    const salvar = async () => {
      try {
        const nova = await api.criarLacuna({ titulo: titulo.value, categoria: categoria.value, prioridade: prioridade.value, problema: problema.value, pergunta: pergunta.value,
          ambientes: ambiente.value.trim() ? [ambiente.value.trim()] : [], marcador, autor: preferencia.ler('autor', '') || null });
        fechar();
        await estado.recarregarEventos();
        avisar(`${nova.id} criada.`);
      } catch (erro) { avisar(erro.message, { erro: true }); }
    };
    painel.style.maxWidth = '420px';
    mostrar(el('strong', { textContent: 'Nova lacuna' }), campo('Título', titulo), el('div', { className: 'linha' }, [categoria, prioridade]),
      campo('O que falta', problema), campo('Pergunta', pergunta), ambiente,
      el('div', { className: 'linha' }, [botao('Cancelar', { classe: 'peq fantasma', onclick: fechar }), botao('Criar lacuna', { classe: 'peq pri', onclick: salvar })]));
    titulo.focus();
  }

  function concluir() {
    if (tipo === 'area' && pontos.length >= 3 && escala()) {
      const poligono = { prancha: prancha(), pontos: visor.encerrarMedicao() };
      tipo = 'salvando';
      formularioSalvar(poligono);
    }
  }

  function iniciar(t) {
    if (tipo) fechar();
    tipo = t;
    pontos = [];
    painel.hidden = false;
    const limite = { calibrar: 2, distancia: 2, linha: 2, texto: 1, lacuna: 2 }[t];
    const desenhar = { area: desenharArea, calibrar: desenharCalibracao, lacuna: desenharNovaLacuna }[t] ?? desenharAnotacao;
    visor.iniciarMedicao(t, (p) => {
      if (limite && p.length > limite) { visor.desfazerVertice(); return; }
      pontos = p;
      desenhar();
    });
    desenhar();
  }

  return {
    medirArea: () => iniciar('area'),
    calibrar: () => iniciar('calibrar'),
    medirDistancia: () => iniciar('distancia'),
    desenharLinha: () => iniciar('linha'),
    anotarTexto: () => iniciar('texto'),
    novaLacuna: () => iniciar('lacuna'),
    ativo: () => Boolean(tipo),
    teclas: {
      Enter: () => tipo === 'area' && concluir(),
      Backspace: () => (tipo === 'area' || tipo === 'calibrar') && visor.desfazerVertice(),
      Escape: () => tipo && fechar()
    }
  };
}
