import { initialState, stages, products, administrator, staffEventLabels, orderDelivery, companyDetails, reviewLabels, reviewedStage, setStage, submitOrder } from './model.mjs?v=order-flow-40'
import { pilotKeyMix, pilotKeyQuantity, pilotTotal } from './catalog.mjs'

export const storageKey = 'iek-digital-prototype:v1'
const text = value => typeof value === 'string'
const bool = value => typeof value === 'boolean'
const integer = value => Number.isSafeInteger(value) && value >= 0
const person = value => value && ['person', 'position', 'email'].every(key => text(value[key])) &&
  (value.phone === undefined || (text(value.phone) && (value.phone === '' || /^[+\d()\s-]{7,30}$/.test(value.phone))))
const company = value => person(value) && text(value.name) && /^(\d{10}|\d{12})$/.test(value.inn) &&
  (value.kpp === undefined || (text(value.kpp) && (value.kpp === '' || /^\d{9}$/.test(value.kpp)))) &&
  (value.legalAddress === undefined || (text(value.legalAddress) && value.legalAddress.length <= 250))
const date = value => text(value) && Number.isFinite(Date.parse(value))
const cart = value => Array.isArray(value) && value.length <= products.length &&
  new Set(value.map(line => line?.id)).size === value.length && value.every(line =>
    line && products.some(item => item.id === line.id) && Number.isInteger(line.quantity) && line.quantity >= 1 && line.quantity <= 99)

// Черновик допускает незавершённые поля; бизнес-валидация остаётся при отправке заказа.
const draftLimits = { customer: 150, project: 150, email: 250, recipient: 250, phone: 30, address: 250 }
const validDraft = value => value === undefined || (value !== null && typeof value === 'object' && !Array.isArray(value) &&
  Object.entries(value).every(([key, item]) => key === 'step' ? Number.isInteger(item) && item >= 1 && item <= 4 : key === 'consent' ? bool(item) :
    Object.hasOwn(draftLimits, key) && text(item) && item.length <= draftLimits[key]))

const companyDraftLimits = { name: 120, inn: 12, kpp: 9, legalAddress: 250, selectedCompanyId: 40, person: 100, position: 100, email: 120, phone: 30 }
const validCompanyDraft = value => value === undefined || (value !== null && typeof value === 'object' && !Array.isArray(value) &&
  Object.entries(value).every(([key, item]) => key === 'step' ? Number.isInteger(item) && item >= 1 && item <= 3 : key === 'authority' ? bool(item) : Object.hasOwn(companyDraftLimits, key) && text(item) && item.length <= companyDraftLimits[key]))

function validCompanyChange(state) {
  const change = state.companyChange
  if (change === undefined || change === null) return true
  if (!state.company || !change || change.inn !== state.company.inn || !person(change.author) || !date(change.date) ||
      !['pending', 'confirmed', 'returned', 'rejected'].includes(change.status) ||
      (change.reason !== undefined && (!text(change.reason) || !change.reason.trim() || change.reason.length > 500)) ||
      (change.previousReason !== undefined && (!text(change.previousReason) || change.previousReason.length > 500)) ||
      (change.status === 'returned' && !change.reason) ||
      (change.status === 'pending' ? change.resolvedAt !== undefined : !date(change.resolvedAt))) return false
  try {
    const details = companyDetails(change.proposed)
    return Object.keys(change.proposed).length === 3 && Object.keys(details).every(key =>
      details[key] === change.proposed[key])
  } catch { return false }
}

function validSubmission(submission, kind) {
  if (submission === undefined) return true
  if (!submission || !submission.values || Array.isArray(submission.values)) return false
  const limits = submission.type === 'user' ? { person: 100, position: 100, email: 120, phone: 30 }
    : submission.type === 'company' ? { inn: 12, name: 120, kpp: 9, legalAddress: 250 }
    : submission.type === 'membership' ? { inn: 12, name: 120 } : null
  if (!limits || (kind === 'user') !== (submission.type === 'user') || Object.keys(submission.values).length !== Object.keys(limits).length) return false
  const values = submission.values
  if (!Object.entries(limits).every(([key, limit]) => text(values[key]) && values[key].length <= limit)) return false
  if (kind === 'user') return person(values) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)
  return /^(\d{10}|\d{12})$/.test(values.inn) && !!values.name.trim() &&
    (submission.type !== 'company' || values.kpp === '' || /^\d{9}$/.test(values.kpp))
}

