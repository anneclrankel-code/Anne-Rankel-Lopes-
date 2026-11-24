/**
 * Salão em Casa — cópia dos dados na planilha Google.
 * Cole este código em Extensões → Apps Script da planilha (veja o README).
 *
 * Abas criadas: "Atendimentos" e "Serviços".
 * Para corrigir algo: mude Cliente, Total (R$), Situação ou Forma de pagamento na planilha
 * e depois toque em "Trazer dados da planilha" no celular. Não mexa nas colunas "não mexer".
 */

// Troque por uma senha só sua (sem espaços). Use a mesma no app.
const SENHA = 'troque-esta-senha';

const ABA_AT = 'Atendimentos';
const ABA_SV = 'Serviços';
const CAB_AT = ['Data', 'Cliente', 'Serviços', 'Subtotal (R$)', 'Desconto/Acréscimo (R$)', 'Total (R$)',
  'Situação', 'Forma de pagamento', 'Pago em', 'id (não mexer)', 'itens (não mexer)'];
const CAB_SV = ['Grupo', 'Serviço', 'Preço (R$)', 'id (não mexer)'];
const FORMAS = { pix: 'Pix', credito: 'Crédito', debito: 'Débito', dinheiro: 'Dinheiro' };

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (body.senha !== SENHA) return resposta({ ok: false, error: 'Senha da planilha errada.' });
    const dados = body.dados || {};
    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      const naPlanilha = Math.max(0, aba(ABA_AT).getLastRow() - 1);
      const noCelular = (dados.visits || []).length;
      if (!body.forcar && noCelular < naPlanilha) {
        return resposta({ ok: false, code: 'menos',
          error: 'A planilha tem mais atendimentos (' + naPlanilha + ') que o celular (' + noCelular + '). Nada foi trocado.' });
      }
      salvar(dados);
    } finally {
      lock.releaseLock();
    }
    return resposta({ ok: true, quando: new Date().toISOString() });
  } catch (err) {
    return resposta({ ok: false, error: String(err && err.message || err) });
  }
}

function doGet(e) {
  try {
    if ((e.parameter.senha || '') !== SENHA) return resposta({ ok: false, error: 'Senha da planilha errada.' });
    return resposta({ ok: true, dados: ler() });
  } catch (err) {
    return resposta({ ok: false, error: String(err && err.message || err) });
  }
}

function resposta(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function aba(nome) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(nome) || ss.insertSheet(nome);
}

function escrever(sh, cab, linhas, formatos) {
  sh.clearContents();
  sh.getRange(1, 1, 1, cab.length).setValues([cab]).setFontWeight('bold');
  sh.setFrozenRows(1);
  if (!linhas.length) return;
  sh.getRange(2, 1, linhas.length, cab.length).setValues(linhas);
  Object.keys(formatos || {}).forEach(function (col) {
    sh.getRange(2, Number(col), linhas.length, 1).setNumberFormat(formatos[col]);
  });
}

function somaItens(itens) {
  return (itens || []).reduce(function (a, it) { return a + (Number(it.price) || 0); }, 0);
}

function salvar(d) {
  const visitas = (d.visits || []).slice().sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
  const linhas = visitas.map(function (v) {
    const sub = somaItens(v.items);
    const total = Math.max(0, sub + (Number(v.adjust) || 0));
    return [
      new Date(v.date), v.client, (v.items || []).map(function (i) { return i.name; }).join(', '),
      sub / 100, (Number(v.adjust) || 0) / 100, total / 100,
      v.deleted ? 'Apagado' : (v.paid ? 'Pago' : 'Não pago'),
      v.paid ? (FORMAS[v.method] || '') : '',
      v.paid && v.paidAt ? new Date(v.paidAt) : '',
      v.id, JSON.stringify(v.items || []),
    ];
  });
  escrever(aba(ABA_AT), CAB_AT, linhas, { 1: 'dd/mm/yyyy hh:mm', 4: '#,##0.00', 5: '#,##0.00', 6: '#,##0.00', 9: 'dd/mm/yyyy hh:mm' });

  const servicos = (d.services || []).slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
  escrever(aba(ABA_SV), CAB_SV, servicos.map(function (s) { return [s.category || '', s.name, (Number(s.price) || 0) / 100, s.id]; }),
    { 3: '#,##0.00' });
}

function numero(x) {
  if (typeof x === 'number') return x;
  let s = String(x || '').replace(/[R$\s]/g, '');
  if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
  return Number(s) || 0;
}

function dataIso(x) {
  if (x instanceof Date) return x.toISOString();
  const d = new Date(x);
  return isNaN(d) ? '' : d.toISOString();
}

function ler() {
  const formas = {};
  Object.keys(FORMAS).forEach(function (k) { formas[FORMAS[k].toLowerCase()] = k; });

  const at = aba(ABA_AT).getDataRange().getValues().slice(1).filter(function (r) { return r[1]; });
  const visits = at.map(function (r) {
    let itens = [];
    try { itens = JSON.parse(r[10] || '[]'); } catch (e) { itens = []; }
    const total = Math.round(numero(r[5]) * 100);
    if (!itens.length) itens = [{ name: String(r[2] || 'Serviço'), price: total }]; // linha digitada à mão
    const situacao = String(r[6] || '').trim().toLowerCase();
    const pago = situacao === 'pago';
    return {
      id: String(r[9] || Utilities.getUuid()),
      date: dataIso(r[0]) || new Date().toISOString(),
      client: String(r[1]).trim(),
      items: itens,
      adjust: total - somaItens(itens),
      paid: pago,
      method: pago ? (formas[String(r[7] || '').trim().toLowerCase()] || null) : null,
      paidAt: pago ? (dataIso(r[8]) || null) : null,
      deleted: situacao === 'apagado',
    };
  });

  const sv = aba(ABA_SV).getDataRange().getValues().slice(1).filter(function (r) { return r[1]; });
  const services = sv.map(function (r, i) {
    return { id: String(r[3] || Utilities.getUuid()), category: String(r[0] || 'Outros'), name: String(r[1]),
      price: Math.round(numero(r[2]) * 100), order: i };
  });
  return { app: 'salao-em-casa', version: 1, services: services, visits: visits };
}
