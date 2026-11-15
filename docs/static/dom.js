// Helpers para criar elementos sem innerHTML (evita XSS com textos vindos dos dados).

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * @param {string} tag
 * @param {Record<string, any>} [props] propriedades (textContent, className, onclick…), aria-* e data-* viram atributos
 * @param {(Node|string|number|null|false|undefined)[]} [filhos]
 * @returns {HTMLElement}
 */
export function el(tag, props = {}, filhos = []) {
  const no = document.createElement(tag);
  for (const [chave, valor] of Object.entries(props)) {
    if (valor === undefined || valor === null || valor === false) continue;
    if (chave === 'style') no.setAttribute('style', valor);
    else if (chave.startsWith('aria-') || chave.startsWith('data-') || chave === 'role' || chave === 'for') no.setAttribute(chave, String(valor));
    else no[chave] = valor;
  }
  no.append(...filhos.filter((f) => f !== null && f !== false && f !== undefined).map((f) => (typeof f === 'number' ? String(f) : f)));
  return no;
}

/** Cria elemento SVG com atributos. */
export function svg(tag, attrs = {}, filhos = []) {
  const no = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) no.setAttribute(k, String(v));
  no.append(...filhos.filter(Boolean));
  return no;
}

export const $ = (sel, raiz = document) => raiz.querySelector(sel);
export const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];

/** Leitura/escrita segura no localStorage (pode falhar em modo privado). */
export const preferencia = {
  ler(chave, padrao) {
    try {
      const v = localStorage.getItem(`lacunas:${chave}`);
      return v === null ? padrao : JSON.parse(v);
    } catch {
      return padrao;
    }
  },
  gravar(chave, valor) {
    try { localStorage.setItem(`lacunas:${chave}`, JSON.stringify(valor)); } catch { /* sem armazenamento: segue sem persistir */ }
  }
};