function validReviews(state) {
  for (const role of ['admin', 'employee']) {
    const checks = state[`${role}Reviews`]
    if (checks === undefined || checks === null) continue
    if (typeof checks !== 'object' || Object.keys(checks).length !== 2) return false
    if (!state.company && (role !== 'admin' || state.stage !== 'identified' || checks.company?.status !== 'pending')) return false
    for (const kind of ['user', 'company']) {
      const check = checks[kind]
      if (!check || !Object.hasOwn(reviewLabels, check.status) || !text(check.reason) || check.reason.length > 1000 ||
          !text(check.response) || check.response.length > 1000 || !Number.isSafeInteger(check.attempt) || check.attempt < 1 ||
          !(check.date === null || date(check.date)) || !validSubmission(check.submission, kind)) return false
      const negative = ['returned', 'rejected'].includes(check.status)
      if (negative ? !check.reason.trim() || !date(check.date) : check.reason !== '') return false
      const previous = check.previousDecision
      if (previous !== null && (!previous || !['returned', 'rejected'].includes(previous.status) ||
          !text(previous.reason) || !previous.reason.trim() || previous.reason.length > 500 || !validSubmission(previous.submission, kind))) return false
      if (check.attempt > 1 && (!previous || !check.response.trim() || !date(check.date))) return false
    }
    const actualStage = state.role === role ? state.stage : role === 'admin' ? state.adminStage : null
    if (actualStage !== null && actualStage !== reviewedStage(state, role)) return false
    if (role === 'employee' && state.employeeVerified !== (checks.user.status === 'confirmed')) return false
  }
  return true
}

function validDelivery(order) {
  if (order.delivery === undefined) return !order.lines.some(line => line.physical)
  if (!order.delivery || typeof order.delivery.method !== 'string') return false
  if (order.delivery.format !== undefined && order.delivery.format !== 2) return false
  // Старые снимки самовывоза читаем без подмены способа или суммы; новые заказы его не принимают.
  if (order.delivery.method === 'pickup') {
    const d = order.delivery
    return d.format === undefined && order.lines.some(line => line.physical) && d.cost === 0 && d.email === '' && d.address === '' &&
      text(d.recipient) && d.recipient.length > 0 && d.recipient.length <= 250 && d.recipient === d.recipient.trim() &&
      text(d.phone) && d.phone === d.phone.trim() && /^[+\d()\s-]{7,30}$/.test(d.phone)
  }
  try {
    const legacy = order.delivery.format === undefined
    // В прежнем смешанном заказе email не записывался: проверяем старый снимок, не дополняем его.
    const lines = legacy && order.delivery.method === 'courier' ? order.lines.filter(line => line.physical) : order.lines
    if (!lines.length) return false
    const expected = orderDelivery(lines, { ...order.delivery, delivery: order.delivery.method }, order.company.email)
    if (legacy) delete expected.format
    return Object.keys(expected).every(key => expected[key] === order.delivery[key])
  } catch { return false }
}

