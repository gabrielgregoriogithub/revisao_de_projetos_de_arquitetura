# Guia: ativar o banco compartilhado (Supabase, gratuito)

Com o banco ativado, o que é feito no site (respostas, validações, observações, medições, anotações, anexos e revisões) fica salvo na nuvem, e **todos os membros convidados veem a mesma versão**.

Tempo estimado: 15 minutos. Não é preciso cartão de crédito.

---

## Parte 1: criar o projeto no Supabase

1. Acesse **https://supabase.com** e clique em **Start your project**. Entre com sua conta do GitHub (mais simples) ou com e-mail.
2. Clique em **New project**.
   - **Name:** `lacunas-obra`
   - **Database Password:** clique em *Generate a password* e **guarde num gerenciador de senhas**. O site não usa essa senha, mas você vai precisar dela para administrar o banco.
   - **Region:** **South America (São Paulo)**
   - **Plan:** Free
3. Clique em **Create new project** e aguarde de 1 a 2 minutos.

## Parte 2: criar as tabelas e as regras de segurança

1. No menu lateral, abra **SQL Editor** e clique em **New query**.
2. Abra o arquivo [`supabase/schema.sql`](supabase/schema.sql) do repositório, copie **todo** o conteúdo e cole no editor.
3. Clique em **Run**. Deve aparecer *Success. No rows returned*.
4. Confira em **Table Editor**: devem existir as tabelas `projetos`, `membros` e `arquivos`, todas com o selo **RLS enabled**.
5. Confira em **Storage**: deve existir o bucket **`lacunas`**, marcado como privado.

## Parte 3: configurar o login por e-mail

1. Abra **Authentication › Sign In / Providers** e confirme que **Email** está ativado.
2. Abra **Authentication › URL Configuration**.
   - **Site URL:** `https://gabrielgregoriogithub.github.io/revisao_de_projetos_de_arquitetura/docs/`
   - Em **Redirect URLs**, clique em *Add URL* e adicione o mesmo endereço.

## Parte 4: me enviar as duas informações públicas

1. Abra **Project Settings › API** (ou **Data API**).
2. Copie:
   - **Project URL**, algo como `https://abcdefghijk.supabase.co`;
   - a chave **`anon` `public`**, um texto longo que começa com `eyJ`.
3. Cole as duas aqui na conversa. Eu crio o `nuvem.config.json`, gero o site e publico.

> ⚠️ **Nunca** envie nem publique a chave **`service_role`** (ou "secret"). Ela ignora todas as regras de segurança. A chave `anon` é pública por design: quem protege os dados são as regras do `schema.sql`. O gerador do site recusa automaticamente uma chave que não seja `anon`.

## Parte 5: usar e compartilhar (depois que eu publicar)

1. Abra o site e vá em **Projeto › Banco na nuvem**. Informe seu e-mail e clique em **Receber link de acesso**.
2. Abra o link do e-mail **no mesmo navegador**. Você entra sem senha.
3. Com o projeto LOFT aberto, clique em **Enviar este projeto para a nuvem**. As lacunas, as pranchas e todo o resto são copiados, e você passa a ser o **dono**.
4. Em **Pessoas com acesso**, digite o e-mail de cada colega, escolha o papel e clique em **Convidar**:
   - **Editor:** responde, valida, mede e anota;
   - **Leitor:** só visualiza;
   - **Dono:** também gerencia quem tem acesso.
5. Clique em **Copiar link** e envie para a equipe. Cada pessoa entra com o próprio e-mail, que precisa ser o mesmo que você convidou.

As alterações de cada pessoa aparecem para as outras em até 5 segundos. Se duas pessoas salvarem a mesma informação ao mesmo tempo, a segunda recebe um aviso para conferir e refazer; nada é sobrescrito em silêncio.

---

## Limites do plano gratuito

| Recurso | Limite | Uso estimado do LOFT |
|---|---|---|
| Banco de dados | 500 MB | cerca de 1 MB |
| Arquivos (pranchas e anexos) | 1 GB | cerca de 6 MB por projeto |
| E-mails de login | o serviço padrão envia **poucos por hora** | suficiente para uma equipe pequena |
| Inatividade | **o projeto é pausado após 7 dias sem uso** | para reativar: painel do Supabase › *Restore project* |

Se a equipe crescer, configure um SMTP próprio em **Authentication › Emails › SMTP Settings** (o Resend, por exemplo, tem plano gratuito) para não esbarrar no limite de e-mails.

## Segurança (opcional, recomendado depois que a equipe entrar)

- Do jeito que está configurado, qualquer pessoa pode criar uma conta, mas **só vê os projetos para os quais foi convidada**.
- Para fechar de vez: **Authentication › Sign In / Providers › desative "Allow new users to sign up"**. A partir daí, novos membros precisam ser convidados também pelo painel: **Authentication › Users › Invite user**.
