// Aplica o tema (claro/escuro/sistema). "Sistema" é resolvido via matchMedia.
import { preferencia } from './dom.js';

const midia = window.matchMedia('(prefers-color-scheme: dark)');

export function aplicarTema() {
  const escolha = preferencia.ler('tema', 'sistema');
  const efetivo = escolha === 'sistema' ? (midia.matches ? 'escuro' : 'claro') : escolha;
  document.documentElement.dataset.tema = efetivo;
}

midia.addEventListener('change', aplicarTema);
