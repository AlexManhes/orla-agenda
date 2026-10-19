'use strict';
const assert = require('node:assert/strict');
const M = require('../dist/js/model.js');
const NOW = '2026-10-19T11:00:00.000Z'; // Monday, 08:00 in São Paulo.
const DAY = '2026-10-19';
let count = 0;
function test(name, action) { action(); count += 1; console.log('✓ ' + name); }
function empty() { const state = M.createSeed(DAY); state.appointments = []; return state; }
function booking(overrides) { return Object.assign({ clientName: 'Cliente de teste', phone: '', professionalId: 'marina', serviceId: 'corte', date: DAY, time: '09:00', status: 'confirmed', notes: '' }, overrides); }
function throws(action, pattern) { assert.throws(action, pattern); }

test('Seed has real dates, complete availability and compatible services', () => {
  const sunday = M.createSeed('2026-10-18');
  assert.equal(M.validateState(sunday), sunday);
  assert.equal(M.nextWorkingDate(sunday, '2026-10-18'), DAY);
  assert.equal(sunday.availability.length, 21);
  assert.ok(sunday.appointments.filter(row => row.date === DAY).length >= 7);
  assert.ok(sunday.appointments.filter(row => row.date === DAY && row.status === 'pending').length >= 2);
  assert.ok(sunday.appointments.filter(row => row.status === 'completed').every(row => row.date < '2026-10-18'));
  M.validateState(M.createSeed('2026-10-17'));
});