function validState(state) {
  if (state?.verifiedEmails !== undefined && (!Array.isArray(state.verifiedEmails) || !state.verifiedEmails.every(email => text(email) && email.length <= 120 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))) return false
  if (state?.verifiedPhones !== undefined && (!Array.isArray(state.verifiedPhones) || !state.verifiedPhones.every(phone => text(phone) && /^[+\d()\s-]{7,30}$/.test(phone) && /^\d{10,15}$/.test(phone.replace(/\D/g, ''))))) return false
  for (const kind of ['email', 'phone']) {
    const challenge = state?.[`${kind}Challenge`]
    if (challenge != null && (!['admin', 'employee'].includes(challenge.role) || !text(challenge[kind]) ||
      (kind === 'email' ? challenge.email.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(challenge.email) : !/^[+\d()\s-]{7,30}$/.test(challenge.phone) || !/^\d{10,15}$/.test(challenge.phone.replace(/\D/g, ''))) ||
      !Number.isSafeInteger(challenge.expiresAt) || challenge.expiresAt <= 0)) return false
  }
  if (state?.archivedScenarios !== undefined && (!Array.isArray(state.archivedScenarios) || !state.archivedScenarios.every(entry =>
    entry && (entry.signedOut === undefined || entry.signedOut === true) && date(entry.date) && entry.state && entry.state.archivedScenarios === undefined && validState(entry.state)))) return false
  if (state?.verificationRequestId !== undefined && !/^VR-LK-[a-f0-9-]{36}$/.test(state.verificationRequestId)) return false
  if (state?.employeeVerificationRequestId !== undefined && !/^VR-LK-[a-f0-9-]{36}$/.test(state.employeeVerificationRequestId)) return false
  if (state?.claimWinnerId !== undefined && ![state.verificationRequestId, state.employeeVerificationRequestId].includes(state.claimWinnerId)) return false
  if (!state || !Object.hasOwn(stages, state.stage) || !Object.hasOwn(stages, state.adminStage) ||
      !['admin', 'employee'].includes(state.role) || !person(state.employee) ||
      !(state.adminUser === undefined || state.adminUser === null || person(state.adminUser)) ||
      !bool(state.employeeVerified) || !bool(state.companyFound) ||
      !(state.company === null || company(state.company)) ||
      ![state.cart, state.adminCart, state.employeeCart].every(cart) ||
      ![state.adminCheckout, state.employeeCheckout].every(validDraft) ||
      !validCompanyDraft(state.companyDraft) ||
      !['adminSelection', 'employeeSelection'].every(key => state[key] == null ||
        (Object.keys(state[key]).length === 2 && cart([state[key]]))) ||
      !Array.isArray(state.members) || state.members.length > 3 ||
      !state.members.every(member => person(member) && member.role === 'employee') || !validCompanyChange(state) || !validReviews(state)) return false
  if ((state.role === 'employee' || ['pending', 'member', 'verified'].includes(state.stage) ||
      state.joinRequest || state.invitation || state.members.length || state.companyFound) && !state.company) return false
  if (state.adminUser && (state.adminUser.email === state.employee.email || state.members.some(member => member.email === administrator(state).email))) return false
  const request = state.joinRequest
  if (request !== null && (!person(request) || request.id !== 'JOIN-001' ||
      !['pending', 'approved', 'removed', 'rejected'].includes(request.status) || request.inn !== state.company?.inn || !date(request.date))) return false
  const invite = state.invitation
  if (invite !== null && (!invite || invite.id !== 'INVITE-001' || !text(invite.email) ||
      !['pending', 'accepted', 'removed', 'cancelled'].includes(invite.status) || invite.inn !== state.company?.inn || !date(invite.date))) return false
  if (request && invite) return false
  if (state.staffEvents !== undefined && (!Array.isArray(state.staffEvents) || !state.staffEvents.every((event, index) =>
    event && event.id === index + 1 && date(event.date) && Object.hasOwn(staffEventLabels, event.action) &&
    event.actor && text(event.actor.person) && text(event.actor.email) && ['admin', 'employee'].includes(event.actor.role) &&
    event.subject && text(event.subject.person) && text(event.subject.email)))) return false
  if (state.staffEvents?.length && !state.company) return false
  if (state.role === 'employee' && state.stage !== reviewedStage(state, 'employee')) return false
  if (!Array.isArray(state.orders)) return false
  return new Set(state.orders.map(order => order?.id)).size === state.orders.length && state.orders.every(order =>
    /^(DEMO-\d+|SAMPLE-0[1-4])$/.test(order?.id) && validOrderSnapshot(order))
}

