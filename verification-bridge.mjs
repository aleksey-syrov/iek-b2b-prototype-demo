import { newRequest, requestFieldLabels } from './operator-verification.mjs?v=order-flow-24'
import { initialState, setStage, demoCompany, switchRole, findJoinCompany, scenarioSnapshot, registerCompanyFromSearch, validateCompanyConnection, reviewedStage, userContact, currentUser, administrator, searchCompanyDirectory, contactsVerified, employeeMember, promoteEmployeeApplicant, queueVerifiedMembership } from './model.mjs?v=order-flow-24'

export const verificationBridgeKey = 'iek-digital-verifications:v1'
const text = (v, n = 1000) => typeof v === 'string' && v.length <= n
const date = v => text(v, 40) && Number.isFinite(Date.parse(v))
const idValid = id => /^VR-LK-[a-f0-9-]{36}$/.test(id)
function valid(item) {
  return item && idValid(item.id) && Number.isSafeInteger(item.revision) && item.revision > 0 &&
    (item.approvalOrder === undefined || Number.isSafeInteger(item.approvalOrder) && item.approvalOrder > 0) &&
    (item.automated === undefined || item.automated === true && item.decision === 'approved' && item.approvalOrder === undefined) &&
    ['emailVerified', 'phoneVerified'].every(key => item[key] === undefined || typeof item[key] === 'boolean') &&
    date(item.date) && ['company','person','email','phone','inn','address','kpp','position','site','code','time'].every(key => text(item[key], 250)) &&
    /^(\d{10}|\d{12})$/.test(item.inn) && text(item.company,120) && item.company.trim() && text(item.person,100) && item.person.trim() && text(item.position,100) && item.position.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item.email) && text(item.email,120) && /^[+\d()\s-]{7,30}$/.test(item.phone) && (item.kpp === '' || /^\d{9}$/.test(item.kpp)) && typeof item.companyExists === 'boolean' &&
    (item.assignee === null || text(item.assignee, 100)) && Array.isArray(item.notes) && item.notes.every(n => n && text(n.text) && text(n.author,100) && date(n.date)) &&
    ['pending','approved','returned','rejected'].includes(item.decision) && text(item.comment) &&
    (!['returned','rejected'].includes(item.decision) || item.comment.trim()) && item.sync && Object.keys(item.sync).length === 2 &&
    ['company','contact'].every(key => (item.decision === 'approved' ? ['pending','ready','error'] : ['not_started']).includes(item.sync[key])) &&
    Array.isArray(item.history) && item.history.every(e => e && text(e.title,300) && text(e.note) && date(e.date) &&
      (e.changes === undefined || (Array.isArray(e.changes) && e.changes.length <= Object.keys(requestFieldLabels).length &&
        e.changes.every(c => c && Object.hasOwn(requestFieldLabels,c.field) && text(c.before,250) && text(c.after,250)) &&
        new Set(e.changes.map(c => c.field)).size === e.changes.length)))
}
export function loadLinkedRequests(storage) {
  const raw = storage.getItem(verificationBridgeKey)
  if (raw === null) return []
  const saved = JSON.parse(raw)
  if (saved?.version !== 1 || !Array.isArray(saved.requests) || !saved.requests.every(valid) || new Set(saved.requests.map(r => r.id)).size !== saved.requests.length) throw new Error('Общие заявки недоступны или повреждены. Данные не перезаписаны.')
  return saved.requests
}
// shortcut: local read/modify/write demo; use server transactions for concurrent multi-user work.
function write(storage, requests) {
  if (!requests.every(valid)) throw new Error('Некорректные данные общей заявки')
  storage.setItem(verificationBridgeKey, JSON.stringify({version:1, requests}))
}
function startAutomaticContact(item) {
  return { ...item, revision:item.revision + 1, automated:true, decision:'approved',
    sync:{company:'pending', contact:'pending'}, history:[...item.history, {
      title:'Сервис отправил контактное лицо и связь с компанией в 1С',
      note:'Решение о присоединении примет администратор компании.', date:new Date().toISOString()
    }] }
}
export function submitLinkedCompany(storage, state, uuid = crypto.randomUUID()) {
  const existing = loadLinkedRequests(storage)
  const previous = existing.find(r => r.id === state.verificationRequestId)
  if (previous && !['returned','rejected'].includes(previous.decision)) throw new Error('Заявка уже отправлена. Дождитесь решения оператора.')
  const candidate = structuredClone(state)
  // Reuse wizard validation without replacing the current company before approval of corrected data.
  const registering = { ...candidate, stage:'identified', adminReviews:null }
  const values = validateCompanyConnection(registering, 3)
  if (previous && previous.inn !== values.inn) throw new Error('Для исправления заявки сохраните исходный ИНН компании')
  if ([state.employee, ...state.members].some(person => person.email.toLowerCase() === values.email.toLowerCase())) throw new Error('Этот email уже принадлежит другому пользователю')
  registerCompanyFromSearch(registering, values)
  const directoryCompany = searchCompanyDirectory(values.inn).find(company => company.inn === values.inn)
  const now = new Date().toISOString()
  const item = { ...newRequest(directoryCompany?.companyExists === true), id: previous?.id || `VR-LK-${uuid}`, revision: (previous?.revision || 0) + 1,
    company: registering.company.name, person: values.person, email: values.email, phone: values.phone, position: values.position, emailVerified: true, phoneVerified: true,
    inn: values.inn, kpp: values.kpp, address: values.legalAddress, site:'Не указан', code:directoryCompany?.code || 'Демо · подтверждение 1С',
    date: previous?.date || now, time: new Date(now).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'}),
    assignee: previous?.assignee || null, notes: previous?.notes || [],
    history: [...(previous?.history || [])] }
  const changes = previous ? Object.keys(requestFieldLabels).filter(field => previous[field] !== item[field]).map(field => ({field,before:previous[field],after:item[field]})) : null
  item.history.push({title:previous ? 'Заявитель отправил исправленные сведения' : 'Заявка получена из личного кабинета',note:'Компания и представитель · визард подключения',date:now,...(previous ? {changes} : {})})
  write(storage, [...existing.filter(r => r.id !== item.id), item])
  if (!state.company) Object.assign(state, registering)
  else state.adminUser = { ...userContact(currentUser(state)), person: values.person }
  state.companyDraft = {}
  state.verificationRequestId = item.id
  applyLinkedRequest(state, item)
  return item
}
export function submitLinkedEmployee(storage, state, uuid = crypto.randomUUID()) {
  if (state.role !== 'employee' || !state.companyFound || !state.company || employeeMember(state) || !state.employee.person.trim() || !state.employee.position.trim() || !contactsVerified(state))
    throw new Error('Найдите компанию, заполните ФИО и должность и подтвердите оба контакта IEK ID')
  const existing = loadLinkedRequests(storage)
  const previous = existing.find(r => r.id === state.employeeVerificationRequestId)
  if (previous && !['returned', 'rejected'].includes(previous.decision)) throw new Error('Заявка уже отправлена. Дождитесь решения оператора.')
  if (previous && previous.inn !== state.company.inn) throw new Error('Для исправления заявки сохраните исходный ИНН компании')
  if (state.employee.email.toLowerCase() === administrator(state).email.toLowerCase()) throw new Error('Контакт уже принадлежит другому заявителю')
  const directoryCompany = searchCompanyDirectory(state.company.inn).find(company => company.inn === state.company.inn)
  const hasAdmin = state.claimWinnerId || state.adminStage === 'verified' || existing.some(request => request.inn === state.company.inn && request.decision === 'approved' && !request.automated && request.approvalOrder)
  const now = new Date().toISOString()
  let item = { ...newRequest(directoryCompany?.companyExists === true), id: previous?.id || `VR-LK-${uuid}`, revision:(previous?.revision || 0) + 1,
    company:state.company.name, person:state.employee.person, email:state.employee.email, phone:state.employee.phone, position:state.employee.position,
    emailVerified:true, phoneVerified:true, inn:state.company.inn, kpp:state.company.kpp || '', address:state.company.legalAddress || '',
    site:'Не указан', code:directoryCompany?.code || 'Демо · подтверждение 1С', date:previous?.date || now,
    time:new Date(now).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'}), assignee:previous?.assignee || null, notes:previous?.notes || [],
    history:[...(previous?.history || []), { title:previous ? 'Заявитель повторно отправил сведения' : 'Заявка второго пользователя получена из личного кабинета', note:hasAdmin ? 'Автоматическая проверка перед решением администратора компании' : 'Проверка оператора перед присоединением к компании', date:now }] }
  if (hasAdmin)
    item = { ...startAutomaticContact(item), revision:item.revision }
  write(storage, [...existing.filter(r => r.id !== item.id), item])
  state.employeeVerificationRequestId = item.id
  applyLinkedRequest(state, item)
  return item
}
export function updateLinkedRequest(storage, next) {
  const requests = loadLinkedRequests(storage), current = requests.find(r => r.id === next.id)
  if (!current || current.revision !== next.revision) throw new Error('Заявка изменилась в другой вкладке. Обновите карточку и повторите действие.')
  const approvalOrder = current.decision === 'pending' && next.decision === 'approved'
    ? Math.max(0, ...requests.map(request => request.approvalOrder || 0)) + 1 : current.approvalOrder
  const updated = { ...next, revision:current.revision + 1, ...(approvalOrder ? {approvalOrder} : {}) }
  const automatic = current.decision === 'pending' && updated.decision === 'approved' && !updated.automated
  write(storage, requests.map(r => r.id === updated.id ? updated : automatic && r.id.startsWith('VR-LK-') && r.inn === updated.inn && r.decision === 'pending' ? startAutomaticContact(r) : r))
  return updated
}
export function clearLinkedRequests(storage) { storage.removeItem(verificationBridgeKey) }

