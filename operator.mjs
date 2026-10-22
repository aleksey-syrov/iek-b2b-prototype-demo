import { purchaseInquiryKey, inquiryStatusLabels, loadPurchaseInquiries, currentInquiryBuyer, updatePurchaseInquiry, assignPurchaseInquiry, addPurchaseInquiryNote, clearPurchaseInquiries, linkPurchaseInquiry, purchaseInquiryForOrder, createOrderFromInquiry, createdInquiryOrders, updateInquiryOrderWork, inquiryOrderLines, approveInquiryOrderRelationship } from './purchase-inquiries.mjs?v=order-flow-26'
import { verificationBridgeKey, loadLinkedRequests, updateLinkedRequest, clearLinkedRequests } from './verification-bridge.mjs?v=public-copy-1'
import { operatorSnapshot, loadOperatorState, saveOperatorState, clearOperatorState } from './operator-storage.mjs?v=order-flow-24'
import { currentOperator, takeOwnership, addInternalNote, workQueue, ageLabel, nextRequestId, commentTemplates, appendTemplate } from './operator-workflow.mjs'
import { initialState, loadDemoOrders, total, receivingGroups, deliveryCost, needsProject, searchCompanyDirectory } from './model.mjs?v=public-copy-3'
import { storageKey, loadState } from './storage.mjs?v=public-copy-1'
import { orderProgressKey, orderEventLabels, loadOrderProgress, orderWithProgress, advanceOrderProgress, saveOrderProgressWork, clearOrderProgress } from './order-progress.mjs'

import { newRequest, decide, syncStatus, requestCanPurchase, completeSync, retrySync, requestFieldLabels } from './operator-verification.mjs?v=public-copy-1'
export { newRequest, decide, syncStatus, requestCanPurchase, completeSync, retrySync } from './operator-verification.mjs?v=public-copy-1'
const entityLabels = { company: 'Контрагент', contact: 'Контактное лицо' }
const entityStatusLabels = { not_started: 'Не запрошено', pending: 'Ожидаем подтверждение', ready: 'Подтверждено', error: 'Ошибка обмена' }

export function createDemoRequests() {
  const rows = [
    ['VR-0024', 'Александр Морозов', 'Промавтоматика', 'a.morozov', 'promavtomatika', false, 'pending', '10:42'],
    ['VR-0023', 'Мария Волкова', 'Северные системы', 'm.volkova', 'north-systems', true, 'pending', '10:18'],
    ['VR-0022', 'Дмитрий Орлов', 'Технопроект', 'd.orlov', 'technoproject', false, 'pending', '09:55'],
    ['VR-0021', 'Анна Белова', 'Инженерные решения', 'a.belova', 'eng-solutions', true, 'returned', '09:30'],
    ['VR-0020', 'Илья Соколов', 'Автоматизация плюс', 'i.sokolov', 'automation-plus', false, 'error', '09:12'],
    ['VR-0019', 'Ольга Лебедева', 'Техносфера', 'o.lebedeva', 'technosphere', true, 'ready', '08:50'],
    ['VR-0018', 'Павел Козлов', 'Контур систем', 'p.kozlov', 'system-contour', true, 'rejected', '08:35'],
    ['VR-0017', 'Екатерина Новикова', 'Энергопроект', 'e.novikova', 'energoproject', false, 'sync', '08:10']
  ]
  return rows.map(([id, person, company, login, domain, exists, status, time], index) => {
    let item = { ...newRequest(exists), id, person, company: `ООО «${company}»`, email: `${login}@${domain}.example`, site: `${domain}.example`,
      inn: `77000000${24 - index}`, phone: `+7 (000) 000-00-${24 - index}`, time, date: `2026-10-21T${time}:00+03:00`, assignee: [null, currentOperator, 'Иван Петров'][index % 3], notes: [], code: `КА-DEMO-${24-index}`, address: 'Москва, ул. Примерная, д. 12, офис 4' }
    if (['error', 'ready', 'sync'].includes(status)) {
      item = decide(item, 'approved', 'Полномочия представителя проверены.', true)
      item = completeSync(item, 'company', 'ready')
      if (status !== 'sync') item = completeSync(item, 'contact', status)
    } else if (status !== 'pending') item = decide(item, status, status === 'returned' ? 'Уточните полномочия администратора компании.' : 'Связь представителя с компанией не подтверждена.')
    item.history = item.history.map(event => ({...event, date: `2026-10-21T${time}:00+03:00`}))
    return item
  })
}

export function filterRequests(items, query = '', status = 'all', company = 'all', access = 'all', canBuy = requestCanPurchase) {
  const needle = query.trim().toLocaleLowerCase('ru-RU')
  return items.filter(item => (access === 'all' || (access === 'open' ? canBuy(item) : !canBuy(item))) && (company === 'all' || (company === 'present' ? item.companyExists || item.sync.company === 'ready' : !item.companyExists && item.sync.company !== 'ready')) && (status === 'all' || (status === 'sync-error' ? syncStatus(item) === 'error' : status === 'automated' ? item.automated === true : item.decision === status)) &&
    [item.id, item.person, item.company, item.inn, item.email].some(value => value.toLocaleLowerCase('ru-RU').includes(needle)))
}

const labels = { pending: 'Ожидает проверки', approved: 'Подтверждена', returned: 'Нужно уточнение', rejected: 'Отклонена' }
const syncLabels = { not_started: 'Не запущен', pending: 'Ожидаем 1С', ready: 'Подтверждено', error: 'Ошибка обмена' }
const pluralRules = new Intl.PluralRules('ru-RU')
export const countLabel = (count, one, few, many) => `${count} ${{ one, few, many }[pluralRules.select(count)]}`
const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]))
const badge = (text, tone = '') => `<span class="op-badge ${tone}">${escape(text)}</span>`
const decisionBadge = item => badge(item.automated ? 'Автоматическая обработка' : labels[item.decision], item.decision === 'approved' ? 'green' : item.decision === 'rejected' ? 'red' : 'amber')
function linkedClaimRole(item) {
  if (!item.id.startsWith('VR-LK-')) return ''
  if (item.automated) {
    try { const saved = loadState(window.localStorage); return saved.employeeVerificationRequestId === item.id ? {approved:'Сотрудник компании',rejected:'Администратор отклонил'}[saved.joinRequest?.status] || 'Ожидает решения администратора' : 'Ожидает решения администратора' }
    catch { return 'Ожидает решения администратора' }
  }
  if (item.decision !== 'approved') return 'Роль определяется после проверки'
  const approved = requests.filter(candidate => candidate.id.startsWith('VR-LK-') && candidate.inn === item.inn && candidate.decision === 'approved' && !candidate.automated)
    .sort((a,b) => (a.approvalOrder || 0) - (b.approvalOrder || 0) || a.id.localeCompare(b.id))
  let saved = null
  try { saved = loadState(window.localStorage) } catch { /* The operator can still view requests if the buyer snapshot is damaged. */ }
  if (saved?.employeeVerificationRequestId === item.id && saved.joinRequest?.status === 'approved') return 'Сотрудник компании'
  if (saved && !saved.verificationRequestId && saved.adminStage === 'verified') return 'Ожидает решения администратора'
  return approved[0]?.id === item.id ? 'Первый подтверждён · администратор' : 'Ожидает решения администратора'
}
function requestAccess(item) {
  if (!requestCanPurchase(item)) return false
  if (!item.id.startsWith('VR-LK-')) return true
  return ['Первый подтверждён · администратор', 'Сотрудник компании'].includes(linkedClaimRole(item))
}
export function resubmissionView(item) {
  const correction = item.history.findLast(event => event.title === 'Заявитель отправил исправленные сведения')
  return item.decision === 'pending' && correction ? `<div>${badge('↻ Повторная подача', 'blue')}</div><small>Ответ получен ${orderDate(correction.date)}</small>` : ''
}
export function requestQueueNote(item) {
  const sync = syncStatus(item)
  if (sync === 'error') return 'Ошибка обмена с 1С'
  if (sync === 'pending') return 'Ожидаем ответ 1С'
  return item.decision === 'approved' ? linkedClaimRole(item) || (requestAccess(item) ? 'Покупки открыты' : '') : ''
}
const field = (label, value) => `<div><dt>${label}</dt><dd>${escape(value)}${/ИНН|почта|Email|email/.test(label) ? copyButton(value, label) : ''}</dd></div>`
let requests = createDemoRequests()
let request
let query = '', status = 'all', companyFilter = 'all', accessFilter = 'all'
const drafts = new Map()
const detailTabSelection = new Map()

const copyButton = (value, label = value) => `<button type="button" class="op-copy" data-copy="${escape(value)}" aria-label="Скопировать ${escape(label)}" title="Скопировать">⧉</button>`
const ageView = date => `<span data-age="${escape(date)}">${ageLabel(date)}</span>`
const noteDrafts = new Map()
let requestOwner = 'all', requestSort = 'newest', orderOwner = 'all', orderSort = 'newest'
let requestSequence = []
const scrollPositions = new Map()

function visibleRequests() {
  return workQueue(filterRequests(requests, query, status, companyFilter, accessFilter, requestAccess), requestOwner, requestSort)
}

function queueTools(kind, items, owner, sort) {
  return `<div class="op-queue-tools"><div class="op-owner-tabs" role="group" aria-label="Очередь ${kind === 'request' ? 'заявок' : 'заказов'}">${[['all','Все'],['mine','Мои'],['unassigned','Неназначенные']].map(([value,label]) => `<button data-owner="${value}" data-kind="${kind}" aria-pressed="${owner === value}">${label} <span>${workQueue(items, value).length}</span></button>`).join('')}</div><label>Сортировка <select data-sort="${kind}" aria-label="Сортировка ${kind === 'request' ? 'заявок' : 'заказов'}"><option value="newest" ${sort === 'newest' ? 'selected' : ''}>Сначала новые</option><option value="oldest" ${sort === 'oldest' ? 'selected' : ''}>Сначала старые</option></select></label></div>`
}

function ownerView(item, kind) {
  return `<div class="op-owner"><span>Ответственный: <strong>${escape(item.assignee || 'Не назначен')}</strong></span>${!item.assignee ? `<button class="op-button secondary" data-action="take" data-kind="${kind}" data-id="${item.id}">Взять в работу</button>` : item.assignee === currentOperator ? badge('В моей работе', 'blue') : badge('У другого оператора')}</div>`
}

function notesView(item, kind) {
  return `<section class="op-card op-compact op-notes"><h2>Внутренние заметки</h2><p class="op-inline-note">Видны только операторам. Покупателю не отправляются.</p><ul class="op-note-list">${(item.notes || []).map(note => `<li><div><strong>${escape(note.author)}</strong><time>${orderDate(note.date)}</time></div><p>${escape(note.text)}</p></li>`).join('') || '<li class="op-inline-note">Заметок пока нет.</li>'}</ul><form data-note-form="${kind}" data-id="${item.id}"><label for="internal-note">Новая внутренняя заметка</label><textarea id="internal-note" name="note" maxlength="1000" rows="3" aria-describedby="note-error" placeholder="Например: звонил, попросили связаться завтра">${escape(noteDrafts.get(item.id) || '')}</textarea><p id="note-error" class="op-error" role="alert"></p><button class="op-button secondary" type="submit">Добавить заметку</button></form></section>`
}

