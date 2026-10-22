export const orderProgressKey = 'iek-digital-order-progress:v1'

export const orderEventLabels = {
  sent: 'Передан в 1С', accepted: 'Принят в 1С', error: 'Ошибка обмена с 1С',
  invoice: 'Счёт опубликован', paid: 'Оплата подтверждена', agreement: 'Соглашение опубликовано'
}

const valid = item => item && /^(DEMO-\d+|SAMPLE-0[1-4]|ORD-\d+|ORD-LK-[a-f0-9-]{36})$/.test(item.id) &&
  ['not_started', 'pending', 'ready', 'error'].includes(item.sync) &&
  ['invoice', 'paid', 'agreement'].every(key => typeof item[key] === 'boolean') &&
  (!item.paid || item.invoice) && (!item.agreement || item.paid) &&
  Array.isArray(item.events) && item.events.length <= 100 && item.events.every(event =>
    event && Object.hasOwn(orderEventLabels, event.type) && typeof event.date === 'string' && Number.isFinite(Date.parse(event.date))) &&
  (item.work === undefined || (item.work && (item.work.assignee === null || typeof item.work.assignee === 'string' && item.work.assignee.length <= 100) &&
    Array.isArray(item.work.notes) && item.work.notes.every(note => note && typeof note.text === 'string' && note.text.length <= 1000 && note.text.trim() &&
      typeof note.author === 'string' && note.author.length <= 100 && typeof note.date === 'string' && Number.isFinite(Date.parse(note.date)))))

export function loadOrderProgress(storage) {
  const raw = storage.getItem(orderProgressKey)
  if (raw === null) return []
  const saved = JSON.parse(raw)
  if (saved?.version !== 1 || !Array.isArray(saved.items) || !saved.items.every(valid) ||
    new Set(saved.items.map(item => item.id)).size !== saved.items.length)
    throw new Error('События заказов повреждены. Сохранение не изменено.')
  return saved.items
}

function initial(order) {
  return { id: order.id, sync: order.invoice ? 'ready' : 'not_started', invoice: order.invoice,
    paid: order.paid, agreement: order.agreement, events: [] }
}

export function orderWithProgress(order, items, includeOperatorData = false) {
  const item = items.find(entry => entry.id === order.id) || initial(order)
  return { ...order, invoice: order.invoice || item.invoice, paid: order.paid || item.paid,
    agreement: order.agreement || item.agreement,
    orderEvents: includeOperatorData ? item.events : item.events.filter(event => ['invoice', 'paid', 'agreement'].includes(event.type)),
    ...(includeOperatorData ? { sync: item.sync } : {}),
    ...(includeOperatorData && item.work ? { assignee: item.work.assignee, notes: item.work.notes } : {}) }
}

function write(storage, items) {
  if (!items.every(valid)) throw new Error('Не удалось сохранить событие заказа.')
  storage.setItem(orderProgressKey, JSON.stringify({ version: 1, items }))
}

function replace(storage, item) {
  const items = loadOrderProgress(storage)
  write(storage, [...items.filter(entry => entry.id !== item.id), item])
}

export function advanceOrderProgress(storage, order, type) {
  const items = loadOrderProgress(storage)
  const item = items.find(entry => entry.id === order.id) || initial(order)
  const current = orderWithProgress(order, items)
  const allowed = type === 'sent' ? ['not_started', 'error'].includes(item.sync) :
    type === 'accepted' || type === 'error' ? item.sync === 'pending' :
    type === 'invoice' ? item.sync === 'ready' && !current.invoice :
    type === 'paid' ? current.invoice && !current.paid :
    type === 'agreement' ? current.paid && !current.agreement : false
  if (!allowed) throw new Error('Событие недоступно на текущем этапе заказа.')
  const next = { ...item, events: [...item.events, { type, date: new Date().toISOString() }] }
  if (type === 'sent') next.sync = 'pending'
  else if (type === 'accepted') next.sync = 'ready'
  else if (type === 'error') next.sync = 'error'
  else next[type] = true
  replace(storage, next)
  return orderWithProgress(order, [next], true)
}

export function saveOrderProgressWork(storage, order) {
  const items = loadOrderProgress(storage)
  const item = items.find(entry => entry.id === order.id) || initial(order)
  replace(storage, { ...item, work: { assignee: order.assignee || null, notes: order.notes || [] } })
}

export function clearOrderProgress(storage) { storage.removeItem(orderProgressKey) }