export function buildTwoApplicantDemo(storage, previousState, ids = [crypto.randomUUID(), crypto.randomUUID()]) {
  const inn = String(1000000000 + Math.floor(Math.random() * 9000000000))
  let raw = storage.getItem(verificationBridgeKey)
  const draftStorage = { getItem: () => raw, setItem: (_, value) => { raw = value } }
  loadLinkedRequests(draftStorage)
  const next = initialState()
  next.archivedScenarios = [...(previousState.archivedScenarios || [])]
  if (previousState.stage !== 'guest' || previousState.company || previousState.orders.length || previousState.cart.length)
    next.archivedScenarios.push(scenarioSnapshot(previousState))
  setStage(next, 'identified')
  next.companyDraft = { ...demoCompany, inn, authority: true, step: 3 }
  const first = submitLinkedCompany(draftStorage, next, ids[0])
  switchRole(next, 'employee')
  findJoinCompany(next, inn)
  const second = submitLinkedEmployee(draftStorage, next, ids[1])
  switchRole(next, 'admin')
  return { state: next, requests: loadLinkedRequests(draftStorage), applicants: [first, second] }
}

export function applyLinkedRequest(state, item) {
  if (state.employeeVerificationRequestId && item?.id === state.employeeVerificationRequestId) {
    const previous = JSON.stringify([state.employeeReviews, state.employeeVerified, state.stage])
    const negative = ['returned', 'rejected'].includes(item.decision)
    const contact = {person:item.person,position:item.position,email:item.email,phone:item.phone}
    const confirmed = item.decision === 'approved' && item.sync.contact === 'ready'
    const companyStatus = employeeMember(state) ? 'confirmed' : 'pending'
    state.employeeReviews = {
      user:{status:negative ? item.decision : confirmed ? 'confirmed' : 'pending',reason:negative ? item.comment : '',response:'',attempt:1,date:item.history.at(-1)?.date || null,previousDecision:null,submission:{type:'user',values:contact}},
      company:{status:companyStatus,reason:'',response:'',attempt:1,date:item.history.at(-1)?.date || null,previousDecision:null,submission:{type:'membership',values:{inn:item.inn,name:item.company}}}
    }
    state.employeeVerified = confirmed
    if (state.role === 'employee') state.stage = reviewedStage(state,'employee')
    return previous !== JSON.stringify([state.employeeReviews, state.employeeVerified, state.stage])
  }
  if (!state.verificationRequestId || !state.company || (item && item.id !== state.verificationRequestId)) return false
  const previousReviews = state.adminReviews
  const before = JSON.stringify([state.adminReviews,state.stage,state.adminStage,state.company,state.adminUser])
  const contact = item ? {person:item.person,position:item.position,email:item.email,phone:item.phone} : userContact(state.adminUser || state.company)
  const company = item ? {inn:item.inn,name:item.company,kpp:item.kpp,legalAddress:item.address} : {inn:state.company.inn,name:state.company.name,kpp:state.company.kpp || '',legalAddress:state.company.legalAddress || ''}
  const negative = item && ['returned','rejected'].includes(item.decision)
  state.adminReviews = Object.fromEntries(['user','company'].map(kind => [kind, {
    status: negative ? item.decision : item?.decision === 'approved' && item.sync[kind === 'user' ? 'contact' : 'company'] === 'ready' ? 'confirmed' : 'pending',
    reason:negative ? item.comment : '', response:'',attempt:1,date:item?.history.at(-1)?.date || null, previousDecision:null,
    submission:{type:kind,values:kind === 'user' ? contact : company}
  }]))
  const newlyConfirmed = kind => state.adminReviews[kind].status === 'confirmed' && (previousReviews?.[kind]?.status !== 'confirmed' || JSON.stringify(previousReviews[kind].submission) !== JSON.stringify(state.adminReviews[kind].submission))
  if (newlyConfirmed('company')) Object.assign(state.company,company)
  if (newlyConfirmed('user')) state.adminUser = { ...contact, person: state.adminUser?.person || contact.person }
  if (state.role === 'admin' && state.stage !== 'guest') state.stage = reviewedStage(state,'admin')
  state.adminStage = state.adminReviews.user.status === 'confirmed' && state.adminReviews.company.status === 'confirmed' ? 'verified' : state.adminReviews.user.status === 'confirmed' ? 'member' : 'pending'
  return before !== JSON.stringify([state.adminReviews,state.stage,state.adminStage,state.company,state.adminUser])
}

