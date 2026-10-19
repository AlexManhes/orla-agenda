(function (root) {
  'use strict';

  const VERSION = 1;
  const STATUSES = Object.freeze(['confirmed', 'pending', 'completed', 'cancelled']);
  const SERVICES = Object.freeze([
    Object.freeze({ id: 'corte', name: 'Corte de cabelo', duration: 45, price: 90, color: '#aa7665' }),
    Object.freeze({ id: 'coloracao', name: 'Coloração', duration: 90, price: 220, color: '#8e789b' }),
    Object.freeze({ id: 'hidratacao', name: 'Hidratação', duration: 60, price: 130, color: '#7f9e8b' }),
    Object.freeze({ id: 'barba', name: 'Barba', duration: 30, price: 55, color: '#7893a4' }),
    Object.freeze({ id: 'manicure', name: 'Manicure', duration: 45, price: 60, color: '#c48a98' }),
    Object.freeze({ id: 'sobrancelhas', name: 'Design de sobrancelhas', duration: 30, price: 45, color: '#c19c66' })
  ]);
  const PROFESSIONALS = Object.freeze([
    Object.freeze({ id: 'marina', name: 'Marina Lima', role: 'Cabelo e coloração', color: '#aa7665', initials: 'ML', serviceIds: Object.freeze(['corte', 'coloracao', 'hidratacao']) }),
    Object.freeze({ id: 'bruno', name: 'Bruno Costa', role: 'Cabelo e barba', color: '#7893a4', initials: 'BC', serviceIds: Object.freeze(['corte', 'barba']) }),
    Object.freeze({ id: 'bia', name: 'Bia Santos', role: 'Unhas e sobrancelhas', color: '#c48a98', initials: 'BS', serviceIds: Object.freeze(['manicure', 'sobrancelhas']) })
  ]);
  const clone = value => JSON.parse(JSON.stringify(value));
  const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const fail = message => { throw new Error(message); };
  const pad = value => String(value).padStart(2, '0');

  function isDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(value + 'T12:00:00Z');
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }

  function checkDate(value) {
    if (!isDate(value)) fail('Informe uma data válida.');
    return value;
  }

  function addDays(date, number) {
    checkDate(date);
    if (!Number.isInteger(number)) fail('A quantidade de dias deve ser um número inteiro.');
    const result = new Date(date + 'T12:00:00Z');
    result.setUTCDate(result.getUTCDate() + number);
    const value = result.toISOString().slice(0, 10);
    if (!isDate(value)) fail('Data fora do intervalo permitido.');
    return value;
  }

  function weekday(date) {
    checkDate(date);
    return new Date(date + 'T12:00:00Z').getUTCDay();
  }

  function minutes(time) {
    if (typeof time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) fail('Informe um horário válido.');
    const parts = time.split(':').map(Number);
    return parts[0] * 60 + parts[1];
  }

  function timeLabel(value) {
    if (!Number.isInteger(value) || value < 0 || value > 1440) fail('Horário fora do intervalo do dia.');
    return pad(Math.floor(value / 60)) + ':' + pad(value % 60);
  }

  function endTime(appointment) {
    return timeLabel(minutes(appointment.time) + appointment.duration);
  }

  function clock(nowISO) {
    const now = new Date(nowISO === undefined ? new Date().toISOString() : nowISO);
    if (!Number.isFinite(now.getTime())) fail('Data e hora atuais inválidas.');
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
    }).formatToParts(now);
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return {
      date: values.year + '-' + values.month + '-' + values.day,
      minute: Number(values.hour) * 60 + Number(values.minute) + Number(values.second) / 60 + now.getUTCMilliseconds() / 60000,
      iso: now.toISOString()
    };
  }

  function text(value, label, required, max) {
    if (typeof value !== 'string') fail(label + ' deve ser um texto.');
    const result = value.trim();
    if (required && !result) fail('Preencha ' + label.toLowerCase() + '.');
    if (result.length > (max || 1000)) fail(label + ' ultrapassou o limite permitido.');
    return result;
  }

  function checkDuration(value) {
    if (!Number.isInteger(value) || value < 15 || value > 240 || value % 15 !== 0) {
      fail('A duração deve ser um múltiplo de 15 minutos, entre 15 e 240 minutos.');
    }
    return value;
  }

  function money(value) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1000000) {
      fail('O preço deve ser um número entre zero e R$ 1 milhão.');
    }
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  function getProfessional(state, id) {
    const result = state.professionals.find(professional => professional.id === id);
    if (!result) fail('Selecione um profissional válido.');
    return result;
  }

  function getService(state, id) {
    const result = state.services.find(service => service.id === id);
    if (!result) fail('Selecione um serviço válido.');
    return result;
  }

  function getAppointment(state, id) {
    const result = state.appointments.find(appointment => appointment.id === id);
    if (!result) fail('Agendamento não encontrado.');
    return result;
  }

  function compatible(state, professionalId, serviceId) {
    const professional = getProfessional(state, professionalId);
    const service = getService(state, serviceId);
    if (!professional.serviceIds.includes(service.id)) fail('Este serviço não é oferecido pelo profissional selecionado.');
    return service;
  }

  function validateRule(row, professionals) {
    if (!record(row) || !professionals.some(professional => professional.id === row.professionalId)) fail('Disponibilidade com profissional inválido.');
    if (!Number.isInteger(row.weekday) || row.weekday < 0 || row.weekday > 6) fail('Dia da semana inválido.');
    if (typeof row.enabled !== 'boolean') fail('Informe se o dia está disponível.');
    const start = minutes(row.start);
    const end = minutes(row.end);
    if (start % 15 || end % 15 || start >= end) fail('O expediente deve ter início antes do fim, em intervalos de 15 minutos.');
    const breakStart = row.breakStart || '';
    const breakEnd = row.breakEnd || '';
    if (Boolean(breakStart) !== Boolean(breakEnd)) fail('Informe o início e o fim do intervalo.');
    if (breakStart) {
      const beginning = minutes(breakStart);
      const ending = minutes(breakEnd);
      if (beginning % 15 || ending % 15 || beginning >= ending || beginning < start || ending > end) {
        fail('O intervalo deve estar dentro do expediente, com início antes do fim.');
      }
    }
    return {
      professionalId: row.professionalId, weekday: row.weekday, enabled: row.enabled,
      start: row.start, end: row.end, breakStart, breakEnd
    };
  }

  function validateAvailability(rows, professionals) {
    if (!Array.isArray(rows) || rows.length !== professionals.length * 7) fail('Informe os sete dias da semana para cada profissional.');
    const seen = new Set();
    const result = rows.map(row => {
      const value = validateRule(row, professionals);
      const key = value.professionalId + ':' + value.weekday;
      if (seen.has(key)) fail('Há regras de disponibilidade repetidas.');
      seen.add(key);
      return value;
    });
    return result;
  }

  function fitsAvailability(state, appointment) {
    const rule = state.availability.find(row => row.professionalId === appointment.professionalId && row.weekday === weekday(appointment.date));
    if (!rule || !rule.enabled) return false;
    const start = minutes(appointment.time);
    const end = start + appointment.duration;
    if (start < minutes(rule.start) || end > minutes(rule.end)) return false;
    if (rule.breakStart && start < minutes(rule.breakEnd) && end > minutes(rule.breakStart)) return false;
    return true;
  }

  function hasConflict(state, appointment, ignoreId) {
    const start = minutes(appointment.time);
    const end = start + appointment.duration;
    return state.appointments.some(other => other.id !== ignoreId && other.status !== 'cancelled' &&
      other.professionalId === appointment.professionalId && other.date === appointment.date &&
      start < minutes(other.time) + other.duration && end > minutes(other.time));
  }

  function nextWorkingDate(state, date) {
    checkDate(date);
    for (let offset = 0; offset < 366; offset += 1) {
      const candidate = addDays(date, offset);
      if (state.availability.some(row => row.weekday === weekday(candidate) && row.enabled)) return candidate;
    }
    fail('Não há expediente disponível nos próximos 365 dias.');
  }

  function getSlots(state, options) {
    if (!record(options) || !isDate(options.date)) return [];
    let service;
    try { service = compatible(state, options.professionalId, options.serviceId); } catch (_) { return []; }
    const current = clock(options.now);
    if (options.date < current.date || options.date > addDays(current.date, 365)) return [];
    const rule = state.availability.find(row => row.professionalId === options.professionalId && row.weekday === weekday(options.date));
    if (!rule || !rule.enabled) return [];
    const previous = options.ignoreId ? state.appointments.find(row => row.id === options.ignoreId) : null;
    const duration = previous && previous.serviceId === service.id ? previous.duration : service.duration;
    const result = [];
    for (let start = minutes(rule.start); start + duration <= minutes(rule.end); start += 15) {
      if (options.date === current.date && start < current.minute) continue;
      const appointment = { professionalId: options.professionalId, serviceId: service.id, date: options.date, time: timeLabel(start), duration };
      if (fitsAvailability(state, appointment) && !hasConflict(state, appointment, options.ignoreId)) result.push(appointment.time);
    }
    return result;
  }

  function nextId(rows) {
    let value = 1;
    const ids = new Set(rows.map(row => row.id));
    while (ids.has('appointment-' + value)) value += 1;
    return 'appointment-' + value;
  }

  function canComplete(appointment, current) {
    return appointment.date < current.date || (appointment.date === current.date && minutes(appointment.time) + appointment.duration <= current.minute);
  }

  function upsertAppointment(state, input, nowISO) {
    if (!record(input)) fail('Dados do agendamento inválidos.');
    const current = clock(nowISO);
    const previous = input.id ? getAppointment(state, input.id) : null;
    const merged = Object.assign({ phone: '', notes: '', status: 'confirmed' }, previous || {}, input);
    const service = compatible(state, merged.professionalId, merged.serviceId);
    checkDate(merged.date);
    const start = minutes(merged.time);
    if (start % 15) fail('Selecione um horário em intervalos de 15 minutos.');
    if (!STATUSES.includes(merged.status)) fail('Situação do agendamento inválida.');
    if (previous && previous.status === 'cancelled' && merged.status !== 'cancelled') fail('Um agendamento cancelado não pode ser reaberto. Crie um novo agendamento.');
    if (merged.status === 'cancelled' && (!previous || previous.status !== 'cancelled')) fail('Use a ação de cancelar e informe o motivo.');
    const duration = previous && previous.serviceId === service.id ? previous.duration : service.duration;
    const price = previous && previous.serviceId === service.id ? previous.price : service.price;
    const appointment = {
      id: previous ? previous.id : nextId(state.appointments),
      clientName: text(merged.clientName, 'Nome do cliente', true, 160),
      phone: text(merged.phone, 'Telefone', false, 50), professionalId: merged.professionalId,
      serviceId: service.id, date: merged.date, time: merged.time, duration, price, status: merged.status,
      notes: text(merged.notes, 'Observações', false, 2000), createdAt: previous ? previous.createdAt : current.iso,
      cancelReason: previous ? previous.cancelReason : '', cancelledAt: previous ? previous.cancelledAt : null
    };
    if (appointment.status === 'completed') {
      if (!previous) fail('Crie o agendamento como confirmado ou pendente. Conclua o atendimento depois do horário reservado.');
      if (!canComplete(appointment, current)) fail('O atendimento só pode ser concluído após o fim do horário reservado.');
    }
    const scheduleChanged = !previous || ['professionalId', 'serviceId', 'date', 'time'].some(key => previous[key] !== appointment[key]);
    if (scheduleChanged) {
      if (previous && previous.status === 'cancelled') fail('O horário de um agendamento cancelado deve permanecer no histórico.');
      if (appointment.date < current.date || (appointment.date === current.date && start < current.minute)) fail('Não é possível agendar em um horário passado.');
      if (appointment.date > addDays(current.date, 365)) fail('Escolha uma data nos próximos 365 dias.');
      if (!fitsAvailability(state, appointment)) fail('O serviço deve caber no expediente e respeitar o intervalo do profissional.');
      if (hasConflict(state, appointment, appointment.id)) fail('Este horário conflita com outro agendamento do profissional. Escolha um horário livre.');
    }
    const next = clone(state);
    const index = next.appointments.findIndex(row => row.id === appointment.id);
    if (index === -1) next.appointments.push(appointment);
    else next.appointments[index] = appointment;
    return next;
  }

  function cancelAppointment(state, id, reason, nowISO) {
    const current = clock(nowISO);
    const previous = getAppointment(state, id);
    if (previous.status === 'cancelled') fail('Este agendamento já foi cancelado.');
    if (previous.status === 'completed') fail('Um atendimento concluído não pode ser cancelado.');
    const cancelReason = text(reason, 'Motivo do cancelamento', true, 1000);
    const next = clone(state);
    const appointment = next.appointments.find(row => row.id === id);
    appointment.status = 'cancelled';
    appointment.cancelReason = cancelReason;
    appointment.cancelledAt = current.iso;
    return next;
  }

  function setStatus(state, id, status, nowISO) {
    const current = clock(nowISO);
    if (!['confirmed', 'completed'].includes(status)) fail('Selecione confirmado ou concluído. Para cancelar, informe um motivo.');
    const previous = getAppointment(state, id);
    if (previous.status === 'cancelled') fail('Um agendamento cancelado não pode ser reaberto. Crie um novo agendamento.');
    if (status === 'completed' && !canComplete(previous, current)) fail('O atendimento só pode ser concluído após o fim do horário reservado.');
    const next = clone(state);
    next.appointments.find(row => row.id === id).status = status;
    return next;
  }

  function upsertService(state, input) {
    if (!record(input)) fail('Dados do serviço inválidos.');
    const previous = getService(state, input.id);
    const merged = Object.assign({}, previous, input);
    const service = {
      id: previous.id, name: text(merged.name, 'Nome do serviço', true, 100),
      duration: checkDuration(merged.duration), price: money(merged.price), color: previous.color
    };
    const next = clone(state);
    next.services[next.services.findIndex(row => row.id === service.id)] = service;
    return next;
  }

  function setAvailability(state, rows, nowISO) {
    const current = clock(nowISO);
    const availability = validateAvailability(rows, state.professionals);
    const candidate = Object.assign({}, state, { availability });
    for (const appointment of state.appointments) {
      const isFuture = appointment.date > current.date || (appointment.date === current.date && minutes(appointment.time) + appointment.duration > current.minute);
      if (appointment.status !== 'cancelled' && isFuture && !fitsAvailability(candidate, appointment)) {
        const professional = getProfessional(state, appointment.professionalId);
        fail('A mudança afeta o agendamento de ' + appointment.clientName + ', com ' + professional.name + ', em ' + appointment.date.split('-').reverse().join('/') + ' às ' + appointment.time + '. Reagende ou cancele antes de alterar a disponibilidade.');
      }
    }
    const next = clone(state);
    next.availability = availability;
    return next;
  }

  function validateState(state) {
    if (!record(state) || state.version !== VERSION) fail('Formato de dados incompatível.');
    for (const key of ['services', 'professionals', 'appointments', 'availability']) {
      if (!Array.isArray(state[key]) || state[key].length > 100000) fail('Coleção de dados inválida: ' + key + '.');
    }
    const ids = (rows, label) => {
      const seen = new Set();
      for (const row of rows) {
        if (!record(row)) fail(label + ' inválido.');
        const id = text(row.id, 'Identificador', true, 100);
        if (seen.has(id)) fail('Há identificadores repetidos em ' + label + '.');
        seen.add(id);
      }
    };
    ids(state.services, 'serviços'); ids(state.professionals, 'profissionais'); ids(state.appointments, 'agendamentos');
    if (state.professionals.length !== PROFESSIONALS.length || PROFESSIONALS.some(professional => !state.professionals.some(row => row.id === professional.id))) fail('Lista de profissionais inválida.');
    if (state.services.length !== SERVICES.length || SERVICES.some(service => !state.services.some(row => row.id === service.id))) fail('Lista de serviços inválida.');
    for (const service of state.services) {
      text(service.name, 'Nome do serviço', true, 100); checkDuration(service.duration); money(service.price);
      if (typeof service.color !== 'string' || !/^#[a-f\d]{6}$/i.test(service.color)) fail('Cor do serviço inválida.');
    }
    for (const professional of state.professionals) {
      text(professional.name, 'Nome do profissional', true, 100); text(professional.role, 'Especialidade', true, 100); text(professional.initials, 'Iniciais', true, 5);
      if (typeof professional.color !== 'string' || !/^#[a-f\d]{6}$/i.test(professional.color)) fail('Cor do profissional inválida.');
      const expected = PROFESSIONALS.find(row => row.id === professional.id).serviceIds;
      if (!Array.isArray(professional.serviceIds) || professional.serviceIds.length !== expected.length || expected.some(id => !professional.serviceIds.includes(id))) fail('Serviços do profissional inválidos.');
    }
    validateAvailability(state.availability, state.professionals);
    const timestamp = (value, label) => {
      if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(value) || !Number.isFinite(new Date(value).getTime())) fail(label + ' inválida.');
    };
    for (const appointment of state.appointments) {
      compatible(state, appointment.professionalId, appointment.serviceId);
      text(appointment.clientName, 'Nome do cliente', true, 160); text(appointment.phone, 'Telefone', false, 50); text(appointment.notes, 'Observações', false, 2000);
      checkDate(appointment.date);
      if (minutes(appointment.time) % 15) fail('Horário fora dos intervalos de 15 minutos.');
      checkDuration(appointment.duration); money(appointment.price);
      if (minutes(appointment.time) + appointment.duration > 1440) fail('O agendamento não pode ultrapassar o dia.');
      if (!STATUSES.includes(appointment.status)) fail('Situação de agendamento inválida.');
      timestamp(appointment.createdAt, 'Data de criação');
      text(appointment.cancelReason, 'Motivo do cancelamento', appointment.status === 'cancelled', 1000);
      if (appointment.status === 'cancelled') timestamp(appointment.cancelledAt, 'Data de cancelamento');
      else if (appointment.cancelledAt !== null || appointment.cancelReason !== '') fail('Um agendamento ativo não pode ter dados de cancelamento.');
      if (appointment.status !== 'cancelled' && hasConflict(state, appointment, appointment.id)) fail('Há agendamentos conflitantes para o mesmo profissional.');
    }
    return state;
  }

  function stats(state, date, professionalId) {
    checkDate(date);
    const professional = professionalId || 'all';
    if (professional !== 'all') getProfessional(state, professional);
    const appointments = state.appointments.filter(appointment => appointment.date === date && (professional === 'all' || appointment.professionalId === professional));
    const result = { total: appointments.length, confirmed: 0, pending: 0, completed: 0, cancelled: 0, revenue: 0, bookedMinutes: 0 };
    for (const appointment of appointments) {
      result[appointment.status] += 1;
      if (['confirmed', 'completed'].includes(appointment.status)) result.revenue += appointment.price;
      if (appointment.status !== 'cancelled') result.bookedMinutes += appointment.duration;
    }
    result.revenue = Math.round(result.revenue * 100) / 100;
    return result;
  }

  function createSeed(today) {
    const currentDate = today === undefined ? clock().date : checkDate(today);
    const availability = PROFESSIONALS.flatMap(professional => Array.from({ length: 7 }, (_, day) => ({
      professionalId: professional.id, weekday: day, enabled: day !== 0,
      start: '09:00', end: day === 6 ? '14:00' : '18:00',
      breakStart: day > 0 && day < 6 ? '12:00' : '', breakEnd: day > 0 && day < 6 ? '13:00' : ''
    })));
    const state = { version: VERSION, services: clone(SERVICES), professionals: clone(PROFESSIONALS), appointments: [], availability };
    const day = nextWorkingDate(state, currentDate);
    const following = nextWorkingDate(state, addDays(day, 1));
    const demo = [
      ['Camila Rocha', 'marina', 'corte', day, '09:00', 'confirmed', 'Cliente prefere acabamento natural.'],
      ['Renata Alves', 'marina', 'coloracao', day, '10:00', 'pending', 'Confirmar o tom durante a avaliação.'],
      ['Júlia Fernandes', 'marina', 'hidratacao', day, '13:00', 'confirmed', ''],
      ['Pedro Martins', 'bruno', 'barba', day, '09:00', 'completed', 'Atendimento concluído.'],
      ['Lucas Oliveira', 'bruno', 'corte', day, '10:00', 'pending', 'Primeira visita.'],
      ['Rafael Souza', 'bruno', 'barba', day, '11:00', 'confirmed', ''],
      ['Ana Ribeiro', 'bia', 'manicure', day, '09:00', 'confirmed', ''],
      ['Beatriz Gomes', 'bia', 'sobrancelhas', day, '10:00', 'cancelled', ''],
      ['Laura Nunes', 'bia', 'manicure', day, '11:00', 'confirmed', ''],
      ['Sofia Mendes', 'bia', 'manicure', day, '13:00', 'confirmed', ''],
      ['Fernanda Lima', 'marina', 'corte', following, '09:00', 'confirmed', ''],
      ['Gabriel Santos', 'bruno', 'barba', following, '10:00', 'pending', '']
    ];
    let completedDate = addDays(currentDate, -1);
    while (!state.availability.some(rule => rule.weekday === weekday(completedDate) && rule.enabled)) completedDate = addDays(completedDate, -1);
    state.appointments = demo.map((row, index) => {
      const service = getService(state, row[2]);
      return {
        id: 'appointment-' + (index + 1), clientName: row[0], phone: '', professionalId: row[1], serviceId: row[2], date: row[5] === 'completed' && row[3] >= currentDate ? completedDate : row[3], time: row[4],
        duration: service.duration, price: service.price, status: row[5], notes: row[6],
        createdAt: addDays(currentDate, -2) + 'T12:00:00.000Z',
        cancelReason: row[5] === 'cancelled' ? 'Cliente solicitou o cancelamento.' : '',
        cancelledAt: row[5] === 'cancelled' ? addDays(currentDate, -1) + 'T15:00:00.000Z' : null
      };
    });
    return validateState(state);
  }

  const api = Object.freeze({
    VERSION, PROFESSIONALS, SERVICES, STATUSES, isDate, addDays, weekday, minutes, timeLabel, endTime,
    createSeed, nextWorkingDate, getSlots, upsertAppointment, cancelAppointment, setStatus,
    upsertService, setAvailability, validateState, stats
  });
  root.AgendaModel = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
