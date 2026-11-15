// Painel "Banco na nuvem" (versão publicada): login por e-mail, envio do projeto e compartilhamento.
import { el } from '../dom.js';
import { nuvem } from '../api.js';
import { botao, avisar, confirmar, etiqueta } from '../componentes.js';

const PAPEIS = { dono: 'Dono (gerencia membros)', editor: 'Editor (responde e altera)', leitor: 'Leitor (só visualiza)' };

export function painelNuvem() {
  const corpo = el('div', { className: 'cartao-corpo', style: 'display:grid;gap:12px' }, ['Verificando conexão…']);
  const cartao = el('section', { className: 'cartao c-12' }, [el('div', { className: 'cartao-cab' }, [el('h2', { textContent: 'Banco na nuvem (compartilhado)' })]), corpo]);

  async function desenhar() {
    const st = await nuvem.estado();
    if (!st.configurada) {
      corpo.replaceChildren(el('div', { className: 'aviso-futuro' }, [el('span', { textContent:
        'O banco compartilhado ainda não foi configurado neste site. Enquanto isso, o que você faz fica salvo só neste navegador. Para ativar, siga o GUIA-SUPABASE.md do repositório.' })]));
      return;
    }
    if (!st.email) {
      const email = el('input', { className: 'entrada', type: 'email', placeholder: 'seu@email.com', autocomplete: 'email', style: 'max-width:320px' });
      const enviar = botao('Receber link de acesso', { classe: 'pri', onclick: async () => {
        enviar.disabled = true;
        try { await nuvem.entrar(email.value); avisar('Link enviado. Abra o e-mail neste mesmo navegador para entrar.', { duracao: 8000 }); }
        catch (e) { avisar(e.message, { erro: true }); }
        finally { enviar.disabled = false; }
      } });
      corpo.replaceChildren(
        el('p', { style: 'margin:0', textContent: 'Entre com o e-mail convidado para ver e editar os projetos compartilhados. Você recebe um link de acesso; não há senha.' }),
        el('div', { className: 'filtros', style: 'margin:0' }, [email, enviar])
      );
      return;
    }
    const sair = botao('Sair', { classe: 'fantasma peq', onclick: async () => { await nuvem.sair(); location.reload(); } });
    const topo = el('div', { style: 'display:flex;gap:10px;align-items:center;flex-wrap:wrap' }, [etiqueta('Conectado'), el('span', { textContent: st.email }), sair]);

    if (!st.projetoAtivoNaNuvem) {
      const status = el('span', { className: 'muted', style: 'font-size:12px' });
      const enviar = botao('Enviar este projeto para a nuvem', { classe: 'pri', ic: 'abrir', onclick: async () => {
        if (!(await confirmar({ titulo: 'Enviar para a nuvem?', texto: 'Copia lacunas, respostas, histórico, medições, anotações, pranchas e anexos para o banco compartilhado. Você vira dono e pode convidar outras pessoas. A cópia neste navegador continua existindo.', confirmar: 'Enviar' }))) return;
        enviar.disabled = true;
        try {
          const r = await nuvem.enviarProjeto(st.projetoAtivo, (m) => { status.textContent = m; });
          avisar(`Projeto enviado para a nuvem (${r.id}).`);
          location.hash = '#/projeto';
          location.reload();
        } catch (e) { status.textContent = ''; avisar(e.message, { erro: true, duracao: 9000 }); enviar.disabled = false; }
      } });
      corpo.replaceChildren(topo, el('p', { style: 'margin:0', textContent: 'O projeto aberto está só neste navegador. Envie para a nuvem para que outras pessoas vejam e editem a mesma versão.' }), el('div', { style: 'display:flex;gap:10px;align-items:center;flex-wrap:wrap' }, [enviar, status]));
      return;
    }

    const link = `${location.origin}${location.pathname}?projeto=${encodeURIComponent(st.projetoAtivo)}`;
    const lista = el('ul', { className: 'lista-simples' });
    const desenharMembros = async () => {
      try {
        const ms = await nuvem.membros(st.projetoAtivo);
        lista.replaceChildren(...ms.map((m) => el('li', { className: 'conflito', style: 'cursor:default' }, [
          el('span', { className: 'codigo', textContent: m.papel }),
          el('span', { textContent: m.email }),
          m.email === st.email ? etiqueta('você') : botao('', { classe: 'fantasma peq icone', ic: 'lixo', titulo: 'Remover acesso', onclick: async () => {
            if (!(await confirmar({ titulo: `Remover ${m.email}?`, texto: 'A pessoa deixa de ver e editar este projeto.', confirmar: 'Remover', perigo: true }))) return;
            try { await nuvem.removerMembro(st.projetoAtivo, m.email); desenharMembros(); } catch (e) { avisar(e.message, { erro: true }); }
          } })
        ])));
      } catch (e) { lista.replaceChildren(el('li', { textContent: e.message })); }
    };
    const email = el('input', { className: 'entrada', type: 'email', placeholder: 'email@da.pessoa', style: 'max-width:280px' });
    const papel = el('select', { className: 'entrada', style: 'width:auto' }, Object.entries(PAPEIS).filter(([k]) => k !== 'dono').concat([['dono', PAPEIS.dono]])
      .map(([v, t]) => el('option', { value: v, textContent: t })));
    corpo.replaceChildren(
      topo,
      el('p', { style: 'margin:0', textContent: 'Este projeto está na nuvem: todos os membros veem as mesmas lacunas, respostas, medições e histórico (atualizado a cada 5 s).' }),
      el('div', { className: 'filtros', style: 'margin:0' }, [el('input', { className: 'entrada', value: link, readOnly: true, style: 'max-width:520px', 'aria-label': 'Link de compartilhamento' }),
        botao('Copiar link', { classe: 'peq', onclick: async () => { try { await navigator.clipboard.writeText(link); avisar('Link copiado.'); } catch { avisar('Copie o link manualmente.', { erro: true }); } } })]),
      el('strong', { textContent: 'Pessoas com acesso' }), lista,
      el('div', { className: 'filtros', style: 'margin:0' }, [email, papel, botao('Convidar', { classe: 'pri peq', onclick: async () => {
        try { await nuvem.adicionarMembro(st.projetoAtivo, email.value, papel.value); email.value = ''; avisar('Convite registrado. Envie o link para a pessoa; ela entra com esse e-mail.'); desenharMembros(); }
        catch (e) { avisar(e.message, { erro: true }); }
      } })])
    );
    desenharMembros();
  }

  desenhar().catch((e) => corpo.replaceChildren(el('p', { textContent: e.message })));
  return cartao;
}
