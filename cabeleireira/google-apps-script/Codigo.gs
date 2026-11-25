/**
 * Salão em Casa — cópia dos dados na planilha Google (V2).
 * Cole este código em Extensões → Apps Script da planilha (veja o README).
 *
 * Abas criadas: "Atendimentos", "Serviços", "Produtos" e "Tipos e subtipos".
 * Para corrigir algo: mude Cliente, Total (R$), Situação, Forma de pagamento ou Assistente (R$)
 * na planilha e depois toque em "Trazer dados da planilha" no celular.
 * Não mexa nas colunas "não mexer".
 */

// Troque por uma senha só sua (sem espaços). Use a mesma no app.
const SENHA = 'troque-esta-senha';

const ABA_AT = 'Atendimentos';
const ABA_SV = 'Serviços';
const ABA_PR = 'Produtos';
const ABA_TP = 'Tipos e subtipos';
const CAB_AT = ['Data', 'Cliente', 'Serviços', 'Subtotal (R$)', 'Desconto/Acréscimo (R$)', 'Total (R$)',
  'Situação', 'Forma de pagamento', 'Pago em', 'Assistente (R$)', 'Produtos usados', 'Custo dos produtos (R$)',
  'Lucro (R$)', 'id (não mexer)', 'itens (não mexer)', 'produtos (não mexer)'];
const CAB_SV = ['Grupo', 'Serviço', 'Preço (R$)', 'id (não mexer)'];
const CAB_PR = ['Tipo', 'Subtipo', 'Produto', 'Características', 'Custo (R$)', 'Embalagem', 'Unidade',
  'Custo por unidade (R$)', 'id (não mexer)', 'dados (não mexer)'];
const CAB_TP = ['Tipo', 'Subtipo', 'Características do subtipo', 'id tipo (não mexer)', 'id subtipo (não mexer)'];
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

const DINHEIRO = '#,##0.00';
const somaItens = function (itens) { return (itens || []).reduce(function (a, it) { return a + (Number(it.price) || 0); }, 0); };
const somaCustos = function (uso) { return (uso || []).reduce(function (a, u) { return a + (Number(u.cost) || 0); }, 0); };
const porOrdem = function (a, b) { return (a.order || 0) - (b.order || 0); };
const caracTexto = function (traits) {
  return (traits || []).filter(function (t) { return t.name && t.value; }).map(function (t) { return t.name + ': ' + t.value; }).join('; ');
};

function salvar(d) {
  const visitas = (d.visits || []).slice().sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
  const linhas = visitas.map(function (v) {
    const sub = somaItens(v.items);
    const total = Math.max(0, sub + (Number(v.adjust) || 0));
    const asst = v.hadAssistant ? (Number(v.assistant) || 0) : 0;
    const custo = somaCustos(v.usage);
    return [
      new Date(v.date), v.client, (v.items || []).map(function (i) { return i.name; }).join(', '),
      sub / 100, (Number(v.adjust) || 0) / 100, total / 100,
      v.deleted ? 'Apagado' : (v.paid ? 'Pago' : 'Não pago'),
      v.paid ? (FORMAS[v.method] || '') : '',
      v.paid && v.paidAt ? new Date(v.paidAt) : '',
      asst / 100,
      (v.usage || []).map(function (u) { return u.name + ' (' + u.qty + ' ' + u.unit + ')'; }).join(', '),
      custo / 100, (total - asst - custo) / 100,
      v.id, JSON.stringify(v.items || []), JSON.stringify(v.usage || []),
    ];
  });
  escrever(aba(ABA_AT), CAB_AT, linhas, { 1: 'dd/mm/yyyy hh:mm', 4: DINHEIRO, 5: DINHEIRO, 6: DINHEIRO,
    9: 'dd/mm/yyyy hh:mm', 10: DINHEIRO, 12: DINHEIRO, 13: DINHEIRO });

  const servicos = (d.services || []).slice().sort(porOrdem);
  escrever(aba(ABA_SV), CAB_SV, servicos.map(function (s) { return [s.category || '', s.name, (Number(s.price) || 0) / 100, s.id]; }),
    { 3: DINHEIRO });

  // Cópias de versões antigas do app não mandam o cadastro de produtos: aí as abas ficam como estão.
  if (!Array.isArray(d.types)) return;
  const tipos = d.types.slice().sort(porOrdem);
  const subtipos = (d.subtypes || []).slice().sort(porOrdem);
  const nomeTipo = {}; tipos.forEach(function (t) { nomeTipo[t.id] = t.name; });
  const nomeSub = {}; subtipos.forEach(function (s) { nomeSub[s.id] = s.name; });

  const linhasTp = [];
  tipos.forEach(function (t) {
    const subs = subtipos.filter(function (s) { return s.typeId === t.id; });
    if (!subs.length) linhasTp.push([t.name, '', '', t.id, '']);
    subs.forEach(function (s) { linhasTp.push([t.name, s.name, (s.fields || []).join(', '), t.id, s.id]); });
  });
  escrever(aba(ABA_TP), CAB_TP, linhasTp);

  const linhasPr = (d.products || []).map(function (p) {
    const pack = Number(p.packQty) || 0;
    return [nomeTipo[p.typeId] || '', nomeSub[p.subtypeId] || '', p.name, caracTexto(p.traits),
      (Number(p.cost) || 0) / 100, pack, p.unit || 'ml', pack ? (Number(p.cost) || 0) / 100 / pack : 0,
      p.id, JSON.stringify(p)];
  });
  linhasPr.sort(function (a, b) { return (a[0] + a[1] + a[2]).localeCompare(b[0] + b[1] + b[2]); });
  escrever(aba(ABA_PR), CAB_PR, linhasPr, { 5: DINHEIRO, 8: '#,##0.0000' });
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

function json(x, padrao) {
  try { return x ? JSON.parse(x) : padrao; } catch (e) { return padrao; }
}

/** Lê uma aba pelo nome das colunas (funciona com planilhas da V1, que têm menos colunas). */
function linhasPorNome(nome) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nome);
  if (!sh || sh.getLastRow() < 2) return null;
  const valores = sh.getDataRange().getValues();
  const cab = valores[0].map(String);
  return valores.slice(1).map(function (r) {
    const o = {};
    cab.forEach(function (c, i) { o[c] = r[i]; });
    return o;
  });
}

