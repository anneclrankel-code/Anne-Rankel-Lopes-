import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../cabeleireira/js/logic.js';

const sp = (s) => s.replace(/ /g, ' ');
const v = (o) => ({ id: o.id || Math.random().toString(36), client: 'Anne', date: '2026-11-20T15:00:00.000Z',
  items: [{ name: 'Corte', price: 8000 }], adjust: 0, paid: false, method: null, paidAt: null, deleted: false, ...o });

test('dinheiro em reais', () => {
  assert.equal(sp(L.money(8000)), 'R$ 80,00');
  assert.equal(sp(L.money(120050)), 'R$ 1.200,50');
});

test('ler preço digitado', () => {
  assert.equal(L.parsePrice('80'), 8000);
  assert.equal(L.parsePrice('80,5'), 8050);
  assert.equal(L.parsePrice('1.200,50'), 120050);
  assert.equal(L.parsePrice('1.200'), 120000);
  assert.equal(L.parsePrice('R$ 35'), 3500);
  assert.equal(L.parsePrice('80.5'), 8050);
  assert.equal(L.parsePrice('abc'), null);
  assert.equal(L.parsePrice(''), null);
});

test('total com desconto e acréscimo de R$ 10', () => {
  const items = [{ price: 8000 }, { price: 6000 }];
  assert.equal(L.subtotal(items), 14000);
  let adj = L.changeAdjust(items, 0, -L.STEP);
  assert.equal(L.total(items, adj), 13000);
  adj = L.changeAdjust(items, adj, 2 * L.STEP);
  assert.equal(L.total(items, adj), 15000);
});

test('desconto não deixa a conta negativa', () => {
  const items = [{ price: 1500 }];
  let adj = 0;
  for (let i = 0; i < 5; i++) adj = L.changeAdjust(items, adj, -L.STEP);
  assert.equal(adj, -1500);
  assert.equal(L.total(items, adj), 0);
});

test('lista de quem deve e total a receber', () => {
  const visits = [
    v({ id: 'a', date: '2026-11-01T10:00:00Z' }),
    v({ id: 'b', date: '2026-11-10T10:00:00Z', adjust: -1000 }),
    v({ id: 'c', paid: true, method: 'pix', paidAt: '2026-11-11T10:00:00Z' }),
    v({ id: 'd', deleted: true }),
  ];
  assert.deepEqual(L.pending(visits).map((x) => x.id), ['b', 'a']);
  assert.equal(L.sumOwed(visits), 8000 + 7000);
  assert.deepEqual(L.paid(visits).map((x) => x.id), ['c']);
});

test('sugestão de clientes já atendidas', () => {
  const visits = [
    v({ client: 'Maria Souza', date: '2026-11-02T10:00:00Z' }),
    v({ client: 'Ana Lúcia', date: '2026-11-05T10:00:00Z' }),
    v({ client: 'anA lúcia', date: '2026-11-01T10:00:00Z' }),
  ];
  assert.deepEqual(L.suggestClients(visits, ''), ['Ana Lúcia', 'Maria Souza']);
  assert.deepEqual(L.suggestClients(visits, 'lu'), ['Ana Lúcia']);
  assert.deepEqual(L.suggestClients(visits, 'sou'), ['Maria Souza']);
  assert.deepEqual(L.suggestClients(visits, 'Ana Lucia'), []); // já digitou o nome inteiro
});

test('datas e dívidas antigas', () => {
  const now = new Date('2026-11-24T12:00:00');
  assert.equal(L.fmtDate('2026-11-24T08:00:00', now), 'Hoje');
  assert.equal(L.fmtDate('2026-11-23T08:00:00', now), 'Ontem');
  assert.equal(L.fmtDate('2026-11-20T08:00:00', now), 'sex, 20/11');
  assert.equal(L.fmtDate('2025-11-20T08:00:00', now), 'qui, 20/11/2025');
  assert.equal(L.oldDebtLabel('2026-11-10T08:00:00', now), '');
  assert.equal(L.oldDebtLabel('2026-08-10T08:00:00', now), 'há 3 meses');
  assert.equal(L.oldDebtLabel('2025-08-10T08:00:00', now), 'há 1 ano');
});