export function reconcileLinkedApplicants(state, requests) {
  const find = id => requests.find(request => request.id === id)
  const candidates = [find(state.verificationRequestId), find(state.employeeVerificationRequestId)].filter(Boolean)
  const approved = candidates.filter(request => request.decision === 'approved' && !request.automated && request.inn === state.company?.inn)
  approved.sort((a,b) => (a.approvalOrder || 0) - (b.approvalOrder || 0) || a.id.localeCompare(b.id))
  const existingAdmin = !state.verificationRequestId && state.adminStage === 'verified'
  const claimed = approved.find(request => request.id === state.claimWinnerId)
  if (state.claimWinnerId && !claimed && approved[0]) {
    state.claimWinnerId = null
    if (state.joinRequest?.status === 'pending' && state.joinRequest.email === approved[0].email) state.joinRequest = null
  }
  const winner = existingAdmin ? null : claimed || approved[0]
  if (winner && !state.claimWinnerId) {
    if (winner.id === state.employeeVerificationRequestId) promoteEmployeeApplicant(state)
    state.claimWinnerId = winner.id
  }
  const adminRequest = find(state.verificationRequestId)
  const employeeRequest = find(state.employeeVerificationRequestId)
  if (adminRequest) applyLinkedRequest(state, adminRequest)
  if (employeeRequest) {
    if ((state.claimWinnerId || existingAdmin) && employeeRequest.decision === 'approved') queueVerifiedMembership(state)
    applyLinkedRequest(state, employeeRequest)
  }
  return adminRequest || null
}
