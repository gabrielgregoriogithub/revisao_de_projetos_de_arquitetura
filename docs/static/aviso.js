// Aviso da versão publicada (some depois de fechado).
const aviso = document.getElementById('aviso-publicado');
try { if (localStorage.getItem('lacunas:aviso') === '1') aviso?.remove(); } catch { /* sem armazenamento */ }
document.getElementById('fechar-aviso')?.addEventListener('click', () => {
  aviso?.remove();
  try { localStorage.setItem('lacunas:aviso', '1'); } catch { /* sem armazenamento */ }
});