test('lembrete de cópia de segurança', () => {
  const now = new Date('2026-11-24T12:00:00Z');
  assert.equal(L.needsBackup([], null, null, now), false);
  assert.equal(L.needsBackup([v({})], null, null, now), true);
  assert.equal(L.needsBackup([v({})], '2026-11-22T00:00:00Z', null, now), false);
  assert.equal(L.needsBackup([v({})], '2026-11-01T00:00:00Z', '2026-11-02T00:00:00Z', now), true);
});

test('cópia de segurança: ida e volta', () => {
  const snap = L.snapshot(L.DEFAULT_SERVICES, [v({ id: 'x', paid: true, method: 'credito', paidAt: '2026-11-21T10:00:00Z' })]);
  const back = L.validateBackup(JSON.parse(JSON.stringify(snap)));
  assert.equal(back.services.length, L.DEFAULT_SERVICES.length);
  assert.equal(back.visits[0].method, 'credito');
  assert.equal(L.visitTotal(back.visits[0]), 8000);
});

test('cópia de segurança: recusa arquivo errado e limpa dados ruins', () => {
  assert.throws(() => L.validateBackup({ foo: 1 }), /não é uma cópia/);
  const back = L.validateBackup({
    services: [{ name: '' }, { name: ' Escova ', price: '6000' }],
    visits: [v({ id: 'ok', paid: false, method: 'pix' }), { id: 'sem-nome', client: '', items: [], date: '2026-01-01' }],
  });
  assert.equal(back.services.length, 1);
  assert.equal(back.services[0].name, 'Escova');
  assert.equal(back.visits.length, 1);
  assert.equal(back.visits[0].method, null); // não pago não tem forma de pagamento
});

test('agrupa serviços por grupo', () => {
  const g = L.groupServices(L.DEFAULT_SERVICES);
  assert.deepEqual(g.map((x) => x.category), ['Cabelo', 'Unha', 'Maquiagem']);
});

// ---------------- V2: assistente, produtos, custo e lucro ----------------

test('V2: lista inicial de tipos e subtipos', () => {
  const c = L.defaultCatalog();
  assert.equal(c.types.length, 9);
  assert.deepEqual(c.types.map((t) => t.name).slice(0, 3), ['Química', 'Alisamento', 'Tratamento']);
  const quimica = c.subtypes.filter((s) => s.typeId === c.types[0].id).map((s) => s.name);
  assert.deepEqual(quimica, ['Água oxigenada', 'Tintura', 'Descolorante', 'Permanente']);
  assert.deepEqual(c.subtypes.find((s) => s.name === 'Água oxigenada').fields, ['Volume']);
  assert.equal(new Set(c.subtypes.map((s) => s.id)).size, c.subtypes.length); // ids únicos
});

test('V2: custo do produto pela quantidade gasta', () => {
  const ox = { cost: 3500, packQty: 900, unit: 'ml' }; // R$ 35 por 900 ml
  assert.equal(L.usageCost(ox, 60), 233); // 60 ml ≈ R$ 2,33
  assert.equal(L.usageCost(ox, 900), 3500);
  assert.equal(L.usageCost({ cost: 3500, packQty: 0 }, 60), 0);
  assert.equal(L.parseQty('2,5'), 2.5);
  assert.equal(L.parseQty('30'), 30);
  assert.equal(L.parseQty('0'), null);
  assert.equal(L.parseQty('abc'), null);
  assert.equal(L.fmtQty(2.5), '2,5');
});

test('V2: lucro = total da cliente − assistente − produtos', () => {
  const base = v({ items: [{ name: 'Tintura', price: 15000 }], adjust: -1000 }); // cliente paga R$ 140
  assert.equal(L.visitProfit(base), 14000);
  const comAssistente = { ...base, hadAssistant: true, assistant: 4000 };
  assert.equal(L.visitTotal(comAssistente), 14000); // a assistente não muda o que a cliente paga
  assert.equal(L.visitProfit(comAssistente), 10000);
  const comProdutos = { ...comAssistente, usage: [{ name: 'Tintura 7.1', qty: 60, unit: 'g', cost: 1250 }] };
  assert.equal(L.visitProfit(comProdutos), 8750);
  // "Não" teve assistente: o valor é ignorado
  assert.equal(L.visitProfit({ ...base, hadAssistant: false, assistant: 4000 }), 14000);
});