test('Calendar arithmetic and time validation cover month/year and leap dates', () => {
  assert.equal(M.isDate('2024-02-29'), true);
  for (const date of ['2026-02-29', '2026-04-31', '2026-13-01', '18/10/2026', '', undefined]) assert.equal(M.isDate(date), false);
  assert.equal(M.addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(M.addDays('2024-03-01', -1), '2024-02-29');
  assert.equal(M.weekday(DAY), 1);
  assert.equal(M.minutes('09:15'), 555);
  assert.equal(M.timeLabel(1440), '24:00');
  throws(() => M.minutes('24:00'), /horário válido/);
  throws(() => M.minutes('9:00'), /horário válido/);
});

test('Overlaps block while adjacent appointments and separate professionals work', () => {
  const initial = empty();
  let state = M.upsertAppointment(initial, booking(), NOW);
  assert.equal(initial.appointments.length, 0);
  throws(() => M.upsertAppointment(state, booking({ time: '09:30' }), NOW), /conflita/);
  state = M.upsertAppointment(state, booking({ time: '09:45' }), NOW);
  state = M.upsertAppointment(state, booking({ professionalId: 'bruno' }), NOW);
  assert.equal(state.appointments.length, 3);
  assert.equal(M.endTime(state.appointments[0]), '09:45');
});

test('Lunch, end of shift, closed day and incompatible services are rejected', () => {
  const state = empty();
  throws(() => M.upsertAppointment(state, booking({ time: '11:30' }), NOW), /intervalo/);
  throws(() => M.upsertAppointment(state, booking({ time: '17:30' }), NOW), /expediente/);
  throws(() => M.upsertAppointment(state, booking({ date: '2026-10-25' }), NOW), /expediente/);
  throws(() => M.upsertAppointment(state, booking({ professionalId: 'bruno', serviceId: 'coloracao' }), NOW), /não é oferecido/);
  throws(() => M.upsertAppointment(state, booking({ time: '09:10' }), NOW), /15 minutos/);
  const slots = M.getSlots(state, { professionalId: 'marina', serviceId: 'coloracao', date: DAY, now: NOW });
  assert.ok(slots.includes('10:30'));
  assert.ok(!slots.includes('10:45'));
  assert.ok(!slots.includes('12:00'));
  assert.ok(slots.includes('16:30'));
  assert.ok(!slots.includes('16:45'));
});

test('Cancellation keeps history, requires a reason and releases the occupied slot', () => {
  let state = M.upsertAppointment(empty(), booking({ status: 'pending' }), NOW);
  const id = state.appointments[0].id;
  assert.ok(!M.getSlots(state, { professionalId: 'marina', serviceId: 'corte', date: DAY, now: NOW }).includes('09:00'));
  throws(() => M.cancelAppointment(state, id, '   ', NOW), /motivo/);
  state = M.cancelAppointment(state, id, 'Cliente solicitou', NOW);
  assert.equal(state.appointments.length, 1);
  assert.equal(state.appointments[0].cancelReason, 'Cliente solicitou');
  assert.equal(state.appointments[0].cancelledAt, NOW);
  assert.ok(M.getSlots(state, { professionalId: 'marina', serviceId: 'corte', date: DAY, now: NOW }).includes('09:00'));
  throws(() => M.setStatus(state, id, 'confirmed', NOW), /não pode ser reaberto/);
  throws(() => M.upsertAppointment(state, { id, status: 'confirmed' }, NOW), /não pode ser reaberto/);
  M.validateState(state);
});

test('São Paulo clock rejects past times and enforces exactly 365 future days', () => {
  const state = empty();
  throws(() => M.upsertAppointment(state, booking({ date: '2026-10-17' }), NOW), /passado/);
  throws(() => M.upsertAppointment(state, booking(), '2026-10-19T12:00:01Z'), /passado/);
  assert.ok(M.getSlots(state, { professionalId: 'marina', serviceId: 'corte', date: DAY, now: '2026-10-19T12:00:00Z' }).includes('09:00'));
  assert.ok(!M.getSlots(state, { professionalId: 'marina', serviceId: 'corte', date: DAY, now: '2026-10-19T12:00:01Z' }).includes('09:00'));
  assert.ok(!M.getSlots(state, { professionalId: 'marina', serviceId: 'corte', date: DAY, now: '2026-10-19T12:00:00.001Z' }).includes('09:00'));
  const boundary = M.addDays(DAY, 365);
  const created = M.upsertAppointment(state, booking({ date: boundary }), NOW);
  assert.equal(created.appointments[0].date, boundary);
  throws(() => M.upsertAppointment(state, booking({ date: M.addDays(DAY, 366) }), NOW), /365 dias/);
  assert.deepEqual(M.getSlots(state, { professionalId: 'marina', serviceId: 'corte', date: M.addDays(DAY, 366), now: NOW }), []);
  // 01:30 UTC is still the previous calendar day in São Paulo.
  assert.deepEqual(M.getSlots(state, { professionalId: 'marina', serviceId: 'corte', date: '2026-10-18', now: '2026-10-19T01:30:00Z' }), []); // Sunday is closed, not treated as Monday.
  assert.deepEqual(M.getSlots(state, { professionalId: 'marina', serviceId: 'corte', date: '2027-10-20', now: '2026-10-20T01:30:00Z' }), []); // Still Monday 19/10 in São Paulo: 20/10 of the following year exceeds 365 days.
});

test('Editing historical contact information preserves its schedule', () => {
  let state = M.upsertAppointment(empty(), booking(), NOW);
  const id = state.appointments[0].id;
  state = M.upsertAppointment(state, { id, clientName: 'Nome atualizado', phone: '(11) 0000-0000', notes: 'Contato atualizado' }, '2026-10-20T15:00:00Z');
  assert.equal(state.appointments[0].date, DAY);
  assert.equal(state.appointments[0].phone, '(11) 0000-0000');
  throws(() => M.upsertAppointment(state, { id, time: '10:00' }, '2026-10-20T15:00:00Z'), /passado/);
});

test('Service changes preserve booked duration and price; new appointments use new values', () => {
  let state = M.upsertAppointment(empty(), booking(), NOW);
  const id = state.appointments[0].id;
  state = M.upsertService(state, { id: 'corte', duration: 60, price: 110 });
  state = M.upsertAppointment(state, { id, notes: 'Mesmo serviço' }, NOW);
  assert.equal(state.appointments[0].duration, 45);
  assert.equal(state.appointments[0].price, 90);
  state = M.upsertAppointment(state, booking({ time: '10:00' }), NOW);
  assert.equal(state.appointments[1].duration, 60);
  assert.equal(state.appointments[1].price, 110);
  throws(() => M.upsertService(state, { id: 'corte', duration: 50 }), /múltiplo/);
  throws(() => M.upsertService(state, { id: 'corte', price: -1 }), /preço/);
  throws(() => M.upsertService(state, { id: 'corte', name: '' }), /nome/);
});

test('Availability integrity and future appointments are protected', () => {
  let state = M.upsertAppointment(empty(), booking(), NOW);
  const rows = structuredClone(state.availability);
  rows.find(row => row.professionalId === 'marina' && row.weekday === 1).start = '10:00';
  throws(() => M.setAvailability(state, rows, NOW), /afeta o agendamento/);
  throws(() => M.setAvailability(state, rows.slice(1), NOW), /sete dias/);
  const duplicate = structuredClone(state.availability);
  duplicate[0] = structuredClone(duplicate[1]);
  throws(() => M.setAvailability(state, duplicate, NOW), /repetidas/);
  const badBreak = structuredClone(state.availability);
  badBreak[1].breakEnd = '08:00';
  throws(() => M.setAvailability(state, badBreak, NOW), /intervalo/);
  state = M.cancelAppointment(state, state.appointments[0].id, 'Remarcação', NOW);
  state = M.setAvailability(state, rows, NOW);
  assert.equal(state.availability.find(row => row.professionalId === 'marina' && row.weekday === 1).start, '10:00');
  M.validateState(state);
});

test('Past bookings do not prevent changing a future weekly schedule', () => {
  let state = M.upsertAppointment(empty(), booking(), NOW);
  const rows = structuredClone(state.availability);
  rows.find(row => row.professionalId === 'marina' && row.weekday === 1).enabled = false;
  state = M.setAvailability(state, rows, '2026-10-20T15:00:00Z');
  M.validateState(state);
});

test('Status and daily indicators preserve the distinction between pending and revenue', () => {
  let state = empty();
  state = M.upsertAppointment(state, booking(), NOW);
  state = M.upsertAppointment(state, booking({ time: '10:00', status: 'pending' }), NOW);
  state = M.upsertAppointment(state, booking({ professionalId: 'bruno', serviceId: 'barba' }), NOW);
  const cancelledId = state.appointments[2].id;
  state = M.cancelAppointment(state, cancelledId, 'Teste', NOW);
  state = M.setStatus(state, state.appointments[0].id, 'completed', '2026-10-19T12:45:00.000Z');
  assert.deepEqual(M.stats(state, DAY), { total: 3, confirmed: 0, pending: 1, completed: 1, cancelled: 1, revenue: 90, bookedMinutes: 90 });
  assert.equal(M.stats(state, DAY, 'marina').total, 2);
  throws(() => M.setStatus(state, state.appointments[1].id, 'cancelled', NOW), /motivo/);
  throws(() => M.cancelAppointment(state, state.appointments[0].id, 'Teste', NOW), /concluído/);
});

test('Completion is only permitted after the reserved service ends in São Paulo', () => {
  let state = M.upsertAppointment(empty(), booking(), NOW);
  const id = state.appointments[0].id;
  throws(() => M.setStatus(state, id, 'completed', NOW), /após o fim/);
  throws(() => M.setStatus(state, id, 'completed', '2026-10-19T12:44:59.999Z'), /após o fim/);
  throws(() => M.upsertAppointment(state, { id, status: 'completed' }, NOW), /após o fim/);
  throws(() => M.upsertAppointment(state, booking({ status: 'completed' }), NOW), /Crie o agendamento/);
  state = M.setStatus(state, id, 'completed', '2026-10-19T12:45:00.000Z');
  assert.equal(state.appointments[0].status, 'completed');
  state = M.upsertAppointment(state, { id, notes: 'Histórico revisado', phone: '(11) 0000-0000' }, '2026-10-20T15:00:00Z');
  assert.equal(state.appointments[0].notes, 'Histórico revisado');
  assert.equal(state.appointments[0].status, 'completed');
  throws(() => M.upsertAppointment(state, { id, date: '2026-10-21' }, '2026-10-20T15:00:00Z'), /após o fim/);
  M.validateState(state);
});

test('Persisted state validation rejects broken references, collisions and bad calendar dates', () => {
  const state = M.createSeed(DAY);
  assert.deepEqual(M.validateState(JSON.parse(JSON.stringify(state))), state);
  const duplicate = structuredClone(state);
  duplicate.appointments.push(structuredClone(duplicate.appointments[0]));
  throws(() => M.validateState(duplicate), /repetidos/);
  const collision = structuredClone(state);
  collision.appointments[1].time = '09:30';
  throws(() => M.validateState(collision), /conflitantes/);
  const invalid = structuredClone(state);
  invalid.appointments[0].date = '2026-02-30';
  throws(() => M.validateState(invalid), /data válida/);
  const missing = structuredClone(state);
  missing.appointments[0].serviceId = 'inexistente';
  throws(() => M.validateState(missing), /serviço válido/);
  throws(() => M.upsertAppointment(empty(), booking({ clientName: ' ' }), NOW), /nome/);
});

console.log('\n' + count + ' grupos de testes aprovados.');