export function validOrderSnapshot(order) {
  return order && /^(DEMO-\d+|SAMPLE-0[1-4]|ORD-\d+|ORD-LK-[a-f0-9-]{36})$/.test(order.id) && date(order.date) && company(order.company) && person(order.author) &&
    text(order.customer) && text(order.project) && integer(order.total) &&
    [order.invoice, order.paid, order.agreement].every(bool) && (!order.paid || order.invoice) && (!order.agreement || order.paid) &&
    validOrderLines(order.lines) &&
    validDelivery(order) && order.total === order.lines.reduce((sum, line) => sum + line.total, 0) + (order.delivery?.cost ?? 0)
}

export function validOrderLines(lines) {
  return cart(lines) && lines.length > 0 && lines.every(line =>
      ['name', 'edition', 'sku', 'description'].every(key => text(line[key])) &&
      (products.find(item => item.id === line.id).sourceCatalog === true ? line.sourceCatalog === true : line.sourceCatalog === undefined) &&
      (line.sourceCatalog === true
        ? products.find(item => item.id === line.id).sourceCatalog === true &&
          (line.capacity === null || integer(line.capacity)) && text(line.parameterText) && integer(line.sourcePage)
        : integer(line.capacity)) &&
      ['rrp', 'unit', 'total'].every(key => integer(line[key])) &&
      (line.pilot === true
        ? products.find(item => item.id === line.id).pilot === true &&
          line.virtualized === products.find(item => item.id === line.id).virtualized &&
          line.keyCapacity === products.find(item => item.id === line.id).keyCapacity &&
          line.keyQuantity === pilotKeyQuantity(line, line.quantity) &&
          (line.keySku !== 'AUTO' || JSON.stringify(line.keyMix) === JSON.stringify(pilotKeyMix(line, line.quantity))) &&
          line.unit === line.softwareRrp && line.total === pilotTotal(line, line.quantity)
        : line.pilot === undefined && line.total === line.quantity * line.unit) &&
      (line.physical === undefined ? !products.find(item => item.id === line.id).physical :
        ['physical', 'nomenclatureId', 'productId', 'versionId', 'protection', 'keySku'].every(key => line[key] === products.find(item => item.id === line.id)[key]) &&
        text(line.version) && text(line.protectionName) && integer(line.softwareRrp) && integer(line.keyRrp) && line.rrp === line.softwareRrp + line.keyRrp))
}

export function loadState(storage) {
  const raw = storage.getItem(storageKey)
  if (raw === null) return initialState()
  const snapshot = JSON.parse(raw)
  if (snapshot?.version !== 1 || !validState(snapshot.state)) throw new Error('Не удалось восстановить сохранённое демо: данные повреждены или версия не поддерживается.')
  const state = snapshot.state
  state.verifiedEmails ??= [] // Older saves contain no evidence of email confirmation.
  state.emailChallenge ??= null
  state.verifiedPhones ??= []
  state.phoneChallenge ??= null
  state.adminUser ??= null
  state.staffEvents ??= []
  state.companyChange ??= null
  state.adminReviews ??= null
  state.employeeReviews ??= null
  state.adminSelection ??= null
  state.employeeSelection ??= null
  state.adminCheckout ??= {}
  state.employeeCheckout ??= {}
  state.companyDraft ??= {}
  state.archivedScenarios ??= []
  if (state.role === 'admin' && state.stage === 'identified' && state.company) setStage(state, 'identified')
  // Активная корзина могла быть заменена после заказа; она важнее старой копии в слоте персонажа.
  state[`${state.role}Cart`] = state.cart
  return state
}

export function saveState(storage, state) {
  // shortcut: сценарий рассчитан на одну вкладку; для совместной работы нужен обмен изменениями, а не один снимок.
  storage.setItem(storageKey, JSON.stringify({ version: 1, state }))
}

export function clearState(storage) {
  storage.removeItem(storageKey)
}


export function submitSavedOrder(storage,state,values) {
  const next=structuredClone(state)
  const order=submitOrder(next,values)
  saveState(storage,next)
  Object.assign(state,next)
  return order
}
