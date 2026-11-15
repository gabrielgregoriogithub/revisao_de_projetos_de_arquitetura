// Validação da configuração pública do banco na nuvem (nuvem.config.json).
// Aceita só chaves públicas: "publishable" (sb_publishable_…) ou a antiga "anon" (JWT com role anon).
// Recusa explicitamente chaves secretas (sb_secret_… ou JWT service_role), que ignoram as regras de segurança.

/**
 * @param {{url?:string, chaveAnon?:string}} c
 * @returns {{url:string, chaveAnon:string}} configuração normalizada
 */
export function validarConfigNuvem(c) {
  const url = String(c?.url ?? '').trim().replace(/\/(rest|auth|storage)\/v1\/?$/, '').replace(/\/+$/, '');
  const chave = String(c?.chaveAnon ?? '').trim();
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url)) {
    throw new Error('nuvem.config.json: "url" deve ser a Project URL, no formato https://xxxx.supabase.co');
  }
  if (/^sb_secret_/.test(chave)) {
    throw new Error('nuvem.config.json: esta é a chave SECRETA (sb_secret_…). Ela ignora as regras de segurança e nunca pode ser publicada — use a chave "Publishable" (sb_publishable_…) e revogue a secreta se ela vazou.');
  }
  if (/^sb_publishable_[A-Za-z0-9_-]{10,}$/.test(chave)) return { url, chaveAnon: chave };
  if (/^eyJ[\w-]+\.[\w-]+\.[\w-]+$/.test(chave)) {
    let role = null;
    try { role = JSON.parse(Buffer.from(chave.split('.')[1], 'base64url').toString()).role; } catch { /* inválida */ }
    if (role === 'service_role') throw new Error('nuvem.config.json: esta é a chave service_role (secreta). Nunca a publique — use a chave anon/publishable.');
    if (role === 'anon') return { url, chaveAnon: chave };
  }
  throw new Error('nuvem.config.json: "chaveAnon" deve ser a chave Publishable (sb_publishable_…) ou a antiga anon public (eyJ…).');
}