function ler() {
  const formas = {};
  Object.keys(FORMAS).forEach(function (k) { formas[FORMAS[k].toLowerCase()] = k; });

  const visits = (linhasPorNome(ABA_AT) || []).filter(function (r) { return r['Cliente']; }).map(function (r) {
    let itens = json(r['itens (não mexer)'], []);
    const total = Math.round(numero(r['Total (R$)']) * 100);
    if (!itens.length) itens = [{ name: String(r['Serviços'] || 'Serviço'), price: total }]; // linha digitada à mão
    const situacao = String(r['Situação'] || '').trim().toLowerCase();
    const pago = situacao === 'pago';
    const asst = Math.round(numero(r['Assistente (R$)']) * 100);
    return {
      id: String(r['id (não mexer)'] || Utilities.getUuid()),
      date: dataIso(r['Data']) || new Date().toISOString(),
      client: String(r['Cliente']).trim(),
      items: itens,
      adjust: total - somaItens(itens),
      paid: pago,
      method: pago ? (formas[String(r['Forma de pagamento'] || '').trim().toLowerCase()] || null) : null,
      paidAt: pago ? (dataIso(r['Pago em']) || null) : null,
      deleted: situacao === 'apagado',
      hadAssistant: asst > 0,
      assistant: asst,
      usage: json(r['produtos (não mexer)'], []),
    };
  });

  const services = (linhasPorNome(ABA_SV) || []).filter(function (r) { return r['Serviço']; }).map(function (r, i) {
    return { id: String(r['id (não mexer)'] || Utilities.getUuid()), category: String(r['Grupo'] || 'Outros'),
      name: String(r['Serviço']), price: Math.round(numero(r['Preço (R$)']) * 100), order: i };
  });

  const out = { app: 'salao-em-casa', version: 2, services: services, visits: visits };

  const tp = linhasPorNome(ABA_TP);
  if (tp) {
    const types = []; const subtypes = []; const porNome = {};
    tp.filter(function (r) { return r['Tipo']; }).forEach(function (r) {
      const nome = String(r['Tipo']).trim();
      let t = porNome[nome.toLowerCase()];
      if (!t) {
        t = { id: String(r['id tipo (não mexer)'] || Utilities.getUuid()), name: nome, order: types.length };
        porNome[nome.toLowerCase()] = t; types.push(t);
      }
      if (r['Subtipo']) {
        subtypes.push({ id: String(r['id subtipo (não mexer)'] || Utilities.getUuid()), typeId: t.id, name: String(r['Subtipo']).trim(),
          fields: String(r['Características do subtipo'] || '').split(',').map(function (x) { return x.trim(); }).filter(String),
          order: subtypes.filter(function (s) { return s.typeId === t.id; }).length });
      }
    });
    const products = (linhasPorNome(ABA_PR) || []).filter(function (r) { return r['Produto']; }).map(function (r) {
      const p = json(r['dados (não mexer)'], {});
      p.id = String(r['id (não mexer)'] || p.id || Utilities.getUuid());
      p.name = String(r['Produto']).trim();
      p.cost = Math.round(numero(r['Custo (R$)']) * 100);
      p.packQty = numero(r['Embalagem']);
      p.unit = String(r['Unidade'] || p.unit || 'ml').trim().toLowerCase() === 'g' ? 'g' : 'ml';
      return p;
    });
    Object.assign(out, { types: types, subtypes: subtypes, products: products });
  }
  return out;
}