function timelineItem(date, title, note = '', details = '') {
  return `<li>${date ? `<time class="op-time" datetime="${escape(date)}">${orderDate(date)}</time>` : '<span class="op-time">Сейчас</span>'}<div><strong>${escape(title)}</strong>${note ? `<p>${escape(note)}</p>` : ''}${details}</div></li>`
}

const timelineView = (title, items) => `<section class="op-card op-compact op-event-history"><h2>${escape(title)}</h2><ol class="op-timeline">${items.join('')}</ol></section>`

function detailTabsView(key, tabs) {
  const active = detailTabSelection.get(key) || tabs[0][0]
  detailTabSelection.set(key, active)
  return `<div class="op-detail-tabs" role="tablist" aria-label="Разделы карточки" data-detail-key="${escape(key)}">${tabs.map(([id, label]) => `<button type="button" role="tab" id="op-tab-${id}" aria-controls="op-panel-${id}" aria-selected="${id === active}" tabindex="${id === active ? '0' : '-1'}" data-detail-tab="${id}">${escape(label)}</button>`).join('')}</div>`
}

const detailPanelStart = (key, id) => `<div class="op-tab-panel" role="tabpanel" id="op-panel-${id}" aria-labelledby="op-tab-${id}" data-detail-panel="${id}" ${detailTabSelection.get(key) === id ? '' : 'hidden'}>`

function selectDetailTab(tab) {
  const list = tab.closest('.op-detail-tabs')
  detailTabSelection.set(list.dataset.detailKey, tab.dataset.detailTab)
  list.querySelectorAll('[data-detail-tab]').forEach(button => {
    const selected = button === tab
    button.setAttribute('aria-selected', String(selected))
    button.tabIndex = selected ? 0 : -1
  })
  list.parentElement.querySelectorAll('[data-detail-panel]').forEach(panel => { panel.hidden = panel.dataset.detailPanel !== tab.dataset.detailTab })
}

function nextRequestView() {
  const next = nextRequestId(requestSequence, request.id, visibleRequests())
  return next ? `<a class="op-next" href="#request/${next}">Следующая заявка →</a>` : '<span class="op-inline-note op-next">Следующих заявок в выборке нет</span>'
}

function updateWorkItem(kind, item) {
  if (kind === 'request') { saveRequest(item); renderDetail() }
  else {
    if (item.id.startsWith('ORD-LK-')) updateInquiryOrderWork(window.localStorage,item)
    if (item.id.startsWith('DEMO-') || item.id.startsWith('SAMPLE-')) saveOrderProgressWork(window.localStorage,item)
    orders = orders.map(order => order.id === item.id ? item : order)
    renderRoute()
  }
}

function saveRequest(next) {
  if (next.id.startsWith('VR-LK-')) {
    next = updateLinkedRequest(window.localStorage, next)
    requests = [...requests.filter(item => !item.id.startsWith('VR-LK-')), ...loadLinkedRequests(window.localStorage)]
  } else requests = requests.map(item => item.id === next.id ? next : item)
  request = next
}

