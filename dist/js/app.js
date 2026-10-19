/* Orla — interface, agenda e armazenamento local. */
(() => {
  'use strict';
  const M = globalThis.AgendaModel;
  const KEY = 'orla-agenda-v1';
  const today = () => { const parts = new Intl.DateTimeFormat('en-CA', { timeZone:'America/Sao_Paulo', year:'numeric', month:'2-digit', day:'2-digit' }).formatToParts(new Date()); return ['year','month','day'].map(t => parts.find(p => p.type === t).value).join('-'); };
  const TODAY = today();
  const labels = { agenda:'Agenda', bookings:'Agendamentos', services:'Serviços', team:'Profissionais' };
  const statuses = { confirmed:'Confirmado', pending:'Pendente', completed:'Concluído', cancelled:'Cancelado' };
  const days = ['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado'];
  const paths = {
    agenda:'<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 11h18M8 15h3M8 18h6"/>',
    bookings:'<path d="M8 3h8v4H8zM8 5H5v16h14V5h-3M8 12h8M8 16h5"/>',
    services:'<path d="m12 3 3 6 6 3-6 3-3 6-3-6-6-3 6-3z"/>',
    team:'<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M17 5a3 3 0 0 1 0 6M18 15a5 5 0 0 1 3 4v2"/>',
    plus:'<path d="M12 5v14M5 12h14"/>', left:'<path d="m14 6-6 6 6 6"/>', right:'<path d="m10 6 6 6-6 6"/>',
    clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', check:'<path d="m5 12 4 4L19 6"/>',
    download:'<path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5"/>', search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
    money:'<rect x="2" y="5" width="20" height="14" rx="3"/><circle cx="12" cy="12" r="3"/><path d="M6 12h.01M18 12h.01"/>',
    edit:'<path d="m15 5 4 4M4 20l4-1L21 6l-4-4L4 15z"/>', grid:'<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 9h18M9 9v12M15 9v12"/>',
    list:'<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>', cancel:'<circle cx="12" cy="12" r="9"/><path d="m8 8 8 8M16 8l-8 8"/>'
  };
  const icon = name => `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.services}</svg>`;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = value => new Intl.NumberFormat('pt-BR', { style:'currency', currency:'BRL', minimumFractionDigits:2, maximumFractionDigits:2 }).format(value || 0);
  const date = value => new Date(`${value}T12:00:00`);
  const dateLabel = (value, options = { day:'2-digit', month:'long' }) => new Intl.DateTimeFormat('pt-BR', options).format(date(value));
  const shortDate = value => dateLabel(value, { day:'2-digit', month:'short' }).replace('.', '');
  const $ = selector => document.querySelector(selector);
  let state, storageOK = true;
  try { const saved = localStorage.getItem(KEY); state = saved ? JSON.parse(saved) : M.createSeed(TODAY); M.validateState(state); if (!saved) localStorage.setItem(KEY, JSON.stringify(state)); }
  catch { state = M.createSeed(TODAY); storageOK = false; }
  let selectedDate = TODAY;
  try { selectedDate = M.nextWorkingDate(state, TODAY); } catch { /* A closed weekly schedule is still a valid agenda. */ }
  let professional = 'all', view = labels[location.hash.slice(1)] ? location.hash.slice(1) : 'agenda';
  let display = 'calendar', search = '', statusFilter = 'all', bookingDateFilter = '', formType = '', entity = null, detailId = null, toastTimer;
  const prof = id => state.professionals.find(p => p.id === id);
  const service = id => state.services.find(s => s.id === id);
  const appointment = id => state.appointments.find(a => a.id === id);
  const badge = status => `<span class="status-badge status-${status}"><i></i>${statuses[status]}</span>`;
  const avatar = p => `<span class="avatar" style="--avatar-color:${esc(p.color)}">${esc(p.initials)}</span>`;
  const professionalOptions = (value = professional, all = true) => `${all ? `<option value="all" ${value === 'all' ? 'selected' : ''}>Todos os profissionais</option>` : ''}${state.professionals.map(p => `<option value="${p.id}" ${value === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}`;
  const ordered = rows => [...rows].sort((a,b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
  function toast(message) { clearTimeout(toastTimer); $('#toast').textContent = message; $('#toast').classList.add('show'); toastTimer = setTimeout(() => $('#toast').classList.remove('show'), 4500); }
  function commit(next) { state = next; try { localStorage.setItem(KEY, JSON.stringify(state)); storageOK = true; } catch { storageOK = false; toast('Não foi possível salvar neste navegador. Exporte uma cópia dos dados.'); } render(); if ($('#detail-dialog').open && detailId) { fillDetail(); prepareDetailActions(); } }
  function syncMenu() { $('#sidebar').inert = matchMedia('(max-width: 760px)').matches && !$('#sidebar').classList.contains('open'); }
  function route(next) { view = next; location.hash = next; search = ''; $('#sidebar').classList.remove('open'); $('#mobile-menu').setAttribute('aria-expanded','false'); syncMenu(); render(); window.scrollTo(0,0); }
  function heading(title, subtitle, action = 'new-booking', button = 'Novo agendamento') { return `<div class="page-heading"><div><div class="eyebrow">CADA ENCONTRO TEM SEU TEMPO</div><h1>${title}</h1><p class="subtitle">${subtitle}</p></div><div class="heading-actions"><button class="button primary" data-action="${action}">${icon('plus')}${button}</button></div></div>`; }
  function empty(title, text) { return `<div class="empty-state">${icon('agenda')}<h3>${title}</h3><p>${text}</p><button class="button secondary" data-action="new-booking">Agendar um atendimento</button></div>`; }
  function render() {
    $('#navigation').innerHTML = Object.entries(labels).map(([key,label]) => `<a href="#${key}" data-view="${key}" class="nav-item ${view === key ? 'active' : ''}" ${view === key ? 'aria-current="page"' : ''}>${icon(key)}<span class="nav-label">${label}</span>${key === 'bookings' ? `<span class="nav-count">${state.appointments.filter(a => a.status === 'pending').length}</span>` : ''}</a>`).join('');
    $('#breadcrumb').textContent = labels[view]; $('#export-data').innerHTML = icon('download');
    $('.saved-label').innerHTML = `<i></i>${storageOK ? 'Salvo neste navegador' : 'Salvamento indisponível'}`;
    $('#content').innerHTML = ({ agenda:agendaView, bookings:bookingsView, services:servicesView, team:teamView })[view]() + `<p class="demo-note"><span class="demo-dot"></span>Espaço de demonstração · Dados fictícios · Horários de Brasília${storageOK ? '' : ' · Exporte seus dados para guardar uma cópia'}</p>`;
    bindView();
  }
  function summary() {
    const s = M.stats(state, selectedDate, professional);
    return `<div class="summary-grid">${[
      ['Atendimentos do dia',s.total - s.cancelled,`${s.cancelled} ${s.cancelled === 1 ? 'cancelamento' : 'cancelamentos'} no histórico`,'agenda'],
      ['Confirmados',s.confirmed,'Tudo pronto para receber bem','check'],
      ['Aguardando confirmação',s.pending,'Uma conversa faz a diferença','clock'],
      ['Receita prevista',money(s.revenue),'Confirmados e concluídos do dia','money']
    ].map(([label,value,note,i]) => `<article class="metric-card"><div class="metric-label">${label}<span class="metric-icon">${icon(i)}</span></div><div class="metric-value">${value}</div><div class="metric-note">${note}</div></article>`).join('')}</div>`;
  }
  function agendaView() {
    const monday = M.addDays(selectedDate, -((M.weekday(selectedDate) + 6) % 7));
    const visibleProfs = state.professionals.filter(p => professional === 'all' || p.id === professional);
    const records = ordered(state.appointments.filter(a => a.date === selectedDate && a.status !== 'cancelled' && (professional === 'all' || a.professionalId === professional)));
    return `${heading('Sua agenda, em equilíbrio.', 'Organize os próximos encontros. Cuide de cada detalhe.')}${summary()}<div class="workspace-grid"><section class="panel agenda-panel"><div class="calendar-toolbar"><div class="date-navigation"><button class="button ghost small" data-action="previous-day" aria-label="Dia anterior">${icon('left')}</button><div class="date-title"><strong>${dateLabel(selectedDate)}</strong><span>${days[M.weekday(selectedDate)]} · ${selectedDate.slice(0,4)}</span></div><button class="button ghost small" data-action="next-day" aria-label="Próximo dia">${icon('right')}</button></div><div class="calendar-actions"><button class="button secondary small" data-action="today">Hoje</button><label><span class="sr-only">Escolher data da agenda</span><input class="agenda-date-input" id="agenda-date" type="date" value="${selectedDate}" required aria-label="Escolher data da agenda"></label><div class="segmented" aria-label="Visualização da agenda"><button data-display="calendar" class="${display === 'calendar' ? 'active' : ''}" aria-label="Visualizar grade" aria-pressed="${display === 'calendar'}">${icon('grid')}</button><button data-display="list" class="${display === 'list' ? 'active' : ''}" aria-label="Visualizar lista" aria-pressed="${display === 'list'}">${icon('list')}</button></div></div></div><div class="week-strip"><button data-action="previous-week" class="week-arrow" aria-label="Semana anterior">${icon('left')}</button>${Array.from({length:7},(_,i) => { const d = M.addDays(monday,i); return `<button data-date="${d}" class="${d === selectedDate ? 'active' : ''} ${d === TODAY ? 'today' : ''}" aria-pressed="${d === selectedDate}"><span class="day-name">${days[M.weekday(d)].slice(0,3)}</span><span class="day-number">${d.slice(-2)}</span><span class="day-dot ${state.appointments.some(a => a.date === d && a.status !== 'cancelled') ? 'has-bookings' : ''}"></span></button>`; }).join('')}<button data-action="next-week" class="week-arrow" aria-label="Próxima semana">${icon('right')}</button></div><div class="professional-strip"><button class="professional-chip ${professional === 'all' ? 'active' : ''}" data-professional="all">${icon('team')}<span>Todos</span></button>${state.professionals.map(p => `<button class="professional-chip ${professional === p.id ? 'active' : ''}" data-professional="${p.id}">${avatar(p)}<span>${esc(p.name.split(' ')[0])}</span></button>`).join('')}</div>${display === 'calendar' ? calendar(visibleProfs, records) : list(records)}<div class="calendar-legend"><span><i class="legend-dot confirmed"></i>Confirmado</span><span><i class="legend-dot pending"></i>Pendente</span><span><i class="legend-dot completed"></i>Concluído</span><span class="muted">Cancelamentos ficam no histórico</span></div></section><aside class="agenda-aside">${miniCalendar()}${nextCard(records)}<article class="help-card"><div class="help-symbol">${icon('check')}</div><h3>Uma agenda sem desencontros.</h3><p>Os horários respeitam a duração do serviço, os intervalos e a disponibilidade de cada profissional.</p><span>Reservas pendentes também bloqueiam o horário.</span></article></aside></div>`;
  }
  function calendar(professionals, records) {
    const rules = professionals.map(p => state.availability.find(r => r.professionalId === p.id && r.weekday === M.weekday(selectedDate)));
    const starts = rules.filter(r => r?.enabled).map(r => M.minutes(r.start));
    const ends = rules.filter(r => r?.enabled).map(r => M.minutes(r.end));
    const start = Math.floor(Math.min(480,...starts,...records.map(a => M.minutes(a.time))) / 60) * 60;
    const end = Math.ceil(Math.max(1140,...ends,...records.map(a => M.minutes(a.time) + a.duration)) / 60) * 60;
    const px = 1.2, height = (end - start) * px;
    const columns = `60px repeat(${professionals.length},minmax(175px,1fr))`;
    return `<div class="agenda-grid"><div class="agenda-grid-inner" style="min-width:${60 + professionals.length * 175}px"><div class="agenda-header" style="display:grid;grid-template-columns:${columns}"><div class="agenda-time">GMT−3</div>${professionals.map(p => `<div class="agenda-professional">${avatar(p)}<div><strong>${esc(p.name)}</strong><small>${esc(p.role)}</small></div></div>`).join('')}</div><div class="agenda-body" style="display:grid;grid-template-columns:${columns};height:${height}px"><div class="time-column" style="position:relative">${Array.from({length:(end - start)/60},(_,i) => `<span class="time-label" style="position:absolute;top:${i * 72}px">${M.timeLabel(start + i * 60)}</span>`).join('')}</div>${professionals.map((p,i) => { const rule = rules[i]; const band = (from,to,text,cls='') => `<div class="break-band ${cls}" style="position:absolute;top:${Math.max(0,from - start) * px}px;height:${Math.max(0,Math.min(end,to) - Math.max(start,from)) * px}px"><span>${text}</span></div>`; return `<div class="schedule-column" style="height:${height}px"><div class="schedule-lines"></div>${rule?.enabled ? `${start < M.minutes(rule.start) ? band(start,M.minutes(rule.start),'Indisponível','off-hours') : ''}${rule.breakStart && rule.breakEnd ? band(M.minutes(rule.breakStart),M.minutes(rule.breakEnd),'Intervalo') : ''}${end > M.minutes(rule.end) ? band(M.minutes(rule.end),end,'Indisponível','off-hours') : ''}` : band(start,end,'Folga','off-hours')}${records.filter(a => a.professionalId === p.id).map(a => `<button class="appointment-card status-${a.status} ${a.duration <= 30 ? 'compact' : ''}" data-appointment="${a.id}" style="position:absolute;top:${(M.minutes(a.time) - start) * px + 3}px;height:${a.duration * px - 6}px;--appointment-color:${esc(p.color)}" aria-label="${esc(a.clientName)}, ${esc(service(a.serviceId)?.name)}, ${a.time} às ${M.endTime(a)}, ${statuses[a.status]}"><span class="appointment-time">${a.time} – ${M.endTime(a)}${a.status === 'pending' ? '<i class="pending-dot" title="Pendente"></i>' : ''}</span><span class="appointment-client">${esc(a.clientName)}</span><span class="appointment-service">${esc(service(a.serviceId)?.name)}</span></button>`).join('')}</div>`; }).join('')}</div></div></div>`;
  }
  function miniCalendar() {
    const first = `${selectedDate.slice(0,7)}-01`, offset = (M.weekday(first) + 6) % 7;
    const length = new Date(Number(selectedDate.slice(0,4)), Number(selectedDate.slice(5,7)), 0).getDate();
    return `<article class="panel mini-calendar"><div class="panel-header"><h2 class="panel-title">${dateLabel(selectedDate,{month:'long',year:'numeric'})}</h2><span class="mini-month-icon">${icon('agenda')}</span></div><div class="panel-body"><div class="mini-weekdays">${['S','T','Q','Q','S','S','D'].map(d => `<span>${d}</span>`).join('')}</div><div class="mini-days">${Array.from({length:offset},() => '<span></span>').join('')}${Array.from({length},(_,i) => { const d = `${selectedDate.slice(0,7)}-${String(i+1).padStart(2,'0')}`; return `<button data-date="${d}" class="${d === selectedDate ? 'active' : ''} ${d === TODAY ? 'today' : ''}" aria-label="${dateLabel(d)}" aria-pressed="${d === selectedDate}">${i+1}</button>`; }).join('')}</div></div></article>`;
  }
  function nextCard(records) {
    const nowParts = new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date());
    const next = records.find(a => ['confirmed','pending'].includes(a.status) && (a.date > TODAY || (a.date === TODAY && a.time >= nowParts)));
    return `<article class="panel today-card"><div class="panel-header"><h2 class="panel-title">Próximo atendimento</h2>${icon('clock')}</div><div class="panel-body">${next ? `<div class="next-time">${next.time}<span>${shortDate(next.date)}</span></div><h3>${esc(next.clientName)}</h3><p class="muted">${esc(service(next.serviceId)?.name)} · ${next.duration} min</p><div class="next-professional">${avatar(prof(next.professionalId))}<span>${esc(prof(next.professionalId).name)}</span>${badge(next.status)}</div><button class="button secondary full-width" data-appointment="${next.id}">Ver agendamento ${icon('right')}</button>` : '<div class="no-next">✧<h3>Um respiro na agenda.</h3><p class="muted">Nenhum próximo atendimento nesta data com os filtros atuais.</p></div>'}</div></article>`;
  }
  function list(records) { return records.length ? `<div class="appointment-list">${records.map(a => `<button class="appointment-list-row" data-appointment="${a.id}"><div class="list-time"><strong>${a.time}</strong><span>${M.endTime(a)}</span></div><span class="list-divider" style="background:${esc(prof(a.professionalId).color)}"></span><div class="list-client"><strong>${esc(a.clientName)}</strong><span>${esc(service(a.serviceId)?.name)} · ${esc(prof(a.professionalId).name)}</span></div><span class="list-price">${money(a.price)}</span>${badge(a.status)}${icon('right')}</button>`).join('')}</div>` : empty('Um dia cheio de possibilidades.', 'Nenhum atendimento nesta data. Escolha um horário livre para começar.'); }
  function bookingsView() {
    const records = ordered(state.appointments.filter(a => (professional === 'all' || a.professionalId === professional) && (statusFilter === 'all' || a.status === statusFilter) && (!bookingDateFilter || a.date === bookingDateFilter) && `${a.clientName} ${a.phone} ${service(a.serviceId)?.name} ${prof(a.professionalId)?.name}`.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR'))));
    return `${heading('Todos os encontros.', 'Consulte sua carteira de agendamentos e o histórico de cancelamentos.')}<div class="panel"><div class="filters booking-filters"><label class="search-field">${icon('search')}<input type="search" id="booking-search" value="${esc(search)}" placeholder="Buscar cliente ou serviço…" aria-label="Buscar agendamentos"></label><label class="filter-field"><span class="sr-only">Profissional</span><select id="professional-filter">${professionalOptions()}</select></label><label class="filter-field"><span class="sr-only">Status</span><select id="status-filter"><option value="all">Todos os status</option>${Object.entries(statuses).map(([k,v]) => `<option value="${k}" ${k === statusFilter ? 'selected' : ''}>${v}</option>`).join('')}</select></label><label class="filter-field"><span class="sr-only">Filtrar por data</span><input id="booking-date" type="date" value="${bookingDateFilter}" aria-label="Filtrar por data"></label>${bookingDateFilter ? '<button class="button ghost small" data-action="clear-date">Limpar data</button>' : ''}</div><div class="panel-header"><h2 class="panel-title">Histórico de agendamentos</h2><span class="muted">${records.length} registros</span></div>${records.length ? `<div class="table-wrap"><table><thead><tr><th>Cliente</th><th>Data e horário</th><th>Serviço / profissional</th><th>Valor</th><th>Status</th><th></th></tr></thead><tbody>${records.map(a => `<tr><td><span class="cell-title">${esc(a.clientName)}</span><span class="cell-subtitle">${esc(a.phone || 'Sem telefone')}</span></td><td><span class="cell-title">${shortDate(a.date)} ${a.date.slice(0,4)}</span><span class="cell-subtitle">${a.time} – ${M.endTime(a)}</span></td><td><span class="cell-title">${esc(service(a.serviceId)?.name)}</span><span class="cell-subtitle">${esc(prof(a.professionalId)?.name)}</span></td><td>${money(a.price)}</td><td>${badge(a.status)}</td><td><button class="button ghost small" data-appointment="${a.id}" aria-label="Ver agendamento de ${esc(a.clientName)}">${icon('right')}</button></td></tr>`).join('')}</tbody></table></div>` : empty('Nenhum agendamento encontrado.', 'Tente outro nome ou ajuste os filtros.')}</div>`;
  }
  function servicesView() {
    return `${heading('O cuidado começa aqui.', 'Duração e valores claros para cada serviço do seu estúdio.')}<div class="services-intro"><span class="availability-badge">${state.services.length} serviços no catálogo</span><span class="muted">Alterações valem para novas reservas. O histórico preserva os valores combinados.</span></div><div class="services-grid">${state.services.map((s,i) => `<article class="panel service-card"><div class="service-card-top"><span class="service-icon service-tone-${i%3}">${icon('services')}</span><button class="button ghost small" data-action="edit-service" data-id="${s.id}" aria-label="Editar ${esc(s.name)}">${icon('edit')}</button></div><h2>${esc(s.name)}</h2><div class="service-duration">${icon('clock')}${s.duration} minutos</div><div class="service-price">${money(s.price)}<small>por atendimento</small></div><div class="service-footer"><span>Profissionais</span><div class="service-avatars">${state.professionals.filter(p => p.serviceIds.includes(s.id)).map(p => `<span title="${esc(p.name)}">${avatar(p)}</span>`).join('')}</div></div><button class="button secondary full-width" data-action="book-service" data-id="${s.id}">Agendar serviço ${icon('right')}</button></article>`).join('')}</div>`;
  }
  function teamView() {
    return `${heading('Talentos com tempo para cuidar.', 'Defina a rotina de atendimento, as pausas e os dias de descanso.')}<div class="notice">${icon('check')}Mudanças de disponibilidade são verificadas contra as reservas futuras. Reagende os atendimentos afetados antes de reduzir um horário.</div><div class="availability-grid">${state.professionals.map(p => `<article class="panel professional-card"><div class="professional-card-header">${avatar(p)}<div><h2>${esc(p.name)}</h2><p class="muted">${esc(p.role)}</p></div><span class="availability-badge">Ativo</span></div><div class="professional-services">${p.serviceIds.map(id => `<span>${esc(service(id)?.name)}</span>`).join('')}</div><div class="weekly-list">${[1,2,3,4,5,6,0].map(day => { const r = state.availability.find(x => x.professionalId === p.id && x.weekday === day); return `<div class="weekly-row"><span class="weekday">${days[day].replace('-feira','')}</span>${r?.enabled ? `<span class="working-hours">${r.start} – ${r.end}${r.breakStart ? `<small>Intervalo ${r.breakStart} – ${r.breakEnd}</small>` : ''}</span>` : '<span class="off-day">Folga</span>'}</div>`; }).join('')}</div><button class="button secondary full-width" data-action="edit-availability" data-id="${p.id}">${icon('edit')}Editar disponibilidade</button></article>`).join('')}</div>`;
  }
  function field(label,name,value,settings = {}) { return `<label class="field ${settings.full ? 'full' : ''}" for="field-${name}"><span>${label}${settings.required ? ' <b>*</b>' : ''}</span>${settings.select !== undefined ? `<select name="${name}" id="field-${name}" ${settings.required ? 'required' : ''}>${settings.select}</select>` : settings.textarea ? `<textarea id="field-${name}" name="${name}" rows="3" maxlength="1500">${esc(value)}</textarea>` : `<input type="${settings.type || 'text'}" id="field-${name}" name="${name}" value="${esc(value)}" ${settings.required ? 'required' : ''} ${settings.attrs || ''}>`}</label>`; }
  const options = (rows,value) => rows.map(([id,label]) => `<option value="${esc(id)}" ${id === value ? 'selected' : ''}>${esc(label)}</option>`).join('');
  function openForm(type, item = null, extra = {}) {
    formType = type; entity = item; const e = item || extra;
    $('#form-error').hidden = true; $('#form-error').textContent = ''; $('#entity-form').reset();
    $('#form-eyebrow').textContent = type === 'cancel' ? 'MUDANÇA DE PLANOS' : type === 'availability' ? 'O RITMO DA SUA EQUIPE' : 'CADA DETALHE IMPORTA';
    $('#form-title').textContent = type === 'booking' ? item ? 'Editar agendamento' : 'Novo agendamento' : type === 'service' ? 'Editar serviço' : type === 'availability' ? `Disponibilidade · ${prof(e.professionalId).name.split(' ')[0]}` : 'Cancelar agendamento';
    $('#save-form').textContent = type === 'booking' ? item ? 'Salvar alterações' : 'Agendar atendimento' : type === 'cancel' ? 'Confirmar cancelamento' : 'Salvar alterações';
    $('#save-form').classList.toggle('danger', type === 'cancel');
    if (type === 'booking') {
      const selectedProf = e.professionalId || (professional !== 'all' ? professional : state.professionals.find(p => !e.serviceId || p.serviceIds.includes(e.serviceId)).id);
      $('#form-fields').innerHTML = `<div class="form-grid">${field('Nome do cliente','clientName',e.clientName,{required:true,attrs:'maxlength="120" autocomplete="name"'})}${field('Telefone','phone',e.phone,{type:'tel',attrs:'maxlength="40" autocomplete="tel" placeholder="(11) 99999-9999"'})}${field('Profissional','professionalId','',{required:true,select:professionalOptions(selectedProf,false)})}${field('Serviço','serviceId','',{required:true,select:''})}${field('Data','date',e.date || (selectedDate < TODAY ? TODAY : selectedDate),{required:true,type:'date',attrs:`min="${e.date && e.date < TODAY ? e.date : TODAY}" max="${M.addDays(TODAY,365)}"`})}${field('Status','status','',{select:options([['confirmed','Confirmado'],['pending','Aguardando confirmação'],...(e.status === 'completed' ? [['completed','Concluído']] : [])],e.status || 'confirmed')})}<div class="field full"><span>Horários disponíveis <b>*</b></span><input type="hidden" id="field-time" name="time" value="${esc(e.time || '')}"><div id="slots" class="slot-grid" aria-label="Horários disponíveis"></div><p id="slot-hint" class="form-hint"></p></div><div class="booking-summary field full" id="booking-summary"></div>${field('Observações','notes',e.notes,{textarea:true,full:true})}</div>`;
      const fillServices = selected => { const p = prof($('#field-professionalId').value); $('#field-serviceId').innerHTML = options(p.serviceIds.map(id => [id,service(id).name]),p.serviceIds.includes(selected) ? selected : p.serviceIds[0]); };
      fillServices(e.serviceId);
      const updateSlots = () => {
        const d = $('#field-date').value, p = $('#field-professionalId').value, s = $('#field-serviceId').value;
        const same = item && item.date === d && item.professionalId === p && item.serviceId === s;
        let slots = M.isDate(d) ? M.getSlots(state,{professionalId:p,serviceId:s,date:d,ignoreId:item?.id}) : [];
        if (same && !slots.includes(item.time)) slots = [...slots,item.time].sort();
        const oldTime = $('#field-time').value; $('#field-time').value = slots.includes(oldTime) ? oldTime : '';
        $('#slots').innerHTML = slots.length ? slots.map(t => `<button type="button" class="slot-button ${t === $('#field-time').value ? 'selected' : ''}" data-slot="${t}" aria-pressed="${t === $('#field-time').value}">${t}</button>`).join('') : '<p class="no-slots">Nenhum horário livre para este serviço nesta data. Escolha outro dia ou profissional.</p>';
        const rule = M.isDate(d) ? state.availability.find(r => r.professionalId === p && r.weekday === M.weekday(d)) : null;
        $('#slot-hint').textContent = `Horários de Brasília · ${rule?.enabled ? `Expediente ${rule.start}–${rule.end}${rule.breakStart ? ` · Intervalo ${rule.breakStart}–${rule.breakEnd}` : ''}` : 'Sem expediente neste dia'}`;
        const preservesService = item && item.serviceId === s;
        const duration = preservesService ? item.duration : service(s).duration, price = preservesService ? item.price : service(s).price;
        $('#booking-summary').innerHTML = `<span>${icon('clock')}<b>${duration} min</b> de atendimento</span><strong>${money(price)}</strong>`;
        $('#save-form').disabled = !slots.length;
        $('#slots').querySelectorAll('[data-slot]').forEach(button => button.onclick = () => { $('#field-time').value = button.dataset.slot; $('#slots').querySelectorAll('[data-slot]').forEach(b => { b.classList.toggle('selected',b === button); b.setAttribute('aria-pressed',String(b === button)); }); });
      };
      $('#field-professionalId').onchange = () => { const previous = $('#field-serviceId').value; fillServices(previous); updateSlots(); };
      $('#field-serviceId').onchange = $('#field-date').onchange = updateSlots; updateSlots();
    } else if (type === 'service') {
      $('#form-fields').innerHTML = `<div class="form-grid">${field('Nome do serviço','name',e.name,{required:true,full:true,attrs:'maxlength="120"'})}${field('Duração (minutos)','duration',e.duration,{required:true,type:'number',attrs:'min="15" max="240" step="15"'})}${field('Valor (R$)','price',e.price,{required:true,type:'number',attrs:'min="0" max="1000000" step="0.01"'})}<p class="form-hint field full">Use intervalos de 15 minutos. Os agendamentos existentes preservam a duração e o valor originais.</p></div>`;
    } else if (type === 'cancel') {
      $('#form-fields').innerHTML = `<p class="notice">O horário de ${esc(e.clientName)} em ${shortDate(e.date)}, às ${e.time}, ficará disponível para outra reserva.</p>${field('Motivo do cancelamento','cancelReason','',{required:true,full:true,attrs:'maxlength="300" placeholder="Ex.: cliente solicitou outra data"'})}<p class="form-hint">O registro será mantido no histórico de agendamentos.</p>`;
    } else if (type === 'availability') {
      $('#form-fields').innerHTML = `<p class="form-hint">Horários de Brasília. Desmarque os dias de folga. O início e o fim do intervalo são opcionais e devem ser preenchidos juntos.</p><div class="availability-form">${[1,2,3,4,5,6,0].map(day => { const r = state.availability.find(x => x.professionalId === e.professionalId && x.weekday === day); return `<section class="day-rule"><label class="day-toggle"><input type="checkbox" name="enabled-${day}" data-day-toggle="${day}" ${r.enabled ? 'checked' : ''}><b>${days[day]}</b></label><div class="rule-fields" id="rule-${day}">${field('Entrada',`start-${day}`,r.start || '09:00',{type:'time'})}${field('Saída',`end-${day}`,r.end || '18:00',{type:'time'})}${field('Início do intervalo',`breakStart-${day}`,r.breakStart || '',{type:'time'})}${field('Fim do intervalo',`breakEnd-${day}`,r.breakEnd || '',{type:'time'})}</div></section>`; }).join('')}</div>`;
      const updateRule = checkbox => { const fields = $(`#rule-${checkbox.dataset.dayToggle}`); fields.classList.toggle('rule-disabled',!checkbox.checked); fields.querySelectorAll('input').forEach(input => input.disabled = !checkbox.checked); };
      $('#form-fields').querySelectorAll('[data-day-toggle]').forEach(c => { c.onchange = () => updateRule(c); updateRule(c); });
    }
    if (type !== 'booking') $('#save-form').disabled = false;
    $('#form-dialog').showModal(); $('#form-fields input:not([type="hidden"]), #form-fields select')?.focus();
  }
  $('#entity-form').onsubmit = event => {
    event.preventDefault(); const data = Object.fromEntries(new FormData(event.currentTarget));
    try {
      let next;
      if (formType === 'booking') { if (!data.time) throw new Error('Escolha um dos horários disponíveis para continuar.'); if (entity?.id) data.id = entity.id; next = M.upsertAppointment(state,data); selectedDate = data.date; }
      if (formType === 'service') next = M.upsertService(state,{...entity,...data,duration:Number(data.duration),price:Number(data.price)});
      if (formType === 'cancel') next = M.cancelAppointment(state,entity.id,data.cancelReason);
      if (formType === 'availability') {
        const id = entity.professionalId;
        const rows = state.availability.map(r => {
          if (r.professionalId !== id) return r;
          const enabled = data[`enabled-${r.weekday}`] === 'on';
          return {...r,enabled,start:data[`start-${r.weekday}`] || r.start,end:data[`end-${r.weekday}`] || r.end,breakStart:enabled ? data[`breakStart-${r.weekday}`] || '' : r.breakStart,breakEnd:enabled ? data[`breakEnd-${r.weekday}`] || '' : r.breakEnd};
        });
        next = M.setAvailability(state,rows);
      }
      commit(next); $('#form-dialog').close(); toast(formType === 'cancel' ? 'Agendamento cancelado. O horário está livre novamente.' : 'Tudo certo! Alterações salvas.');
    } catch (error) { $('#form-error').textContent = error.message; $('#form-error').hidden = false; }
  };
  function canComplete(a) {
    const currentDate = today();
    const currentTime = new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date());
    return a.date < currentDate || (a.date === currentDate && M.endTime(a) <= currentTime);
  }
  function showDetail(id) { detailId = id; fillDetail(); prepareDetailActions(); if (!$('#detail-dialog').open) $('#detail-dialog').showModal(); }
  function fillDetail() {
    const a = appointment(detailId); if (!a) return;
    $('#detail-title').textContent = a.clientName;
    $('#detail-body').innerHTML = `<div class="detail-status">${badge(a.status)}<span class="muted">${a.id.toUpperCase()}</span></div><section class="detail-section"><div class="detail-grid">${[['Serviço',service(a.serviceId).name],['Profissional',prof(a.professionalId).name],['Data',dateLabel(a.date,{day:'2-digit',month:'long',year:'numeric'})],['Horário',`${a.time} – ${M.endTime(a)}`],['Duração',`${a.duration} minutos`],['Valor',money(a.price)],['Telefone',a.phone || 'Não informado']].map(([label,value]) => `<div><span class="detail-label">${label}</span><strong class="detail-value">${esc(value)}</strong></div>`).join('')}</div></section>${a.notes ? `<section class="detail-section"><h3 class="detail-title">Observações</h3><p style="white-space:pre-wrap">${esc(a.notes)}</p></section>` : ''}${a.status === 'cancelled' ? `<div class="cancelled-notice"><b>Motivo do cancelamento</b><p>${esc(a.cancelReason)}</p><small>Horário liberado. Registro preservado no histórico.</small></div>` : `<div class="detail-actions"><button class="button secondary" data-action="edit-booking" data-id="${a.id}">${icon('edit')}Editar / reagendar</button>${a.status === 'pending' ? `<button class="button primary" data-action="confirm-booking" data-id="${a.id}">${icon('check')}Confirmar</button>` : ''}${['confirmed','pending'].includes(a.status) ? `<button class="button secondary" data-action="complete-booking" data-id="${a.id}">${icon('check')}Concluir atendimento</button>` : ''}${a.status !== 'completed' ? `<button class="button ghost danger" data-action="cancel-booking" data-id="${a.id}">Cancelar agendamento</button>` : ''}</div>`}`;
  }
  function prepareDetailActions() {
    const button = $('#detail-body [data-action="complete-booking"]');
    const a = appointment(detailId);
    if (button && a && !canComplete(a)) {
      button.disabled = true;
      button.title = 'Disponível após o horário de término do atendimento.';
      button.textContent = 'Concluir após o atendimento';
    }
  }
  function bindView() {
    if ($('#agenda-date')) $('#agenda-date').onchange = event => { if (M.isDate(event.target.value)) { selectedDate = event.target.value; render(); } };
    if ($('#professional-filter')) $('#professional-filter').onchange = event => { professional = event.target.value; render(); };
    if ($('#status-filter')) $('#status-filter').onchange = event => { statusFilter = event.target.value; render(); };
    if ($('#booking-date')) $('#booking-date').onchange = event => { bookingDateFilter = event.target.value; render(); };
    if ($('#booking-search')) $('#booking-search').oninput = event => { search = event.target.value; const caret = event.target.selectionStart; render(); $('#booking-search').focus(); $('#booking-search').setSelectionRange(caret,caret); };
  }
  document.addEventListener('click', event => {
    const nav = event.target.closest('[data-view]'); if (nav) { event.preventDefault(); return route(nav.dataset.view); }
    const dateButton = event.target.closest('[data-date]'); if (dateButton) { selectedDate = dateButton.dataset.date; return render(); }
    const professionalButton = event.target.closest('[data-professional]'); if (professionalButton) { professional = professionalButton.dataset.professional; return render(); }
    const displayButton = event.target.closest('[data-display]'); if (displayButton) { display = displayButton.dataset.display; return render(); }
    const detail = event.target.closest('[data-appointment]'); if (detail) return showDetail(detail.dataset.appointment);
    const button = event.target.closest('[data-action]'); if (!button) return; const action = button.dataset.action, id = button.dataset.id;
    if (action === 'new-booking') openForm('booking');
    if (action === 'book-service') openForm('booking',null,{serviceId:id,professionalId:state.professionals.find(p => p.serviceIds.includes(id)).id});
    if (action === 'edit-booking') openForm('booking',appointment(id));
    if (action === 'cancel-booking') openForm('cancel',appointment(id));
    if (action === 'confirm-booking' || action === 'complete-booking') { try { commit(M.setStatus(state,id,action === 'confirm-booking' ? 'confirmed' : 'completed')); toast('Status do atendimento atualizado.'); } catch(error) { toast(error.message); } }
    if (action === 'edit-service') openForm('service',service(id));
    if (action === 'edit-availability') openForm('availability',{professionalId:id});
    if (action === 'today') { selectedDate = TODAY; render(); }
    if (['previous-day','next-day','previous-week','next-week'].includes(action)) { selectedDate = M.addDays(selectedDate,({'previous-day':-1,'next-day':1,'previous-week':-7,'next-week':7})[action]); render(); }
    if (action === 'clear-date') { bookingDateFilter = ''; render(); }
  });
  $('#close-form').onclick = $('#cancel-form').onclick = () => $('#form-dialog').close();
  $('#close-detail').onclick = () => $('#detail-dialog').close();
  $('#mobile-menu').onclick = () => { const open = $('#sidebar').classList.toggle('open'); $('#mobile-menu').setAttribute('aria-expanded',String(open)); syncMenu(); };
  window.addEventListener('resize',syncMenu);
  window.addEventListener('hashchange',() => { const next = location.hash.slice(1); if (labels[next] && view !== next) { view = next; render(); window.scrollTo(0,0); } });
  $('#export-data').onclick = () => { const url = URL.createObjectURL(new Blob([JSON.stringify({...state,exportedAt:new Date().toISOString()},null,2)],{type:'application/json'})); const link = document.createElement('a'); link.href = url; link.download = `orla-agenda-${TODAY}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url),1000); toast('Cópia dos dados exportada em JSON.'); };
  syncMenu(); render();
})();
