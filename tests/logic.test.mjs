// Testes das regras do app. Rodar com: node --test tests/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../js/logic.js';

const TUE = '2026-11-24'; // terça-feira
const appt = (id, start, dur, extra = {}) => ({
  id, date: TUE, start_time: start, end_time: L.toHHMM(L.toMin(start) + dur), duration_min: dur, status: 'scheduled', ...extra,
});

test('V2: primeiro horário às 6h, último início às 17h30', () => {
  assert.equal(L.DEFAULT_SETTINGS.openTime, '06:00');
  assert.equal(L.checkStart({ date: TUE, start: '06:00', durationMin: 40 }).error, null);
  assert.match(L.checkStart({ date: TUE, start: '05:55', durationMin: 40 }).error, /primeiro horário é às 6h00/);
  assert.equal(L.checkStart({ date: TUE, start: '17:30', durationMin: 120 }).error, null);
  assert.match(L.checkStart({ date: TUE, start: '17:31', durationMin: 40 }).error, /último atendimento/);
});

test('V2: horário quebrado e aviso de conflito com cliente ou bloqueio', () => {
  const appointments = [appt('a', '10:00', 40, { client_name: 'Bia' })];
  const blocks = [{ date: TUE, start_time: '12:00', end_time: '13:00', label: 'Almoço' }];
  assert.deepEqual(L.checkStart({ date: TUE, start: '09:05', durationMin: 55, appointments, blocks }), { error: null, conflicts: [] });
  assert.deepEqual(L.checkStart({ date: TUE, start: '09:05', durationMin: 56, appointments, blocks }).conflicts, ['Bia (10h00 às 10h40)']);
  assert.deepEqual(L.checkStart({ date: TUE, start: '11:30', durationMin: 40, appointments, blocks }).conflicts, ['Bloqueio: Almoço (12h00 às 13h00)']);
  assert.deepEqual(L.checkStart({ date: TUE, start: '10:00', durationMin: 40, appointments, blocks, excludeId: 'a' }).conflicts, []);
  const cancelled = [appt('c', '09:00', 60, { status: 'cancelled' })];
  assert.deepEqual(L.checkStart({ date: TUE, start: '09:00', durationMin: 40, appointments: cancelled }).conflicts, []);
});

test('V2: domingo e segunda fechados', () => {
  assert.match(L.checkStart({ date: '2026-11-23', start: '09:00', durationMin: 40 }).error, /não atende/);
  assert.match(L.checkStart({ date: '2026-11-22', start: '09:00', durationMin: 40 }).error, /não atende/);
  assert.equal(L.checkStart({ date: '2026-11-28', start: '09:00', durationMin: 40 }).error, null);
});

test('V2: entende o horário digitado de vários jeitos', () => {
  for (const [typed, want] of [['9:05', '09:05'], ['09:05', '09:05'], ['905', '09:05'], ['9h05', '09:05'], ['9h', '09:00'], ['9', '09:00'], ['1730', '17:30'], ['17.30', '17:30']]) {
    assert.equal(L.parseTyped(typed), want, typed);
  }
  for (const bad of ['', 'abc', '25:00', '9:75']) assert.equal(L.parseTyped(bad), null, bad);
});

test('V2: espaços livres do dia', () => {
  const appointments = [appt('ana', '06:00', 120), appt('bia', '09:15', 40)];
  const blocks = [{ date: TUE, start_time: '12:00', end_time: '13:00' }];
  const free = L.freeIntervals({ date: TUE, appointments, blocks }).map((g) => [L.fmtHour(g.start), g.end == null ? null : L.fmtHour(g.end)]);
  assert.deepEqual(free, [['8h00', '9h15'], ['9h55', '12h00'], ['13h00', null]]);
});

test('V2: semana (segunda a domingo) e mês', () => {
  assert.deepEqual(L.weekRange('2026-11-27'), { start: '2026-11-23', end: '2026-11-29' });
  assert.deepEqual(L.weekRange('2026-11-29'), { start: '2026-11-23', end: '2026-11-29' });
  assert.deepEqual(L.monthRange('2026-02-10'), { start: '2026-02-01', end: '2026-02-28' });
  assert.equal(L.monthName('2026-11-24'), 'novembro de 2026');
  assert.equal(L.addMonths('2026-01-31', 1), '2026-02-28');
});

test('V2: mensagem com mais de um serviço', () => {
  const a = { client_name: 'Ana', service_name: 'Mão simples + Pé simples', services: [{ name: 'Mão simples' }, { name: 'Pé simples' }], date: '2026-11-27', start_time: '09:05', created_on: '2026-11-26' };
  assert.equal(L.messagesFor(a)[0].text, 'Oi, Ana! Seu horário de mão simples e pé simples está marcado para sexta-feira (27/11), às 9h05. Te espero no estúdio! Fabi');
  assert.equal(L.joinNames(['a', 'b', 'c']), 'a, b e c');
});

test('régua de lembretes', () => {
  const a = { client_name: 'Maria Silva', service_name: 'Manutenção de unha', date: '2026-11-27', start_time: '09:00', created_on: '2026-11-20' };
  const msgs = L.messagesFor(a);
  assert.deepEqual(msgs.map((m) => [m.type, m.due]), [['confirm', '2026-11-20'], ['ask3d', '2026-11-24'], ['eve', '2026-11-26']]);
  assert.equal(msgs[0].text, 'Oi, Maria! Seu horário de manutenção de unha está marcado para sexta-feira (27/11), às 9h. Te espero no estúdio! Fabi');
  assert.equal(msgs[2].text, 'Oi, Maria! Amanhã às 9h é o seu horário de manutenção de unha. Até amanhã!');
});

test('agendado com menos de 3 dias pula o pedido de confirmação', () => {
  const base = { client_name: 'Ana', service_name: 'Pé simples', date: '2026-11-27', start_time: '14:30' };
  assert.deepEqual(L.messagesFor({ ...base, created_on: '2026-11-25' }).map((m) => m.type), ['confirm', 'eve']);
  assert.deepEqual(L.messagesFor({ ...base, created_on: '2026-11-26' }).map((m) => m.type), ['confirm']);
});

test('mensagens de hoje: do dia + atrasadas não enviadas', () => {
  const appts = [
    { id: '1', client_name: 'A', service_name: 'X', date: '2026-11-27', start_time: '09:00', created_on: '2026-11-20', sent_confirm: true },
    { id: '2', client_name: 'B', service_name: 'X', date: '2026-11-25', start_time: '09:00', created_on: '2026-11-18', sent_confirm: true, sent_3d: false },
    { id: '3', client_name: 'C', service_name: 'X', date: '2026-11-25', start_time: '10:00', created_on: '2026-11-18', status: 'cancelled' },
  ];
  const list = L.todaysMessages(appts, '2026-11-24');
  assert.deepEqual(list.map((m) => [m.appt.id, m.type]), [['2', 'ask3d'], ['2', 'eve'], ['1', 'ask3d']]);
});

test('link do WhatsApp', () => {
  assert.equal(L.whatsappLink('(11) 91234-5678', 'Oi!'), 'https://wa.me/5511912345678?text=Oi!');
  assert.equal(L.whatsappLink('5511912345678', 'a b'), 'https://wa.me/5511912345678?text=a%20b');
  assert.equal(L.whatsappLink('', 'x'), 'https://wa.me/?text=x');
});
