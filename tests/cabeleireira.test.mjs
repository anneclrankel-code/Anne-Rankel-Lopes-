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
