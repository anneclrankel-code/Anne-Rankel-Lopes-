// Conversa com a planilha Google (pelo Google Apps Script). Sem custo.
// O corpo vai como text/plain para o navegador não precisar de permissão extra (CORS).

async function call(url, init) {
  let res;
  try {
    res = await fetch(url, { redirect: 'follow', ...init });
  } catch {
    throw Object.assign(new Error('Sem conexão com a planilha. Confira a internet.'), { code: 'rede' });
  }
  let body;
  try { body = await res.json(); } catch { throw new Error('A planilha não respondeu direito. Confira o endereço.'); }
  if (!body.ok) throw Object.assign(new Error(body.error || 'A planilha recusou.'), { code: body.code });
  return body;
}

/** Envia tudo para a planilha. Se a planilha tiver mais atendimentos que o celular, ela recusa (code "menos"), a não ser com force. */
export function push(url, senha, dados, force = false) {
  return call(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ senha, dados, forcar: force }),
  });
}

/** Traz os dados guardados na planilha. */
export async function pull(url, senha) {
  const u = new URL(url);
  u.searchParams.set('senha', senha || '');
  return (await call(u.toString(), { method: 'GET' })).dados;
}