test('V2: atendimentos da V1 (sem assistente nem produtos) continuam funcionando', () => {
  const antigo = { id: 'x', client: 'Maria', date: '2026-01-01T10:00:00Z', items: [{ name: 'Corte', price: 8000 }], adjust: 0 };
  assert.equal(L.visitProfit(antigo), 8000);
  const back = L.validateBackup({ services: [], visits: [antigo] });
  assert.equal(back.visits[0].assistant, 0);
  assert.deepEqual(back.visits[0].usage, []);
  assert.equal(back.types, undefined); // cópia da V1 não troca o cadastro de produtos
});

test('V2: cópia completa leva o cadastro de produtos', () => {
  const c = L.defaultCatalog();
  const ox = { id: 'p1', name: 'Água oxigenada Wella', typeId: 't1', subtypeId: 't1-1', traits: [{ name: 'Volume', value: '20' }], cost: 3500, packQty: 900, unit: 'ml' };
  const visita = v({ id: 'a', hadAssistant: true, assistant: 5000, usage: [{ productId: 'p1', name: 'Água oxigenada Wella', qty: 60, unit: 'ml', cost: 233 }] });
  const snap = L.fullSnapshot({ services: L.DEFAULT_SERVICES, visits: [visita], ...c, products: [ox] });
  const back = L.validateBackup(JSON.parse(JSON.stringify(snap)));
  assert.equal(back.types.length, 9);
  assert.equal(back.products[0].traits[0].value, '20');
  assert.equal(back.visits[0].assistant, 5000);
  assert.equal(back.visits[0].usage[0].cost, 233);
  assert.equal(L.visitProfit(back.visits[0]), 8000 - 5000 - 233);
});

test('V2: cópia limpa subtipos sem tipo e produtos com tipo apagado', () => {
  const back = L.validateBackup({
    services: [], visits: [],
    types: [{ id: 't1', name: 'Química' }],
    subtypes: [{ id: 's1', typeId: 't1', name: 'Tintura' }, { id: 's2', typeId: 'sumiu', name: 'Órfão' }],
    products: [{ id: 'p1', name: 'Tinta', typeId: 'sumiu', subtypeId: 's2', cost: 100, packQty: 10, unit: 'kg' }],
  });
  assert.deepEqual(back.subtypes.map((s) => s.id), ['s1']);
  assert.equal(back.products[0].typeId, null);
  assert.equal(back.products[0].subtypeId, null);
  assert.equal(back.products[0].unit, 'ml');
});

test('V2: não apaga tipo ou subtipo que tem produtos', () => {
  const products = [{ id: 'p1', typeId: 't1', subtypeId: 't1-1' }];
  assert.equal(L.productsUsing(products, { typeId: 't1' }).length, 1);
  assert.equal(L.productsUsing(products, { subtypeId: 't1-2' }).length, 0);
});

test('V2: produtos agrupados por tipo e subtipo', () => {
  const c = L.defaultCatalog();
  const products = [
    { id: 'b', name: 'Esmalte vermelho', typeId: 't5', subtypeId: 't5-1', order: 0 },
    { id: 'a', name: 'Água 30 vol', typeId: 't1', subtypeId: 't1-1', order: 1 },
    { id: 'c', name: 'Avulso', typeId: null, subtypeId: null, order: 2 },
  ];
  const g = L.groupProducts(products, c.types, c.subtypes);
  assert.deepEqual(g.map((x) => x.title), ['Química', 'Unha', 'Sem tipo']);
  assert.equal(g[0].items[0].subtype.name, 'Água oxigenada');
  assert.equal(L.traitsText([{ name: 'Volume', value: '20' }, { name: 'Cor', value: '' }]), 'Volume 20');
});
