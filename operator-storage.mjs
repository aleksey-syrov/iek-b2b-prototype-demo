export const operatorStorageKey = 'iek-digital-operator:v1'

const text = (value, limit = 1000) => typeof value === 'string' && value.length <= limit
const date = value => text(value, 40) && Number.isFinite(Date.parse(value))
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const assignment = item => item.assignee === null || text(item.assignee, 100)
const notes = value => Array.isArray(value) && value.every(note => object(note) && text(note.text) && note.text.trim() && text(note.author, 100) && date(note.date))
const uniqueIds = (items, allowed) => Array.isArray(items) && items.length === allowed.length &&
  new Set(items.map(item => item?.id)).size === items.length && items.every(item => object(item) && allowed.includes(item.id))
const entries = (items, ids, valid) => Array.isArray(items) && new Set(items.map(entry => entry?.[0])).size === items.length &&
  items.every(entry => Array.isArray(entry) && entry.length === 2 && ids.includes(entry[0]) && valid(entry[1]))

const filterOptions = {
  status: ['all', 'pending', 'approved', 'returned', 'rejected', 'sync-error'],
  companyFilter: ['all', 'present', 'absent'], accessFilter: ['all', 'open', 'closed'],
  requestOwner: ['all', 'mine', 'unassigned'], orderOwner: ['all', 'mine', 'unassigned'],
  requestSort: ['newest', 'oldest'], orderSort: ['newest', 'oldest'],
  orderStatusFilter: ['all', 'Счёт не опубликован', 'Ожидает оплаты', 'Ожидает соглашения', 'Соглашение опубликовано'],
  orderPaymentFilter: ['all', 'paid', 'unpaid'],
  inquiryStatusFilter: ['all', 'new', 'working', 'done']
}

export function operatorSnapshot(requests, orders, filters, drafts, noteDrafts, scrollPositions, requestSequence) {
  return {
    requests: requests.map(({id, assignee, notes, decision, sync, comment, history}) => ({id, assignee, notes, decision, sync, comment, history})),
    orders: orders.map(({id, assignee, notes}) => ({id, assignee, notes})),
    filters, drafts: [...drafts], noteDrafts: [...noteDrafts], scrollPositions: [...scrollPositions], requestSequence
  }
}

export function loadOperatorState(storage, requestIds, orderIds, linkedIds = [], inquiryIds = [], createdOrderIds = []) {
  const raw = storage.getItem(operatorStorageKey)
  if (raw === null) return null
  const saved = JSON.parse(raw)
  const s = saved?.state
  if (s?.filters?.orderStatusFilter === 'Ручная обработка') s.filters.orderStatusFilter = 'Счёт не опубликован'
  if (object(s?.filters)) for (const [key,value] of Object.entries({inquiryQuery:'', inquiryStatusFilter:'all', inquiryOwner:'all'})) {
    if (s.filters[key] === undefined) s.filters[key] = value
  }
  if (s && Array.isArray(s.drafts) && Array.isArray(s.noteDrafts) && Array.isArray(s.requestSequence)) {
    const removed = id => typeof id === 'string' && id.startsWith('VR-LK-') && !linkedIds.includes(id)
    s.drafts = s.drafts.filter(entry => !removed(entry?.[0]))
    s.noteDrafts = s.noteDrafts.filter(entry => !removed(entry?.[0]) && !(typeof entry?.[0] === 'string' && entry[0].startsWith('PI-') && !inquiryIds.includes(entry[0])) && !(typeof entry?.[0] === 'string' && /^(ORD-LK-|DEMO-|SAMPLE-)/.test(entry[0]) && !createdOrderIds.includes(entry[0])))
    s.requestSequence = s.requestSequence.filter(id => !removed(id))
  }
  const valid = saved?.version === 1 && object(s) &&
    uniqueIds(s.requests, requestIds) && s.requests.every(item => assignment(item) && notes(item.notes) &&
      ['pending', 'approved', 'returned', 'rejected'].includes(item.decision) && text(item.comment) &&
      (!['returned', 'rejected'].includes(item.decision) || item.comment.trim()) &&
      object(item.sync) && Object.keys(item.sync).length === 2 && ['company', 'contact'].every(key =>
        (item.decision === 'approved' ? ['pending', 'ready', 'error'] : ['not_started']).includes(item.sync[key])) &&
      Array.isArray(item.history) && item.history.every(event => object(event) && text(event.title, 300) && text(event.note) && date(event.date))) &&
    uniqueIds(s.orders, orderIds) && s.orders.every(item => assignment(item) && notes(item.notes)) &&
    object(s.filters) && ['query', 'orderQuery', 'inquiryQuery'].every(key => text(s.filters[key], 1000)) &&
    text(s.filters.inquiryOwner,107) && (['all','mine','unassigned'].includes(s.filters.inquiryOwner) || /^person:.+/.test(s.filters.inquiryOwner)) &&
    Object.entries(filterOptions).every(([key, values]) => values.includes(s.filters[key])) &&
    entries(s.drafts, [...requestIds, ...linkedIds], draft => object(draft) && text(draft.comment) && typeof draft.authority === 'boolean') &&
    entries(s.noteDrafts, [...requestIds, ...linkedIds, ...orderIds, ...inquiryIds, ...createdOrderIds], value => text(value)) &&
    entries(s.scrollPositions, ['#requests', '#orders'], point => object(point) && [point.x, point.y].every(value => Number.isFinite(value) && value >= 0)) &&
    Array.isArray(s.requestSequence) && new Set(s.requestSequence).size === s.requestSequence.length && s.requestSequence.every(id => requestIds.includes(id) || linkedIds.includes(id))
  if (!valid) throw new Error('Сохранение оператора повреждено или его версия не поддерживается.')
  // Only mutable demo fields are restored; saved data cannot replace IDs, order totals or company details.
  return operatorSnapshot(s.requests, s.orders, Object.fromEntries(['query', 'orderQuery', 'inquiryQuery', 'inquiryOwner', ...Object.keys(filterOptions)].map(key => [key, s.filters[key]])),
    new Map(s.drafts), new Map(s.noteDrafts), new Map(s.scrollPositions), s.requestSequence)
}

export function saveOperatorState(storage, state) {
  // shortcut: one local tab owns this snapshot; use a backend for concurrent operator sessions.
  storage.setItem(operatorStorageKey, JSON.stringify({ version: 1, state }))
}

export function clearOperatorState(storage) {
  storage.removeItem(operatorStorageKey)
}
