// Testes das regras do app. Rodar com: node --test tests/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../js/logic.js';

const TUE = '2026-11-24'; // terça-feira
const appt = (id, start, dur, extra = {}) => ({
  id, date: TUE, start_time: start, end_time: L.toHHMM(L.toMin(start) + dur), duration_min: dur, status: 'scheduled', ...extra,
});

test('horários vagos iguais ao protótipo (mão simples, 40 min)', () => {
  const appointments = [appt('ana', '06:30', 165), appt('bia', '09:15', 40), appt('carla', '14:00', 40)];
  const blocks = [{ date: TUE, start_time: '12:00', end_time: '13:00' }];
  const slots = L.freeSlots({ date: TUE, durationMin: 40, appointments, blocks }).map(L.fmtHour);
  assert.deepEqual(slots, ['9h55', '10h35', '11h15', '13h00', '14h40', '15h20', '16h00', '16h40', '17h20']);
});

test('serviço longo só aparece onde cabe inteiro', () => {
  const appointments = [appt('a', '09:00', 40)];
  const blocks = [{ date: TUE, start_time: '12:00', end_time: '13:00' }];
  const slots = L.freeSlots({ date: TUE, durationMin: 165, appointments, blocks }).map(L.fmtHour);
  // 6h30-9h15 não cabe (bate com 9h00); 9h40-12h25 bate com almoço; depois do almoço: 13h00, 15h45 (último começa até 17h30)
  assert.deepEqual(slots, ['13h00', '15h45']);
});

test('não atende domingo nem segunda', () => {
  assert.deepEqual(L.freeSlots({ date: '2026-11-23', durationMin: 40 }), []);
  assert.deepEqual(L.freeSlots({ date: '2026-11-22', durationMin: 40 }), []);
  assert.ok(L.freeSlots({ date: '2026-11-28', durationMin: 40 }).length > 0); // sábado
});

test('cancelados e o próprio agendamento (edição) não ocupam horário', () => {
  const appointments = [appt('x', '06:30', 165, { status: 'cancelled' }), appt('y', '06:30', 40)];
  assert.equal(L.fmtHour(L.freeSlots({ date: TUE, durationMin: 40, appointments })[0]), '7h10');
  assert.equal(L.fmtHour(L.freeSlots({ date: TUE, durationMin: 40, appointments, excludeId: 'y' })[0]), '6h30');
});

test('intervalo entre clientes', () => {
  const settings = { ...L.DEFAULT_SETTINGS, bufferMin: 15 };
  const slots = L.freeSlots({ date: TUE, durationMin: 40, appointments: [appt('a', '06:30', 40)], settings }).slice(0, 3).map(L.fmtHour);
  assert.deepEqual(slots, ['7h25', '8h20', '9h15']);
});

test('horário digitado à mão', () => {
  const appointments = [appt('a', '10:00', 40)];
  assert.equal(L.checkTime({ date: TUE, start: '09:30', durationMin: 40, appointments }), 'Esse horário bate com outro atendimento.');
  assert.equal(L.checkTime({ date: TUE, start: '10:40', durationMin: 40, appointments }), null);
  assert.match(L.checkTime({ date: TUE, start: '06:00', durationMin: 40 }), /primeiro horário/);
  assert.match(L.checkTime({ date: TUE, start: '17:45', durationMin: 40 }), /último atendimento/);
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