function rowsView() {
  const items = visibleRequests()
  document.querySelectorAll('.op-queue-stats [data-status]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.status === status)))
  document.querySelector('#result-count').textContent = `Показано ${items.length} из ${requests.length}`
  document.querySelector('#request-rows').innerHTML = items.length ? items.map(item => { const note = requestQueueNote(item); return `<tr>
    <td><a class="op-request-link" href="#request/${item.id}" aria-label="Открыть заявку ${escape(item.id)}" title="${escape(item.id)}">${escape(item.id.length > 18 ? `${item.id.slice(0, 18)}…` : item.id)}</a></td>
    <td class="op-queue-date">${orderDate(item.date)}<small>${ageView(item.date)}</small></td>
    <td><strong>${escape(item.person)}</strong><small>${escape(item.email)}</small></td>
    <td><strong>${escape(item.company)}</strong><small>ИНН ${escape(item.inn)} · ${item.automated ? item.sync.company === 'ready' ? 'Связь подтверждена' : 'Связь ожидает 1С' : item.companyExists ? 'Есть в 1С' : item.sync.company === 'ready' ? 'Создана в 1С' : 'Новая компания'}</small></td>
    <td>${escape(item.automated ? 'Сервис' : item.assignee || 'Не назначен')}</td>
    <td class="op-queue-state">${resubmissionView(item) || decisionBadge(item)}${note ? `<small>${escape(note)}</small>` : ''}</td>
  </tr>` }).join('') : '<tr><td colspan="6" class="op-empty"><strong>Заявки не найдены</strong><p>Попробуйте другой запрос или снимите фильтр.</p><button class="op-button secondary" data-action="clear-filters">Сбросить фильтры</button></td></tr>'
}

function renderQueue() {
  requestSequence = visibleRequests().map(item => item.id)
  document.querySelector('#main').innerHTML = `<div class="op-title"><div><div class="op-eyebrow">РАБОЧЕЕ МЕСТО ОПЕРАТОРА</div><h1>Заявки на верификацию</h1><p>Подключение компании · проверка реквизитов и полномочий представителя</p></div><span class="op-total">${countLabel(requests.length, 'заявка', 'заявки', 'заявок')}</span></div>
    <div class="op-queue-stats"><button data-status="pending" aria-pressed="${status === 'pending'}">Ожидают проверки <strong>${requests.filter(item => item.decision === 'pending').length}</strong></button><button data-status="returned" aria-pressed="${status === 'returned'}">На уточнении <strong>${requests.filter(item => item.decision === 'returned').length}</strong></button><button data-status="sync-error" aria-pressed="${status === 'sync-error'}">Ошибки 1С <strong>${requests.filter(item => syncStatus(item) === 'error').length}</strong></button></div>
    ${queueTools('request', requests, requestOwner, requestSort)}<section class="op-card op-register op-queue-register" aria-label="Список заявок"><div class="op-filters"><label class="op-search">Поиск<input type="search" maxlength="1000" id="search" value="${escape(query)}" placeholder="Номер, ФИО, компания или ИНН"></label><label>Статус<select id="status">${[['all','Все заявки'],['pending','Ожидают проверки'],['returned','Нужно уточнение'],['approved','Подтверждены / автоматически'],['automated','Автоматическая обработка'],['rejected','Отклонены'],['sync-error','Ошибка обмена с 1С']].map(([value,label])=>`<option value="${value}" ${status===value?'selected':''}>${label}</option>`).join('')}</select></label><details class="op-more-filters" ${companyFilter !== 'all' || accessFilter !== 'all' ? 'open' : ''}><summary>Ещё фильтры${companyFilter !== 'all' || accessFilter !== 'all' ? ' · активны' : ''}</summary><div><label>Компания в 1С<select id="company-filter">${[['all','Все компании'],['present','Есть в 1С'],['absent','Нет в 1С']].map(([value,label])=>`<option value="${value}" ${companyFilter===value?'selected':''}>${label}</option>`).join('')}</select></label><label>Доступ к покупкам<select id="access-filter">${[['all','Любой'],['open','Открыт'],['closed','Закрыт']].map(([value,label])=>`<option value="${value}" ${accessFilter===value?'selected':''}>${label}</option>`).join('')}</select></label></div></details><button class="op-button secondary" data-action="clear-filters">Сбросить</button></div>
    <div class="op-table-scroll" tabindex="0" role="region" aria-label="Таблица заявок"><table class="op-table op-queue-table"><thead><tr><th scope="col">Заявка</th><th scope="col">Подана</th><th scope="col">Представитель</th><th scope="col">Компания</th><th scope="col">Ответственный</th><th scope="col">Состояние</th></tr></thead><tbody id="request-rows"></tbody></table></div><div class="op-table-footer" id="result-count" role="status"></div></section>`
  rowsView()
  document.querySelector('#search').addEventListener('input', event => { query = event.target.value; rowsView() })
  document.querySelector('#status').addEventListener('change', event => { status = event.target.value; rowsView() })
  document.querySelector('#company-filter').addEventListener('change', event => { companyFilter = event.target.value; rowsView() })
  document.querySelector('#access-filter').addEventListener('change', event => { accessFilter = event.target.value; rowsView() })
}

export function requestChangesView(changes) {
  if (!changes) return '<p class="op-inline-note">Для этой повторной подачи сравнение не сохранено.</p>'
  if (!changes.length) return '<p class="op-inline-note">Заявка отправлена повторно без изменения полей.</p>'
  return `<div class="op-table-scroll"><table class="op-table op-changes"><thead><tr><th scope="col">Поле</th><th scope="col">Было</th><th scope="col">Стало</th></tr></thead><tbody>${changes.map(change => `<tr><th scope="row">${escape(requestFieldLabels[change.field])}</th><td>${escape(change.before || 'Не указано')}</td><td>${escape(change.after || 'Не указано')}</td></tr>`).join('')}</tbody></table></div>`
}

function renderDetail() {
  if (!requestSequence.includes(request.id)) requestSequence = visibleRequests().map(item => item.id)
  const pending = request.decision === 'pending', approved = request.decision === 'approved', ready = requestAccess(request), companyReady = request.sync.company === 'ready'
  const exchangeLabels = request.automated ? {company:'Связь с компанией', contact:'Контактное лицо'} : entityLabels
  const draft = drafts.get(request.id) || { comment: '', authority: false }
  const correction = request.history.findLast(event => event.title === 'Заявитель отправил исправленные сведения')
  const linkedOrders = orders.filter(order => order.verificationId === request.id)
  const timeline = timelineView('Ход верификации', [
    timelineItem(request.date, 'Заявка отправлена', request.person),
    ...request.history.map(event => timelineItem(event.date, event.title, event.note, event.changes && event !== correction ? `<details class="op-disclosure"><summary>Изменения в этой подаче</summary>${requestChangesView(event.changes)}</details>` : '')),
    timelineItem(null, ready ? 'Доступ к покупкам открыт' : requestQueueNote(request) || labels[request.decision])
  ])
  document.querySelector('#main').innerHTML = `
    <div class="op-breadcrumb"><a href="#requests">← Все заявки</a><span>/</span>${request.id}${copyButton(request.id)}${nextRequestView()}</div>
    <div class="op-title op-detail-title"><div><h1>${escape(request.company)}</h1><p>${escape(request.person)} · ${request.id}</p></div>${decisionBadge(request)}</div>
    <div class="op-meta"><span>Подана ${orderDate(request.date)}</span><span>Возраст: ${ageView(request.date)}</span><span>${request.automated ? 'Автоматическая обработка после появления администратора' : 'Подключение компании из личного профиля'}</span>${linkedClaimRole(request) ? `<span>${escape(linkedClaimRole(request))}</span>` : ''}</div>
    ${request.automated ? '' : ownerView(request, 'request')}<div class="op-layout"><div class="op-content">
      ${detailTabsView(`request/${request.id}`, [['overview','Обзор'],['access','Доступ и обмен'],['history','История и заметки']])}
      ${detailPanelStart(`request/${request.id}`, 'overview')}
      <section class="op-card op-summary"><div class="op-pair">
        <div><h2>Представитель</h2><h3>${escape(request.person)}</h3><dl class="op-fields">
          ${field('Рабочая почта', request.email)}${field('Телефон', request.phone)}${request.position ? field('Должность', request.position) : ''}${field('Роль после проверки', linkedClaimRole(request) || 'Администратор компании')}
        </dl><p class="op-inline-note">${request.id.startsWith('VR-LK-') && request.emailVerified !== true ? 'Подтверждение почты IEK ID пока не получено' : '✓ Email подтверждён через IEK ID'}</p><p class="op-inline-note">${request.id.startsWith('VR-LK-') && request.phoneVerified !== true ? 'Подтверждение телефона IEK ID пока не получено' : '✓ Телефон подтверждён через IEK ID'}</p></div>
        <div><h2>Компания</h2><h3>${escape(request.company)}</h3><dl class="op-fields">${field('ИНН', request.inn)}${field('Сайт компании', request.site)}</dl>
        ${badge(request.automated ? companyReady ? '✓ Связь подтверждена' : 'Связь ожидает 1С' : request.companyExists ? '✓ Есть в 1С' : companyReady ? '✓ Создана в 1С' : '+ Новая для 1С', request.companyExists || companyReady ? 'green' : 'blue')}
        <details class="op-disclosure"><summary>Реквизиты и источники данных</summary><dl class="op-fields">${field('КПП', request.kpp ?? '770001001')}${field('Юридический адрес', request.address)}${field('Карточка в 1С', request.companyExists || companyReady ? (request.code === 'Демо · подтверждение 1С' ? 'Код не указан' : request.code) : 'Ожидает создания')}${field('Источник реквизитов', request.id.startsWith('VR-LK-') ? 'Заявка из ЛК · сведения заявителя' : request.companyExists ? '1С · база магазина' : 'Справочник / ручной ввод')}</dl></details></div>
      </div></section>
      ${correction ? `<section class="op-card op-compact"><h2>Изменения после исправления</h2><p class="op-inline-note">Последняя повторная подача · ${orderDate(correction.date)}</p>${requestChangesView(correction.changes)}</section>` : ''}
      </div>${detailPanelStart(`request/${request.id}`, 'access')}
      <details class="op-card op-compact op-guidance"><summary>${request.automated ? 'Присоединение к компании' : 'Что проверяем'}</summary><p>${request.automated ? 'У компании уже есть администратор. Сервис направил создание контактного лица и связь с компанией на обмен с 1С. Оператору решение не требуется; доступ заявителю предоставит или отклонит администратор.' : 'Реквизиты компании, рабочие контакты и полномочия заявителя действовать от имени компании.'}</p>${request.automated ? '' : `<p class="op-inline-note">Личный профиль уже доступен через IEK ID. Первое одобрение оператора назначит администратора; следующему заявителю потребуется отдельное решение администратора компании.</p><p class="op-inline-note">${request.id.startsWith('VR-LK-') ? 'Сведения из связанного ЛК. Проверьте реквизиты, контакты и полномочия.' : 'Домен почты совпадает с сайтом компании. Полномочия представителя требуют подтверждения оператором.'}</p>`}
        <details class="op-disclosure"><summary>Пояснение представителя</summary><blockquote>${request.id.startsWith('VR-LK-') ? 'Заявитель просит подключить профиль к компании.' : '«Занимаюсь закупками программного обеспечения. Хочу оформить доступ для нашей компании и приглашать коллег в личный кабинет.»'}</blockquote></details>
      </details>
      <section class="op-card op-compact" id="exchange"><div class="op-card-head spread"><h2>Доступ к покупкам от компании</h2>${badge(ready ? 'Доступ открыт' : 'Доступ закрыт', ready ? 'green' : '')}</div>
        <p class="op-inline-note">${request.automated ? ready ? 'Обмен с 1С завершён, присоединение одобрено администратором.' : 'Обмен запускается сервисом автоматически. Даже после подтверждений 1С доступ остаётся закрыт до решения администратора.' : ready ? 'Контрагент и контактное лицо подтверждены. Представитель может оформлять заказы от компании.' : linkedClaimRole(request) === 'Ожидает решения администратора' ? 'Оператор подтвердил заявителя. Доступ откроется только после решения администратора компании и подтверждений от 1С.' : approved ? 'Решение оператора сохранено. Для доступа нужны подтверждённые почта и телефон IEK ID и два отдельных подтверждения от 1С.' : 'Нужны решение оператора и два отдельных подтверждения от 1С.'}</p>
        <div class="op-exchange-statuses">${Object.entries(exchangeLabels).map(([entity, label]) => `<div class="op-exchange-row"><span>${label}</span>${badge(entityStatusLabels[request.sync[entity]], request.sync[entity] === 'ready' ? 'green' : request.sync[entity] === 'error' ? 'red' : '')}${request.sync[entity] === 'error' ? `<button class="op-button secondary" data-action="retry" data-entity="${entity}" aria-label="Повторить обмен: ${label}">Повторить</button>` : ''}</div>`).join('')}</div>
        ${Object.values(request.sync).includes('pending') ? `<details class="op-disclosure"><summary>Ответы 1С · демонстрация</summary>${Object.entries(exchangeLabels).filter(([entity]) => request.sync[entity] === 'pending').map(([entity, label]) => `<div class="op-simulation"><span>${label}</span><button class="op-button secondary" data-action="sync-ready" data-entity="${entity}" aria-label="Подтвердить: ${label}">Подтверждение</button><button class="op-button secondary" data-action="sync-error" data-entity="${entity}" aria-label="Ошибка: ${label}">Ошибка</button></div>`).join('')}</details>` : ''}

      </section>
      ${linkedOrders.length ? `<section class="op-card op-compact"><h2>Связанные заказы</h2><div class="op-related">${linkedOrders.map(order => `<a href="#order/${order.id}">${order.id} · ${money(order.total)} ↗</a>`).join('')}</div></section>` : ''}
      </div>${detailPanelStart(`request/${request.id}`, 'history')}
      ${timeline}
      ${notesView(request, 'request')}
      </div>
    </div>
    <aside class="op-decision" aria-labelledby="decision-title"><section class="op-card"><h2 id="decision-title" tabindex="-1">${request.automated ? 'Решение администратора' : pending ? 'Решение по заявке' : labels[request.decision]}</h2>
      ${pending ? `<form id="decision-form" novalidate><label class="op-confirm"><input type="checkbox" id="authority" ${draft.authority?'checked':''}><span>Связь заявителя с компанией и его полномочия проверены</span></label>
      <div class="op-template"><label for="comment-template">Шаблон комментария</label><select id="comment-template"><option value="">Выберите причину</option>${commentTemplates.map(([label],index) => `<option value="${index}">${label}</option>`).join('')}</select><button type="button" class="op-button secondary" data-action="template">Добавить в комментарий</button></div>
      <label class="op-comment" for="comment">Комментарий заявителю <span>Обязателен при возврате и отказе</span></label><textarea id="comment" maxlength="1000" rows="3" placeholder="Что нужно уточнить или причина решения…" aria-describedby="decision-error">${escape(draft.comment)}</textarea>
      <p id="decision-error" class="op-error" role="alert"></p>
      <button class="op-button primary" type="submit" value="approved">Подтвердить заявку →</button><button class="op-button secondary" type="submit" value="returned">Вернуть на уточнение</button><button class="op-button danger" type="submit" value="rejected">Отклонить заявку</button><p class="op-decision-foot">Подтверждение запускает обмен с 1С. Доступ к покупкам откроется после двух отдельных событий: контрагент и контактное лицо. Возврат и отказ не закрывают личный профиль.</p></form>` : `<p class="op-decision-intro">${request.automated ? ready ? 'События 1С получены. Администратор разрешил присоединение.' : request.sync.company === 'ready' && request.sync.contact === 'ready' ? 'События 1С получены. Присоединение ожидает решения администратора компании.' : 'Оператор не принимает решение по этой заявке. Ожидаем события 1С и решение администратора компании.' : approved ? 'Решение сохранено. Статус обмена с 1С показан в карточке.' : request.decision === 'returned' ? 'Ожидаем уточнение данных от заявителя.' : 'Заявителю передана причина отказа.'}</p>${request.comment ? `<div class="op-saved-comment"><span class="op-label">Комментарий заявителю</span><p>${escape(request.comment)}</p></div>` : ''}<a class="op-button secondary" href="#requests">Вернуться к списку</a>`}
    </section></aside></div>`
  document.querySelector('#decision-form')?.addEventListener('input', () => drafts.set(request.id, {comment:document.querySelector('#comment').value, authority:document.querySelector('#authority').checked}))
  document.querySelector('#decision-form')?.addEventListener('submit', event => {
    event.preventDefault()
    try {
      saveRequest(decide(request, event.submitter?.value || 'approved', document.querySelector('#comment').value, document.querySelector('#authority').checked))
      drafts.delete(request.id)
      renderDetail()
      document.querySelector('#decision-title').focus()
      document.querySelector('#announcement').textContent = 'Решение сохранено.'
    } catch (error) {
      document.querySelector('#decision-error').textContent = error.message
      if (event.submitter?.value === 'approved' && !document.querySelector('#authority').checked) document.querySelector('#authority').focus()
      else document.querySelector('#comment').focus()
    }
  })
}

export function createOperatorOrders(items) {
  const verified = items.find(item => item.decision === 'approved' && syncStatus(item) === 'ready')
  if (!verified) return []
  const state = initialState()
  state.company = { name: verified.company, inn: verified.inn, kpp: '770001001', legalAddress: verified.address, person: verified.person, email: verified.email, phone: verified.phone }
  state.adminUser = { person: verified.person, email: verified.email, phone: verified.phone, position: 'Специалист по закупкам' }
  state.verifiedPhones.push(verified.phone)
  state.verifiedEmails.push(verified.email) // Seed orders belong to this confirmed demo identity.
  loadDemoOrders(state)
  return state.orders.map((order, index) => ({ ...order, id: `ORD-00${42 - index}`, verificationId: verified.id, assignee: [null, currentOperator, 'Иван Петров', currentOperator][index], notes: [], date: `2026-10-21T${['11:40', '11:10', '10:25', '09:35'][index]}:00+03:00` }))
}

export function orderStatus(order) {
  return !order.invoice ? 'Счёт не опубликован' : !order.paid ? 'Ожидает оплаты' : !order.agreement ? 'Ожидает соглашения' : 'Соглашение опубликовано'
}

const orderSyncLabels = { not_started: 'Не передан', pending: 'Ожидаем ответ 1С', ready: 'Принят в 1С', error: 'Ошибка обмена' }
function orderProgressView(order) {
  const actions = order.sync === 'not_started' || order.sync === 'error' ? [['sent', order.sync === 'error' ? 'Повторить передачу в 1С' : 'Передать в 1С']] :
    order.sync === 'pending' ? [['accepted', 'Имитировать принятие 1С'], ['error', 'Имитировать ошибку 1С']] :
    !order.invoice ? [['invoice', 'Имитировать публикацию счёта']] : !order.paid ? [['paid', 'Имитировать подтверждение оплаты']] :
    !order.agreement ? [['agreement', 'Опубликовать соглашение']] : []
  return `<section class="op-card op-compact"><h2>Обработка заказа</h2><div class="op-document-row"><span>Обмен с 1С</span>${badge(orderSyncLabels[order.sync] || orderSyncLabels.not_started, order.sync === 'ready' ? 'green' : order.sync === 'error' ? 'amber' : 'blue')}</div><div class="op-actions">${actions.map(([type,label])=>`<button class="op-button ${type === 'error' ? 'secondary' : 'primary'}" data-action="order-event" data-id="${escape(order.id)}" data-event="${type}">${label}</button>`).join('')}</div><p class="op-inline-note">Это имитация: запросы в 1С не отправляются. Публикация соглашения не означает выдачу лицензии.</p></section>`
}

function orderTimelineView(order) {
  return timelineView('Ход заказа', [
    timelineItem(order.date, 'Заказ создан'),
    ...(order.orderEvents || []).map(event => timelineItem(event.date, orderEventLabels[event.type] || 'Событие заказа')),
    timelineItem(null, orderStatus(order))
  ])
}

function relationshipApprovalView(order, inquiry) {
  const link=inquiry?.orderLinks.find(entry=>entry.order.id === order.id)
  if (!link?.createdFromInquiry) return ''
  const approval=link.relationshipApproval
  return `<section class="op-card op-compact op-order-relationship"><div class="op-card-head spread"><h2>Связь заявителя с компанией</h2>${badge(approval ? approval.source === 'verifiedProfile' ? 'Подтверждена в ЛК' : 'Подтверждена оператором' : 'Не подтверждена',approval ? 'green' : 'amber')}</div>${approval?.source === 'verifiedProfile' ? '' : '<p class="op-inline-note">Оплата подтверждает заказ, но сама по себе не даёт заявителю доступ к компании. После вашей проверки доступ откроется, когда заказ будет оплачен, а ФИО, почта и телефон заявителя будут подтверждены через IEK ID.</p>'}${approval ? `<dl class="op-fields">${field('Подтвердил',approval.author)}${field('Основание',approval.basis)}${field('Дата',orderDate(approval.date))}</dl>` : `<form data-approve-relationship="${escape(order.id)}"><label for="relationship-basis">Основание проверки связи</label><textarea id="relationship-basis" name="basis" minlength="10" maxlength="500" rows="3" required placeholder="Например: связались с компанией по известному номеру, подтвердили полномочия заявителя"></textarea><p class="op-error" id="relationship-error" role="alert"></p><button class="op-button secondary" type="submit">Подтвердить связь с компанией</button></form>`}</section>`
}

const money = value => (value / 100).toLocaleString('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 })
const orderDate = value => new Date(value).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
let orders = createOperatorOrders(requests)

export function filterOrders(items, query = '', status = 'all', payment = 'all') {
  const needle = query.trim().toLocaleLowerCase('ru-RU')
  return items.filter(order => (status === 'all' || orderStatus(order) === status) &&
    (payment === 'all' || (payment === 'paid' ? order.paid : !order.paid)) &&
    [order.id, order.company.name, order.company.inn, order.author.person, order.author.email].some(value => value.toLocaleLowerCase('ru-RU').includes(needle)))
}

let orderQuery = '', orderStatusFilter = 'all', orderPaymentFilter = 'all'

export function orderQueueNote(order) {
  return orderSyncLabels[order.sync] || orderSyncLabels.not_started
}

function orderRowsView() {
  const items = workQueue(filterOrders(orders, orderQuery, orderStatusFilter, orderPaymentFilter), orderOwner, orderSort)
  document.querySelector('#order-result-count').textContent = `Показано ${items.length} из ${orders.length} · Суммы сохранены на момент оформления`
  document.querySelector('#order-rows').innerHTML = items.length ? items.map(order => `<tr>
    <td><a class="op-queue-link" href="#order/${escape(order.id)}" aria-label="Открыть заказ ${escape(order.id)}" title="${escape(order.id)}">${escape(order.id.length > 18 ? `${order.id.slice(0, 18)}…` : order.id)}</a></td>
    <td class="op-queue-date">${orderDate(order.date)}<small>${ageView(order.date)}</small></td>
    <td><strong>${escape(order.company.name)}</strong><small>${escape(order.author.person)} · ИНН ${escape(order.company.inn)}</small>${order.verificationId ? `<a class="op-context-link" href="#request/${escape(order.verificationId)}" aria-label="Открыть заявку на верификацию ${escape(order.verificationId)}" title="${escape(order.verificationId)}">Верификация ${escape(order.verificationId.length > 14 ? `${order.verificationId.slice(0, 14)}…` : order.verificationId)}</a>` : ''}</td>
    <td class="op-amount"><strong>${money(order.total)}</strong></td>
    <td>${escape(order.assignee || 'Не назначен')}</td>
    <td class="op-queue-state">${badge(orderStatus(order), order.agreement ? 'green' : 'amber')}</td>
    <td class="op-queue-state">${badge(order.paid ? 'Подтверждена' : 'Не подтверждена', order.paid ? 'green' : 'blue')}</td>
    <td class="op-queue-state">${badge(orderQueueNote(order), order.sync === 'ready' ? 'green' : order.sync === 'error' ? 'amber' : 'blue')}</td>
  </tr>`).join('') : '<tr><td colspan="8" class="op-empty"><strong>Заказы не найдены</strong><p>Попробуйте другой запрос или снимите фильтры.</p><button class="op-button secondary" data-action="clear-order-filters">Сбросить фильтры</button></td></tr>'
}

function renderOrders() {
  document.querySelector('#main').innerHTML = `<div class="op-title"><div><div class="op-eyebrow">РАБОЧЕЕ МЕСТО ОПЕРАТОРА</div><h1>Заказы</h1><p>Заказы компаний, в том числе созданные из заявок · ручная обработка</p></div><span class="op-total">${countLabel(orders.length, 'заказ', 'заказа', 'заказов')}</span></div>
    ${queueTools('order', orders, orderOwner, orderSort)}<section class="op-card op-register op-queue-register" aria-label="Реестр заказов"><div class="op-filters"><label class="op-search">Поиск<input type="search" maxlength="1000" id="order-search" value="${escape(orderQuery)}" placeholder="Номер, компания, ИНН или автор"></label><label>Этап заказа<select id="order-status">${['all', 'Счёт не опубликован', 'Ожидает оплаты', 'Ожидает соглашения', 'Соглашение опубликовано'].map(value => `<option value="${value}" ${orderStatusFilter===value?'selected':''}>${value === 'all' ? 'Все этапы' : value}</option>`).join('')}</select></label><label>Оплата<select id="order-payment">${[['all','Любая'],['paid','Подтверждена'],['unpaid','Не подтверждена']].map(([value,label])=>`<option value="${value}" ${orderPaymentFilter===value?'selected':''}>${label}</option>`).join('')}</select></label><button class="op-button secondary" data-action="clear-order-filters">Сбросить</button></div>
    <div class="op-table-scroll" role="region" aria-label="Список заказов" tabindex="0"><table class="op-table op-queue-table op-order-table"><thead><tr><th scope="col">Заказ</th><th scope="col">Создан</th><th scope="col">Покупатель</th><th scope="col">Сумма</th><th scope="col">Ответственный</th><th scope="col">Этап</th><th scope="col">Оплата</th><th scope="col">Обмен с 1С</th></tr></thead><tbody id="order-rows"></tbody></table></div><div class="op-table-footer" id="order-result-count" role="status"></div></section>`
  orderRowsView()
  document.querySelector('#order-search').addEventListener('input', event => { orderQuery = event.target.value; orderRowsView() })
  document.querySelector('#order-status').addEventListener('change', event => { orderStatusFilter = event.target.value; orderRowsView() })
  document.querySelector('#order-payment').addEventListener('change', event => { orderPaymentFilter = event.target.value; orderRowsView() })
}

export function orderDetailView(order, verification, inquiry = null) {
  return `<div class="op-breadcrumb"><a href="#orders">← Все заказы</a><span>/</span>${escape(order.id)}${copyButton(order.id)}</div>
    <div class="op-title op-detail-title"><div><h1>Заказ</h1><p>${escape(order.company.name)}</p></div>${badge(orderStatus(order), order.agreement ? 'green' : 'amber')}</div>
    <div class="op-meta"><span>Создан ${orderDate(order.date)}</span><span>Возраст: ${ageView(order.date)}</span><span>Маршрут: ручная обработка · текущее правило для всех заказов</span></div>
    ${inquiry ? `<div class="op-order-origin"><span>Заявка на покупку</span><a href="#inquiry/${escape(inquiry.id)}">${escape(inquiry.id)} →</a>${inquiry.orderLinks.find(link=>link.order.id === order.id).createdFromInquiry ? '' : `<span>Контрагент для счёта в 1С: ${escape(inquiry.orderLinks.find(link=>link.order.id === order.id).counterpartyCode)}</span>`}</div>` : ''}${ownerView(order, 'order')}<div class="op-layout"><div class="op-content">
      ${detailTabsView(`order/${order.id}`, [['process','Обработка'],['buyer','Покупатель'],['items','Состав и получение'],['history','История и заметки']])}
      ${detailPanelStart(`order/${order.id}`, 'process')}
      ${orderProgressView(order)}<section class="op-card op-compact"><h2>Документы</h2><div class="op-document-row"><span>Счёт на оплату</span>${badge(order.invoice ? 'Опубликован' : 'Не опубликован', order.invoice ? 'green' : '')}</div><div class="op-document-row"><span>Лицензионное соглашение</span>${badge(order.agreement ? 'Опубликовано' : 'Не опубликовано', order.agreement ? 'green' : '')}</div><p class="op-inline-note">Публикация счёта, подтверждение оплаты и публикация соглашения — отдельные события. Файлы документов пока недоступны.</p></section>
      </div>${detailPanelStart(`order/${order.id}`, 'buyer')}
      <section class="op-card op-summary"><div class="op-pair"><div><h2>Покупатель</h2><h3>${escape(order.company.name)}</h3><dl class="op-fields">${field('ИНН', order.company.inn)}</dl><details class="op-disclosure"><summary>Реквизиты на момент заказа</summary><dl class="op-fields">${field('КПП', order.company.kpp)}${field('Юридический адрес', order.company.legalAddress)}</dl></details></div><div><h2>${order.id.startsWith('ORD-LK-') ? 'Контакт по заявке' : 'Автор заказа'}</h2><h3>${escape(order.author.person)}</h3><dl class="op-fields">${field('Email', order.author.email)}${field('Телефон', order.author.phone || 'Не указан')}</dl></div></div></section>
      ${inquiry?.orderLinks.some(link=>link.order.id === order.id && link.createdFromInquiry) ? '' : `<section class="op-card op-compact"><div class="op-card-head spread"><h2>Верификация компании и представителя</h2>${verification ? badge(requestAccess(verification) ? 'Доступ подтверждён' : 'Доступ не подтверждён', requestAccess(verification) ? 'green' : 'amber') : ''}</div>${verification ? `<a class="op-request-link" href="#request/${escape(verification.id)}">Заявка ${escape(verification.id)} ↗</a><p class="op-inline-note">Контрагент: ${entityStatusLabels[verification.sync.company].toLocaleLowerCase('ru-RU')} · Контактное лицо: ${entityStatusLabels[verification.sync.contact].toLocaleLowerCase('ru-RU')}</p>` : '<p class="op-inline-note">Связанная заявка не найдена.</p>'}</section>`}${relationshipApprovalView(order,inquiry)}
      </div>${detailPanelStart(`order/${order.id}`, 'items')}
      <section class="op-card op-compact"><h2>Состав заказа</h2>${order.lines.map(line => `<div class="op-order-line"><div><strong>${escape(line.name)} · ${escape(line.edition)}</strong><p class="op-inline-note">${escape(line.parameterText || `${line.version} · ${line.capacity} точек`)}</p><p class="op-inline-note">${escape(line.protectionName)}</p><details class="op-disclosure"><summary>Артикул и комплектация</summary><p>${escape(line.sku)}${line.keySku && line.keySku !== 'AUTO' ? ` · Ключ: ${escape(line.keySku)}` : ''}${line.pilot ? ` · ${line.keyQuantity} шт. · виртуализация: ${line.virtualized ? 'да' : 'нет'}` : ''}</p></details></div><div class="op-line-price"><strong>${money(line.total)}</strong><small>${line.pilot ? `${line.quantity} лицензий · ${line.keyQuantity} ключей` : `${line.quantity} шт. × ${money(line.unit)}`}</small></div></div>`).join('')}<p class="op-inline-note">Суммы заказа сохранены на момент оформления и не пересчитываются по текущему каталогу.</p></section>
      <section class="op-card op-compact"><h2>Получение</h2><dl class="op-fields">${order.delivery.email ? field('Коды активации · email получателя', order.delivery.email) : ''}${order.delivery.method === 'courier' ? field('Получатель ключей', order.delivery.recipient) + field('Телефон', order.delivery.phone) + field('Адрес доставки', order.delivery.address) : ''}</dl><p class="op-inline-note">Реквизиты получения не означают, что ПО уже передано покупателю.</p></section>
      ${order.project || order.customer ? `<section class="op-card op-compact"><h2>Проект</h2><dl class="op-fields">${field('Наименование', order.project || 'Не указан')}${field('Конечный заказчик', order.customer || 'Не указан')}</dl></section>` : ''}
      </div>${detailPanelStart(`order/${order.id}`, 'history')}
      ${orderTimelineView(order)}
      ${notesView(order, 'order')}
      </div>
    </div><aside class="op-decision" aria-label="Сводка заказа"><section class="op-card"><h2>Сумма заказа</h2><div class="op-order-total">${money(order.total)}</div><div class="op-document-row"><span>Товары</span><strong>${money(total(order.lines))}</strong></div><div class="op-document-row"><span>Доставка</span><strong>${money(order.delivery.cost)}</strong></div><div class="op-document-row"><span>Оплата</span>${badge(order.paid ? 'Подтверждена' : 'Не подтверждена', order.paid ? 'green' : '')}</div><p class="op-hint">${!order.invoice ? 'Заказ передан на ручную обработку. Счёт ещё не опубликован.' : !order.paid ? 'Счёт опубликован. Ожидается отдельное подтверждение оплаты.' : !order.agreement ? 'Оплата подтверждена. Соглашение ещё не опубликовано.' : 'Соглашение опубликовано. Это не подтверждает передачу ключей или кодов.'}</p></section></aside></div>`
}

export function inquiryOrderFields(order, counterpartyCode = '') {
  if (!order) return ''
  const labels={name:'Название покупателя',inn:'ИНН',kpp:'КПП',legalAddress:'Юридический адрес'}
  return `<p><strong>${escape(order.company.name || 'Покупатель не указан')}</strong> · ${money(order.total)} · ${escape(orderStatus(order))}</p><ul class="op-link-lines">${order.lines.map(line=>`<li>${escape(line.name)} ${escape(line.edition)} · ${line.quantity} шт.</li>`).join('')}</ul><fieldset class="op-link-fields"><legend>Покупатель для счёта</legend>${Object.entries(labels).map(([key,label])=>`<label>${label}${key === 'kpp' && order.company.inn?.length === 12 ? ' · для ИП не требуется' : ' *'}<input name="${key}" value="${escape(order.company[key] || '')}" maxlength="${key === 'legalAddress' ? 250 : key === 'name' ? 120 : key === 'inn' ? 12 : 9}" ${order.company[key] || order.invoice ? 'readonly' : ''} ${key === 'kpp' && order.company.inn?.length === 12 ? '' : 'required'}></label>`).join('')}<label>Код контрагента в 1С *<input name="counterpartyCode" value="${escape(counterpartyCode)}" maxlength="100" required></label></fieldset><p class="op-inline-note">Реквизиты взяты из заказа. Дополните недостающие до привязки. Уже заполненные реквизиты и опубликованный счёт здесь не меняются.</p><label class="op-confirm"><input type="checkbox" name="confirmed" required> Компания-покупатель и состав заказа соответствуют этой заявке</label><button class="op-button" type="submit">Привязать заказ</button>`
}

export function inquiryCompanyLookup(inn = '', selectedId = '') {
  const matches = searchCompanyDirectory(inn)
  const selected = matches.find(company => company.id === selectedId && company.inn === inn.trim())
  if (selected) return `<div class="op-company-selected"><input type="hidden" name="selectedCompanyId" value="${escape(selected.id)}"><strong>${escape(selected.name)}</strong><dl class="op-fields">${field('ИНН', selected.inn)}${field('КПП', selected.kpp || 'Не требуется')}${field('Юридический адрес', selected.legalAddress)}</dl><p class="op-inline-note">Реквизиты подставлены из справочника. Сверьте их с данными, которые сообщил клиент.</p></div>`
  if (matches.length) return `<div class="op-company-results"><table><caption>Найдено компаний: ${matches.length}. Выберите покупателя.</caption><thead><tr><th>Компания / адрес</th><th>ИНН / КПП</th><th>Выбор</th></tr></thead><tbody>${matches.map(company => `<tr><td><strong>${escape(company.name)}</strong><small>${escape(company.legalAddress)}</small></td><td>${escape(company.inn)}<small>КПП ${escape(company.kpp)}</small></td><td><button type="button" class="op-button secondary" data-select-order-company="${escape(company.id)}">Выбрать</button></td></tr>`).join('')}</tbody></table></div>`
  if (/^(\d{10}|\d{12})$/.test(inn.trim())) return `<p class="op-inline-note">Компания не найдена в справочнике. Заполните реквизиты вручную.</p><div class="op-link-fields">${[['name','Название компании',120],['kpp','КПП',9],['legalAddress','Юридический адрес',250]].map(([name,label,max]) => `<label>${label}${name === 'kpp' && inn.trim().length === 12 ? ' · для ИП не требуется' : ' *'}<input name="${name}" maxlength="${max}" ${name === 'kpp' && inn.trim().length === 12 ? '' : 'required'}></label>`).join('')}</div>`
  return `<p class="op-inline-note">${inn.trim().length >= 3 ? 'Совпадений нет. Введите полный ИНН для ручного заполнения.' : 'Поиск начнётся после ввода трёх цифр ИНН.'}</p>`
}

export function inquiryCreateOrderForm(item, buyer = null) {
  if (item.orderLinks?.some(link=>link.createdFromInquiry)) return '<p class="op-inline-note">Заказ по составу заявки уже создан.</p>'
  let lines
  try { lines=inquiryOrderLines(item) } catch(error) { return `<p class="op-error">${escape(error.message)}</p>` }
  const groups=receivingGroups(lines), courier=groups.courier.length > 0, codes=groups.email.length > 0
  const input=(name,label,value='',required=true,max=120,readonly=false)=>`<label>${label}${required?' *':''}<input name="${name}" value="${escape(value)}" maxlength="${max}" ${required?'required':''} ${readonly?'readonly':''}></label>`
  const connected=!!buyer?.canPurchase
  const person=buyer ? buyer.person : item.person
  const email=buyer ? buyer.email : item.contact.kind === 'email' ? item.contact.value : ''
  const phone=buyer ? buyer.phone : item.contact.kind === 'phone' ? item.contact.value : ''
  const companyPicker=connected
    ? `<fieldset class="op-company-picker"><legend>Компания-покупатель</legend>${[['inn',buyer.company.inn],['name',buyer.company.name],['kpp',buyer.company.kpp || ''],['legalAddress',buyer.company.legalAddress || '']].map(([name,value])=>`<input type="hidden" name="${name}" value="${escape(value)}">`).join('')}<div class="op-company-selected"><strong>${escape(buyer.company.name)}</strong><dl class="op-fields">${field('ИНН',buyer.company.inn)}${field('КПП',buyer.company.kpp || 'Не требуется')}${field('Юридический адрес',buyer.company.legalAddress || 'Не указан')}</dl><p class="op-inline-note">Компания уже подтверждена в ЛК. Реквизиты подставятся из актуального профиля.</p></div></fieldset>`
    : `<fieldset class="op-company-picker"><legend>Компания-покупатель</legend><label>Поиск по ИНН *<input name="inn" inputmode="numeric" maxlength="12" pattern="[0-9]{10}|[0-9]{12}" required autocomplete="off" placeholder="Введите ИНН компании" aria-describedby="order-company-results"></label><div id="order-company-results" aria-live="polite">${inquiryCompanyLookup()}</div></fieldset>`
  return `<details class="op-disclosure"><summary>Создать заказ из заявки</summary><form data-create-inquiry="${item.id}" class="op-link-form"><p>Перенесём ${lines.length} поз. на ${money(item.total)}. Количество и цены сохранятся.</p>${companyPicker}<fieldset class="op-link-fields"><legend>Контактное лицо</legend>${input('person','ФИО',person,true,100,connected)}${input('contactEmail','Почта',email,connected || item.contact.kind === 'email',120,connected || item.contact.kind === 'email')}${input('contactPhone','Телефон',phone,connected || item.contact.kind === 'phone',30,connected || item.contact.kind === 'phone')}</fieldset><fieldset class="op-link-fields"><legend>Получение · ${courier ? 'курьер' : 'электронно'}</legend><input type="hidden" name="delivery" value="${courier ? 'courier' : 'email'}">${codes ? input('deliveryEmail','Почта для получения кодов',email,true,250) : ''}${courier ? input('recipient','Получатель',person,true,250)+input('deliveryPhone','Телефон получателя',phone,true,30)+input('address','Адрес доставки','',true,250) : ''}</fieldset>${needsProject(item.total) ? `<fieldset class="op-link-fields"><legend>Проект</legend>${input('customer','Конечный заказчик','',true,150)}${input('project','Наименование проекта','',true,150)}</fieldset>` : ''}<p><strong>Итого: ${money(item.total+deliveryCost(courier?'courier':'email'))}</strong>${courier ? ` · включая доставку ${money(deliveryCost('courier'))}` : ' · электронное получение бесплатно'}</p><p class="op-inline-note">${connected ? 'Доступ к компании уже открыт. Создание заказа не публикует счёт.' : 'Создание заказа не публикует счёт и не открывает пользователю доступ к компании.'}</p><label class="op-confirm"><input type="checkbox" name="confirmed" required> Реквизиты, контакт и состав заказа проверены</label><p class="op-error" id="inquiry-create-error" role="alert"></p><button class="op-button" type="submit">Создать заказ</button></form></details>`
}

export function inquiryOrdersView(item, availableOrders, buyer = null) {
  return `<section class="op-card op-compact op-inquiry-orders"><div class="op-card-head spread"><h2>Связанные заказы</h2>${badge(item.orderLinks?.length || 0)}</div>${item.orderLinks?.length ? item.orderLinks.map(link=>`<div class="op-document-row"><div><strong>${escape(link.order.company.name)}</strong><p class="op-inline-note">ИНН ${escape(link.order.company.inn)} · ${money(link.order.total)} · ${escape(orderStatus(link.order))} · связан ${orderDate(link.date)}</p></div><a class="op-button secondary" href="#order/${escape(link.order.id)}">${escape(link.order.id)} ↗</a></div>`).join('') : '<p class="op-inline-note">Заказ по этой заявке ещё не создан и не привязан.</p>'}<div class="op-inquiry-order-actions">${inquiryCreateOrderForm(item,buyer)}${availableOrders.length ? `<details class="op-disclosure"><summary>Привязать существующий заказ</summary><form data-link-inquiry="${item.id}" class="op-link-form"><label for="inquiry-order">Заказ *</label><select id="inquiry-order" name="orderId" required><option value="">Выберите заказ</option>${availableOrders.map(order=>`<option value="${escape(order.id)}">${escape(order.id)} · ${escape(order.company.name)} · ${money(order.total)}</option>`).join('')}</select><div id="inquiry-order-fields"></div><p class="op-error" id="inquiry-link-error" role="alert"></p></form></details>` : ''}</div><p class="op-inline-note op-inquiry-order-note">В ЛК заказ и документы видны после подтверждения доступа к компании покупателя.</p></section>`
}

function inquiryTimelineView(item) {
  return timelineView('Ход заявки', [
    timelineItem(item.date, 'Заявка отправлена', item.contact.value),
    ...(item.orderLinks || []).map(link => timelineItem(link.date, link.createdFromInquiry ? 'Заказ создан из заявки' : 'Заказ привязан к заявке', link.order.id)),
    timelineItem(null, inquiryStatusLabels[item.status])
  ])
}

export function purchaseInquiryDetailView(item, availableOrders = [], buyer = null) {
  const assignees=[...new Set(['', currentOperator, 'Иван Петров', item.assignee])]
  const currentFields=buyer ? [buyer.person && field('ФИО',buyer.person),buyer.position && field('Должность',buyer.position),buyer.email && field('Почта',buyer.email),buyer.phone && field('Телефон',buyer.phone)].filter(Boolean).join('') : ''
  return `<div class="op-inquiry-detail"><a class="op-button secondary op-inquiry-back" href="#inquiries">← Все заявки</a><div class="op-title op-detail-title"><div><h1>Заявка на покупку</h1><p>${escape(item.id)} · ${orderDate(item.date)}</p></div>${badge(inquiryStatusLabels[item.status],item.status === 'done' ? 'green' : 'blue')}</div>
    <div class="op-layout"><div class="op-content">${detailTabsView(`inquiry/${item.id}`, [['overview','Заявка'],['orders','Заказы'],['history','История и заметки']])}
    ${detailPanelStart(`inquiry/${item.id}`, 'overview')}<section class="op-card op-compact op-inquiry-person"><h2>Заявитель</h2><div class="op-inquiry-person-grid"><div><h3>При отправке заявки</h3><p class="op-inline-note">Данные, с которыми обратились</p><dl class="op-fields">${item.person ? field('ФИО',item.person) : ''}${field(item.contact.kind === 'email' ? 'Подтверждённая почта' : 'Подтверждённый телефон',item.contact.value)}</dl></div>${buyer ? `<div><h3>Сейчас в ЛК</h3><p class="op-inline-note">Актуальные данные пользователя</p>${currentFields ? `<dl class="op-fields two">${currentFields}</dl>` : '<p class="op-inline-note">Личные данные пока не заполнены.</p>'}<div class="op-inquiry-access"><span>${buyer.company ? `${escape(buyer.company.name)} · ИНН ${escape(buyer.company.inn)}` : 'Компания не подключена'}</span>${badge(buyer.canPurchase ? 'Покупки доступны' : 'Доступ закрыт',buyer.canPurchase ? 'green' : 'amber')}</div></div>` : ''}</div>${item.comment ? `<div class="op-inquiry-comment-box"><h3>Комментарий заявителя</h3><p class="op-inquiry-comment">${escape(item.comment)}</p></div>` : ''}</section>
    <section class="op-card op-compact op-inquiry-products"><h2>Выбранные товары</h2>${item.lines.map(line=>`<div class="op-order-line"><div><strong>${escape(line.name)}</strong><p>${escape(line.variant)}</p><p class="op-inline-note">${escape(line.sku)}${line.keySku && line.keySku !== 'AUTO' ? ` · ${escape(line.keySku)}` : ''} · ${escape(line.protection)}${line.keyQuantity ? ` · ${line.keyQuantity} ключей` : ''}</p></div><div class="op-line-price"><strong>${money(line.total)}</strong><small>${line.keyQuantity ? `${line.quantity} лицензий · ${line.keyQuantity} ключей` : `${line.quantity} шт. × ${money(line.unit)}`}</small></div></div>`).join('')}</section></div>
    ${detailPanelStart(`inquiry/${item.id}`, 'orders')}${inquiryOrdersView(item, availableOrders, buyer)}</div>
    ${detailPanelStart(`inquiry/${item.id}`, 'history')}${inquiryTimelineView(item)}${notesView(item, 'inquiry')}</div></div>
    <aside class="op-card op-inquiry-processing"><h2>Обработка заявки</h2><div class="op-inquiry-owner"><label for="inquiry-assignee">Ответственный</label><select id="inquiry-assignee" data-id="${item.id}">${assignees.map(name=>`<option value="${escape(name)}" ${name === item.assignee ? 'selected' : ''}>${escape(name || 'Не назначен')}</option>`).join('')}</select></div><div class="op-inquiry-total"><span class="op-label">Сумма заявки</span><strong>${money(item.total)}</strong><p class="op-inline-note">Предварительно, без доставки</p></div>${item.status !== 'done' ? `<button class="op-button primary" data-action="inquiry-status" data-id="${item.id}" data-status="${item.status === 'new' ? 'working' : 'done'}">${item.status === 'new' ? 'Взять в работу' : 'Завершить обработку'}</button>` : '<p class="op-inline-note">Обработка завершена.</p>'}</aside></div></div>`
}

let inquiryQuery = '', inquiryStatusFilter = 'all', inquiryOwner = 'all'

export function filterPurchaseInquiries(items, query = '', status = 'all', owner = 'all') {
  const needle = query.trim().toLocaleLowerCase('ru-RU')
  return items.filter(item => (status === 'all' || item.status === status) &&
    (owner === 'all' || (owner === 'mine' ? item.assignee === currentOperator : owner === 'unassigned' ? !item.assignee : item.assignee === owner.slice(7))) &&
    [item.id, item.person, item.contact.value, ...item.lines.flatMap(line => [line.name, line.sku, line.keySku])].some(value => value.toLocaleLowerCase('ru-RU').includes(needle)))
    .sort((a,b) => Date.parse(b.date) - Date.parse(a.date))
}

export function inquiryOrderLinksView(item) {
  if (!item.orderLinks?.length) return '<small>Не создан</small>'
  return item.orderLinks.map(link=>`<a class="op-context-link" href="#order/${escape(link.order.id)}" aria-label="Открыть ${link.createdFromInquiry ? 'созданный из заявки' : 'привязанный'} заказ ${escape(link.order.id)}" title="${escape(link.order.id)}">${escape(link.order.id.length > 14 ? `${link.order.id.slice(0, 14)}…` : link.order.id)}</a>`).join('')
}

function inquiryRowsView(items) {
  const visible = filterPurchaseInquiries(items, inquiryQuery, inquiryStatusFilter, inquiryOwner)
  document.querySelector('#inquiry-result-count').textContent = `Показано ${visible.length} из ${items.length}`
  document.querySelector('#inquiry-rows').innerHTML = visible.map(item=>`<tr>
    <td><a class="op-queue-link" href="#inquiry/${escape(item.id)}" aria-label="Открыть заявку ${escape(item.id)}" title="${escape(item.id)}">${escape(item.id.length > 18 ? `${item.id.slice(0, 18)}…` : item.id)}</a></td>
    <td class="op-queue-date">${orderDate(item.date)}<small>${ageView(item.date)}</small></td>
    <td><strong>${escape(item.person || 'Без ФИО')}</strong><small>${escape(item.contact.value)}</small></td>
    <td><strong>${money(item.total)}</strong><small>${item.lines.length} поз.</small></td>
    <td class="op-queue-state">${badge(inquiryStatusLabels[item.status],item.status === 'done' ? 'green' : 'blue')}</td>
    <td>${inquiryOrderLinksView(item)}</td>
    <td>${escape(item.assignee || 'Не назначен')}</td>
  </tr>`).join('') || `<tr><td colspan="7" class="op-empty"><strong>${items.length ? 'Заявки не найдены' : 'Заявок на покупку пока нет'}</strong>${items.length ? '<p>Измените запрос или снимите фильтры.</p><button class="op-button secondary" data-action="clear-inquiry-filters">Сбросить фильтры</button>' : ''}</td></tr>`
}

function renderPurchaseInquiries(id) {
  try {
    const items=loadPurchaseInquiries(window.localStorage)
    if (id) {
      const item=items.find(item=>item.id === id)
      document.querySelector('#main').innerHTML=item ? purchaseInquiryDetailView(item, orders.filter(order=>!items.some(entry=>entry.orderLinks?.some(link=>link.order.id === order.id))), currentInquiryBuyer(window.localStorage,item)) : '<h1>Заявка не найдена</h1><a href="#inquiries">К списку</a>'
      return
    }
    const owners = [...new Set([currentOperator, ...items.map(item=>item.assignee), inquiryOwner.startsWith('person:') ? inquiryOwner.slice(7) : ''].filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ru'))
    document.querySelector('#main').innerHTML=`<div class="op-title"><div><div class="op-eyebrow">РАБОЧЕЕ МЕСТО ОПЕРАТОРА</div><h1>Заявки на покупку</h1><p>Обращения покупателей до оформления заказа</p></div><span class="op-total">${countLabel(items.length, 'заявка', 'заявки', 'заявок')}</span></div><section class="op-card op-register op-queue-register op-inquiry-register" aria-label="Реестр заявок на покупку">
      <div class="op-filters"><label class="op-search">Поиск<input type="search" maxlength="1000" id="inquiry-search" value="${escape(inquiryQuery)}" placeholder="Номер, ФИО, контакт, товар или артикул"></label><label>Статус<select id="inquiry-status">${[['all','Все статусы'],...Object.entries(inquiryStatusLabels)].map(([value,label])=>`<option value="${value}" ${inquiryStatusFilter===value?'selected':''}>${label}</option>`).join('')}</select></label><label>Ответственный<select id="inquiry-owner">${[['all','Все ответственные'],['mine','Мои'],['unassigned','Не назначен'],...owners.map(name=>[`person:${name}`,name])].map(([value,label])=>`<option value="${escape(value)}" ${inquiryOwner===value?'selected':''}>${escape(label)}</option>`).join('')}</select></label><button class="op-button secondary" data-action="clear-inquiry-filters">Сбросить</button></div>
      <div class="op-table-scroll" role="region" aria-label="Список заявок на покупку" tabindex="0"><table class="op-table op-queue-table op-inquiry-table"><thead><tr><th scope="col">Заявка</th><th scope="col">Подана</th><th scope="col">Контакт</th><th scope="col">Сумма товаров</th><th scope="col">Статус</th><th scope="col">Заказ</th><th scope="col">Ответственный</th></tr></thead><tbody id="inquiry-rows"></tbody></table></div><div class="op-table-footer" id="inquiry-result-count" role="status"></div></section>`
    inquiryRowsView(items)
    document.querySelector('#inquiry-search').addEventListener('input', event => { inquiryQuery=event.target.value; inquiryRowsView(items) })
    document.querySelector('#inquiry-status').addEventListener('change', event => { inquiryStatusFilter=event.target.value; inquiryRowsView(items) })
    document.querySelector('#inquiry-owner').addEventListener('change', event => { inquiryOwner=event.target.value; inquiryRowsView(items) })
  } catch (error) { document.querySelector('#main').innerHTML=`<h1>Не удалось загрузить заявки</h1><p>${escape(error.message)}</p>` }
}

function renderRoute() {
  const isOrders = location.hash === '#orders' || location.hash.startsWith('#order/')
  const isInquiries = location.hash === '#inquiries' || location.hash.startsWith('#inquiry/')
  document.querySelectorAll('.op-nav a').forEach(link => {
    if (link.getAttribute('href') === (isInquiries ? '#inquiries' : isOrders ? '#orders' : '#requests')) link.setAttribute('aria-current', 'page')
    else link.removeAttribute('aria-current')
  })
  if (isInquiries) { renderPurchaseInquiries(location.hash.startsWith('#inquiry/') ? location.hash.slice(9) : undefined); return }
  if (location.hash === '#orders') { renderOrders(); return }
  if (location.hash.startsWith('#order/')) {
    const order = orders.find(item => item.id === location.hash.slice(7))
    let inquiry
    try { inquiry=purchaseInquiryForOrder(window.localStorage,order?.id) } catch(error) { storageNotice(error.message); return }
    const linked=inquiry?.orderLinks.find(link=>link.order.id === order.id)?.order
    document.querySelector('#main').innerHTML = order ? orderDetailView(orderWithProgress({...order,...linked},loadOrderProgress(window.localStorage),true), requests.find(item => item.id === order.verificationId), inquiry) : '<h1>Заказ не найден</h1><a href="#orders">Вернуться к заказам</a>'
    return
  }

  const id = location.hash.startsWith('#request/') ? location.hash.slice(9) : ''
  request = requests.find(item => item.id === id)
  if (id && !request) document.querySelector('#main').innerHTML = '<h1>Заявка не найдена</h1><a href="#requests">Вернуться к списку</a>'
  else if (request) renderDetail()
  else renderQueue()
}

let storageBlocked = false, lastSaved = ''
function snapshot() {
  return operatorSnapshot(requests.filter(r => !r.id.startsWith('VR-LK-')), orders.filter(order=>/^ORD-\d+$/.test(order.id)), { query, status, companyFilter, accessFilter, requestOwner, requestSort, orderQuery, orderStatusFilter, orderPaymentFilter, orderOwner, orderSort, inquiryQuery, inquiryStatusFilter, inquiryOwner }, drafts, noteDrafts, scrollPositions, requestSequence)
}

function storageNotice(message = '') {
  const notice = document.querySelector('#storage-notice')
  notice.textContent = message
  notice.hidden = !message
}

function persistOperator() {
  if (storageBlocked) return
  const state = snapshot(), serialized = JSON.stringify(state)
  if (serialized === lastSaved) return
  try {
    saveOperatorState(window.localStorage, state)
    lastSaved = serialized
    storageNotice()
  } catch {
    storageNotice('Не удалось сохранить изменения в браузере. Не закрывайте страницу: последние изменения пока только в памяти. Проверьте доступность и свободное место хранилища.')
  }
}

function restoreOperator() {
  try {
    const saved = loadOperatorState(window.localStorage, requests.map(item => item.id), orders.map(item => item.id), loadLinkedRequests(window.localStorage).map(r => r.id), loadPurchaseInquiries(window.localStorage).map(item => item.id), [...createdInquiryOrders(window.localStorage), ...loadState(window.localStorage).orders].map(order=>order.id))
    if (saved) {
      requests = requests.map(item => ({ ...item, ...saved.requests.find(entry => entry.id === item.id) }))
      orders = orders.map(item => ({ ...item, ...saved.orders.find(entry => entry.id === item.id) }))
      ;({ query, status, companyFilter, accessFilter, requestOwner, requestSort, orderQuery, orderStatusFilter, orderPaymentFilter, orderOwner, orderSort, inquiryQuery, inquiryStatusFilter, inquiryOwner } = saved.filters)
      for (const [key, value] of saved.drafts) drafts.set(key, value)
      for (const [key, value] of saved.noteDrafts) noteDrafts.set(key, value)
      for (const [key, value] of saved.scrollPositions) scrollPositions.set(key, value)
      requestSequence = saved.requestSequence
    }
  } catch {
    storageBlocked = true
    storageNotice('Не удалось прочитать сохранение оператора. Показаны исходные примеры; прежнее сохранение не перезаписано. Чтобы начать заново, используйте «Сбросить демо».')
  }
}

export function loadOperatorOrders(storage, seedOrders) {
  const direct = loadState(storage).orders
  const created = createdInquiryOrders(storage)
  const progress = loadOrderProgress(storage)
  return [...seedOrders.filter(order => /^ORD-\d+$/.test(order.id)), ...direct, ...created]
    .map(order => orderWithProgress(order, progress, true))
}

function refreshLinkedRequests(render = true) {
  try {
    const linked = loadLinkedRequests(window.localStorage)
    requests = [...requests.filter(r => !r.id.startsWith('VR-LK-')), ...linked]
    for (const map of [drafts, noteDrafts]) for (const id of map.keys()) if (id.startsWith('VR-LK-') && !linked.some(r => r.id === id)) map.delete(id)
    const inquiries = loadPurchaseInquiries(window.localStorage)
    const created=createdInquiryOrders(window.localStorage)
    orders=loadOperatorOrders(window.localStorage, orders)
    for (const id of noteDrafts.keys()) if (id.startsWith('ORD-LK-') && !created.some(order=>order.id === id)) noteDrafts.delete(id)
    for (const id of noteDrafts.keys()) if (id.startsWith('PI-') && !inquiries.some(item => item.id === id)) noteDrafts.delete(id)
    if (render) renderRoute()
  } catch (error) { storageNotice(error.message) }
}

// shortcut: operator data is local to this browser; replace with an operator API when integrating Bitrix.
if (typeof document !== 'undefined') {
  restoreOperator()
  refreshLinkedRequests(false)
  renderRoute()
  lastSaved = JSON.stringify(snapshot())
  requestAnimationFrame(() => {
    const position = scrollPositions.get(location.hash || '#requests')
    if (position) { window.scrollTo(0, position.y); document.querySelector('.op-table-scroll').scrollLeft = position.x }
  })
  document.querySelector('.op-skip').addEventListener('click', event => { event.preventDefault(); document.querySelector('#main').focus() })
  let renderedRoute = location.hash || '#requests'
  function rememberPosition() {
    const route = location.hash || '#requests'
    if (route !== renderedRoute || !['#requests', '#orders'].includes(route)) return
    const position = { y: window.scrollY, x: document.querySelector('.op-table-scroll')?.scrollLeft || 0 }
    if (!scrollPositions.has(route) && position.x === 0 && position.y === 0) return
    scrollPositions.set(route, position)
  }
  window.addEventListener('storage', event => { if ([verificationBridgeKey,purchaseInquiryKey,storageKey,orderProgressKey].includes(event.key) || event.key === null) refreshLinkedRequests() })
  window.addEventListener('focus', () => refreshLinkedRequests())
  window.addEventListener('scroll', rememberPosition, { passive: true })
  document.addEventListener('scroll', rememberPosition, { passive: true, capture: true })
  window.addEventListener('hashchange', () => {
    renderRoute()
    const route = location.hash || '#requests'
    const position = scrollPositions.get(route)
    document.querySelector('#main').focus({ preventScroll: true })
    requestAnimationFrame(() => {
      if ((location.hash || '#requests') !== route) return
      window.scrollTo(0, position?.y || 0)
      const table = document.querySelector('.op-table-scroll')
      if (table) table.scrollLeft = position?.x || 0
      renderedRoute = route
      persistOperator()
    })
  })
  setInterval(() => document.querySelectorAll('[data-age]').forEach(node => { node.textContent = ageLabel(node.dataset.age) }), 60000)
  document.querySelector('#main').addEventListener('input', event => {
    const createForm=event.target.closest('[data-create-inquiry]')
    if (createForm && event.target.name === 'inn') {
      createForm.querySelector('#order-company-results').innerHTML=inquiryCompanyLookup(event.target.value)
      createForm.elements.confirmed.checked=false
      createForm.querySelector('#inquiry-create-error').textContent=''
    }
    const form = event.target.closest('[data-note-form]')
    if (form) noteDrafts.set(form.dataset.id, form.elements.note.value)
  })
  document.querySelector('#main').addEventListener('submit', event => {
    const relationshipForm=event.target.closest('[data-approve-relationship]')
    if (relationshipForm) {
      event.preventDefault()
      try {
        approveInquiryOrderRelationship(window.localStorage,relationshipForm.dataset.approveRelationship,relationshipForm.elements.basis.value)
        renderRoute()
        document.querySelector('#announcement').textContent='Связь заявителя с компанией подтверждена оператором.'
      } catch(error) { document.querySelector('#relationship-error').textContent=error.message }
      return
    }
    const createForm=event.target.closest('[data-create-inquiry]')
    if (createForm) {
      event.preventDefault()
      try {
        const values=Object.fromEntries(new FormData(createForm))
        values.confirmed=createForm.elements.confirmed.checked
        const order=createOrderFromInquiry(window.localStorage,createForm.dataset.createInquiry,values)
        refreshLinkedRequests(false)
        location.hash=`order/${order.id}`
        document.querySelector('#announcement').textContent='Заказ создан и связан с заявкой.'
      } catch(error) { document.querySelector('#inquiry-create-error').textContent=error.message }
      return
    }
    const linkForm=event.target.closest('[data-link-inquiry]')
    if (linkForm) {
      event.preventDefault()
      try {
        const values=Object.fromEntries(new FormData(linkForm))
        values.confirmed=linkForm.elements.confirmed.checked
        const order=orders.find(item=>item.id === values.orderId)
        linkPurchaseInquiry(window.localStorage,linkForm.dataset.linkInquiry,order,values)
        renderPurchaseInquiries(linkForm.dataset.linkInquiry)
        document.querySelector('#announcement').textContent='Заказ привязан к заявке.'
      } catch(error) { document.querySelector('#inquiry-link-error').textContent=error.message }
      return
    }
    const form = event.target.closest('[data-note-form]')
    if (!form) return
    event.preventDefault()
    try {
      const kind = form.dataset.noteForm
      if (kind === 'inquiry') {
        addPurchaseInquiryNote(window.localStorage, form.dataset.id, form.elements.note.value)
        noteDrafts.delete(form.dataset.id)
        renderPurchaseInquiries(form.dataset.id)
      } else {
        const item = (kind === 'request' ? requests : orders).find(entry => entry.id === form.dataset.id)
        const next = addInternalNote(item, form.elements.note.value)
        const draft=noteDrafts.get(item.id)
        noteDrafts.delete(item.id)
        try { updateWorkItem(kind, next) }
        catch(error) { if (draft !== undefined) noteDrafts.set(item.id,draft); throw error }
      }
      document.querySelector('#internal-note').focus({ preventScroll: true })
      document.querySelector('#announcement').textContent = 'Внутренняя заметка добавлена. Покупателю не отправлена.'
    } catch (error) { document.querySelector('#note-error').textContent = error.message }
  })
  document.querySelector('#main').addEventListener('change', event => {
    if (event.target.id === 'inquiry-order') {
      const order=orders.find(item=>item.id === event.target.value)
      const verification=order && requests.find(item=>item.id === order.verificationId)
      document.querySelector('#inquiry-order-fields').innerHTML=inquiryOrderFields(order,verification?.code || '')
      document.querySelector('#inquiry-link-error').textContent=''
      return
    }
    if (event.target.id === 'inquiry-assignee') {
      const id=event.target.dataset.id
      try {
        assignPurchaseInquiry(window.localStorage,id,event.target.value)
        renderPurchaseInquiries(id)
        document.querySelector('#inquiry-assignee').focus({preventScroll:true})
        document.querySelector('#announcement').textContent='Ответственный сохранён.'
      } catch (error) {
        renderPurchaseInquiries(id)
        document.querySelector('#announcement').textContent=error.message
      }
      return
    }
    const kind = event.target.dataset.sort
    if (kind === 'request') { requestSort = event.target.value; renderQueue() }
    if (kind === 'order') { orderSort = event.target.value; renderOrders() }
    if (kind) document.querySelector(`[data-sort="${kind}"]`).focus({ preventScroll: true })
  })
  const resetDialog = document.querySelector('#reset-dialog')
  document.querySelector('#reset').addEventListener('click', () => { resetDialog.returnValue = ''; resetDialog.showModal() })
  resetDialog.addEventListener('close', () => {
    if (resetDialog.returnValue !== 'reset') return
    try { clearPurchaseInquiries(window.localStorage); clearLinkedRequests(window.localStorage); clearOrderProgress(window.localStorage); clearOperatorState(window.localStorage) }
    catch { storageNotice('Не удалось удалить сохранение. Сброс не выполнен; данные оставлены на странице. Проверьте доступ к хранилищу браузера и повторите.'); return }
    storageBlocked = false
    storageNotice()
    requests = createDemoRequests(); orders = createOperatorOrders(requests); drafts.clear(); noteDrafts.clear(); detailTabSelection.clear(); scrollPositions.clear(); requestSequence = []; requestOwner = orderOwner = 'all'; requestSort = orderSort = 'newest'; query = ''; status = 'all'; companyFilter = 'all'; accessFilter = 'all'; orderQuery = ''; orderStatusFilter = 'all'; orderPaymentFilter = 'all'; inquiryQuery = ''; inquiryStatusFilter = inquiryOwner = 'all'; refreshLinkedRequests(false); renderRoute()
    window.scrollTo(0, 0)
    const table = document.querySelector('.op-table-scroll')
    if (table) table.scrollLeft = 0
    lastSaved = JSON.stringify(snapshot())
    document.querySelector('#announcement').textContent = 'Сохранение оператора удалено. Заявки, заказы и фильтры возвращены к исходным примерам.'
  })
  document.querySelector('#main').addEventListener('keydown', event => {
    const tab = event.target.closest('[data-detail-tab]')
    if (!tab || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const tabs = [...tab.closest('.op-detail-tabs').querySelectorAll('[data-detail-tab]')]
    const index = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (tabs.indexOf(tab) + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length
    selectDetailTab(tabs[index])
    tabs[index].focus()
  })
  document.querySelector('#main').addEventListener('click', async event => {
    const tab = event.target.closest('[data-detail-tab]')
    if (tab) { selectDetailTab(tab); return }
    const link = event.target.closest('a[href]')
    if (link) {
      rememberPosition()
      if ((location.hash || '#requests') === '#requests' && link.hash.startsWith('#request/')) requestSequence = visibleRequests().map(item => item.id)
    }
    const companyButton = event.target.closest('[data-select-order-company]')
    if (companyButton) {
      const form=companyButton.closest('[data-create-inquiry]')
      const company=searchCompanyDirectory(form.elements.inn.value).find(item=>item.id === companyButton.dataset.selectOrderCompany)
      if (!company) return
      form.elements.inn.value=company.inn
      form.querySelector('#order-company-results').innerHTML=inquiryCompanyLookup(company.inn,company.id)
      form.elements.confirmed.checked=false
      form.elements.person.focus()
      return
    }
    const copy = event.target.closest('[data-copy]')
    if (copy) {
      try {
        await navigator.clipboard.writeText(copy.dataset.copy)
        copy.textContent = 'Скопировано'; copy.setAttribute('aria-label', 'Скопировано')
        document.querySelector('#announcement').textContent = `Скопировано: ${copy.dataset.copy}`
        setTimeout(() => { copy.textContent = '⧉'; copy.setAttribute('aria-label', `Скопировать ${copy.dataset.copy}`) }, 1800)
      } catch {
        copy.textContent = 'Не скопировано'
        document.querySelector('#announcement').textContent = 'Не удалось скопировать. Выделите значение и скопируйте вручную.'
        setTimeout(() => { copy.textContent = '⧉' }, 1800)
      }
      return
    }
    const owner = event.target.closest('[data-owner]')
    if (owner) {
      if (owner.dataset.kind === 'request') { requestOwner = owner.dataset.owner; renderQueue() }
      else { orderOwner = owner.dataset.owner; renderOrders() }
      document.querySelector(`[data-owner="${owner.dataset.owner}"][data-kind="${owner.dataset.kind}"]`).focus({ preventScroll: true })
      return
    }
    const inquiryButton = event.target.closest('[data-action="inquiry-status"]')
    if (inquiryButton) {
      try { updatePurchaseInquiry(window.localStorage,inquiryButton.dataset.id,inquiryButton.dataset.status,currentOperator); renderRoute() }
      catch (error) { document.querySelector('#announcement').textContent=error.message }
      return
    }
    const orderEvent = event.target.closest('[data-action="order-event"]')
    if (orderEvent) {
      try {
        const order=orders.find(item=>item.id === orderEvent.dataset.id)
        if (!order) throw new Error('Заказ не найден. Обновите страницу.')
        const updated=advanceOrderProgress(window.localStorage,order,orderEvent.dataset.event)
        orders=orders.map(item=>item.id === order.id ? updated : item)
        renderRoute()
        document.querySelector('#announcement').textContent=orderEventLabels[orderEvent.dataset.event]
      } catch(error) { document.querySelector('#announcement').textContent=error.message }
      return
    }
    const statusButton = event.target.closest('[data-status]')
    if (statusButton) { status = statusButton.dataset.status; renderQueue(); return }
    const button = event.target.closest('[data-action]')
    const action = button?.dataset.action
    if (!action) return
    if (action === 'take') {
      try {
        const kind = button.dataset.kind
        const item = (kind === 'request' ? requests : orders).find(entry => entry.id === button.dataset.id)
        updateWorkItem(kind, takeOwnership(item))
        document.querySelector('#announcement').textContent = 'Вы назначены ответственным.'
        document.querySelector('#main').focus({ preventScroll: true })
      } catch (error) { document.querySelector('#announcement').textContent = error.message }
      return
    }
    if (action === 'template') {
      try {
        const input = document.querySelector('#comment')
        const selected = document.querySelector('#comment-template').value
        if (selected === '') throw new Error('Выберите шаблон.')
        input.value = appendTemplate(input.value, Number(selected))
        drafts.set(request.id, { comment: input.value, authority: document.querySelector('#authority').checked })
        document.querySelector('#decision-error').textContent = ''
        document.querySelector('#announcement').textContent = 'Шаблон добавлен. Проверьте комментарий перед отправкой.'
        input.focus()
      } catch (error) { document.querySelector('#decision-error').textContent = error.message }
      return
    }
    if (action === 'clear-inquiry-filters') { inquiryQuery = ''; inquiryStatusFilter = inquiryOwner = 'all'; renderPurchaseInquiries(); document.querySelector('#inquiry-search').focus(); return }
    if (action === 'clear-order-filters') { orderOwner = 'all'; orderSort = 'newest'; orderQuery = ''; orderStatusFilter = 'all'; orderPaymentFilter = 'all'; renderOrders(); document.querySelector('#order-search').focus(); return }
    if (action === 'clear-filters') { requestOwner = 'all'; requestSort = 'newest'; query = ''; status = 'all'; companyFilter = 'all'; accessFilter = 'all'; renderQueue(); document.querySelector('#search').focus(); return }
    if (!['retry', 'sync-ready', 'sync-error'].includes(action)) return
    saveRequest(action === 'retry' ? retrySync(request, button.dataset.entity) : completeSync(request, button.dataset.entity, action === 'sync-ready' ? 'ready' : 'error'))
    renderDetail(); document.querySelector('#decision-title').focus()
    document.querySelector('#announcement').textContent = syncLabels[syncStatus(request)]
  })
  for (const type of ['input', 'change', 'submit', 'click']) document.querySelector('#main').addEventListener(type, persistOperator)
  window.addEventListener('pagehide', () => { rememberPosition(); persistOperator() })
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') { rememberPosition(); persistOperator() } })

}
