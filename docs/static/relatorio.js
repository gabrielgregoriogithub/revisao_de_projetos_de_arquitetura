// Botão de impressão dos relatórios (arquivo externo por causa da CSP, que bloqueia scripts inline).
document.getElementById('imprimir')?.addEventListener('click', () => window.print());
