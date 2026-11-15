// Identificação de anexos (puro, compartilhado com o navegador).
export const ID_ANEXO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|png|jpg|webp|txt)$/;

/** Nome exibido: sem caminho, sem caracteres de controle, até 120 caracteres. */
export function limparNome(nome) {
  const base = String(nome ?? '').split(/[\\/]/).pop().replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '').trim();
  return (base || 'anexo').slice(0, 120);
}
