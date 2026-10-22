import { validOrderSnapshot, validOrderLines, loadState, saveState } from './storage.mjs?v=order-flow-24'
import { addInternalNote, currentOperator } from './operator-workflow.mjs'
import { cartLines, total, currentUser, contactVerified, canPurchase, switchRole, clearPurchasedCart, products, initialState, orderDelivery, needsProject, searchCompanyDirectory, verifyCompanyFromPaidInquiry } from './model.mjs?v=order-flow-24'
import { loadOrderProgress, orderWithProgress } from './order-progress.mjs'

export const purchaseInquiryKey = 'iek-digital-purchase-inquiries:v1'
export const inquiryStatusLabels = { new:'Новая', working:'В работе', done:'Обработана' }
const text = (value, max) => typeof value === 'string' && value.length <= max
const amount = value => Number.isSafeInteger(value) && value >= 0
const validId = id => /^PI-[a-f0-9-]{36}$/.test(id)
const validContact = contact => contact && ['email','phone'].includes(contact.kind) && text(contact.value,120) &&
  (contact.kind === 'email' ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.value) : /^[+\d()\s-]{7,30}$/.test(contact.value))

export function inquiryContact(state) {
  if (state.stage === 'guest') throw new Error('Сначала войдите через IEK ID')
  const kind = ['email','phone'].find(kind => contactVerified(state,kind))
  if (!kind) throw new Error('Подтвердите почту или телефон в личном профиле')
  return {kind,value:currentUser(state)[kind]}
}

function valid(item) {
  return item && validId(item.id) && text(item.date,40) && Number.isFinite(Date.parse(item.date)) &&
    Object.hasOwn(inquiryStatusLabels,item.status) && text(item.person,100) && validContact(item.contact) &&
    (item.notes === undefined || (Array.isArray(item.notes) && item.notes.every(note => note && text(note.text,1000) && note.text.trim() && text(note.author,100) && note.author.trim() && text(note.date,40) && Number.isFinite(Date.parse(note.date))))) &&
    (item.orderLinks === undefined || (Array.isArray(item.orderLinks) && item.orderLinks.every(link=>validOrderLink(link) && (!link.relationshipApproval || link.createdFromInquiry)) && new Set(item.orderLinks.map(link=>link.order.id)).size === item.orderLinks.length)) &&
    (item.sourceLines === undefined || (validOrderLines(item.sourceLines) && item.sourceLines.length === item.lines.length && item.sourceLines.every((line,index)=>['sku','keySku','quantity','unit','total','keyQuantity','virtualized'].every(key=>(line[key] ?? '') === (item.lines[index][key] ?? ''))))) &&
    text(item.comment,2000) && text(item.assignee,100) && amount(item.total) && Array.isArray(item.lines) && item.lines.length > 0 &&
    item.lines.every((line,index) => line && ['name','variant','sku','keySku','protection'].every(key => text(line[key],1000)) &&
      Number.isInteger(line.quantity) && line.quantity > 0 && line.quantity <= 99 && amount(line.unit) && amount(line.total) &&
      (line.keyQuantity === undefined || Number.isInteger(line.keyQuantity) && line.keyQuantity > 0) &&
      (line.virtualized === undefined || typeof line.virtualized === 'boolean') &&
      (line.total === line.unit * line.quantity || item.sourceLines?.[index]?.pilot === true && line.total === item.sourceLines[index].total)) &&
    item.total === item.lines.reduce((sum,line)=>sum+line.total,0)
}

export function loadPurchaseInquiries(storage) {
  const raw=storage.getItem(purchaseInquiryKey)
  if (raw === null) return []
  let saved
  try { saved=JSON.parse(raw) } catch { throw new Error('Не удалось прочитать заявки на покупку. Сохранение не изменено.') }
  if (saved?.version !== 1 || !Array.isArray(saved.items) || !saved.items.every(valid) || new Set(saved.items.map(item=>item.id)).size !== saved.items.length)
    throw new Error('Заявки на покупку повреждены. Сохранение не изменено.')
  const orderIds=saved.items.flatMap(item=>(item.orderLinks || []).map(link=>link.order.id))
  if (new Set(orderIds).size !== orderIds.length) throw new Error('Заказ связан с несколькими заявками. Сохранение не изменено.')
  return saved.items.map(item=>item.orderLinks?.some(link=>link.createdFromInquiry) ? {...item,status:'done'} : item)
}

function write(storage,items) {
  if (!items.every(valid)) throw new Error('Проверьте данные заявки')
  storage.setItem(purchaseInquiryKey,JSON.stringify({version:1,items}))
}

// shortcut: локальное демо сопоставляет автора по контакту; при подключении сервера использовать subject IEK ID из сессии.
export function ownPurchaseInquiries(storage,state) {
  if (state.stage === 'guest') return []
  const user=currentUser(state)
  const progress=loadOrderProgress(storage)
  return loadPurchaseInquiries(storage).filter(item=>contactVerified(state,item.contact.kind) && user[item.contact.kind] === item.contact.value).map(({notes, sourceLines, orderLinks, ...item}) => ({...item, ...(orderLinks?.length ? {hasLinkedOrders:true, orders:orderLinks.filter(link=>canAccessInquiryOrder(state,link.order)).map(link=>orderWithProgress(publicOrder(link.order),progress))} : {})}))
}

// shortcut: демо ищет пользователя по подтверждённому контакту; серверу нужен неизменяемый subject IEK ID.
export function currentInquiryBuyer(storage,item) {
  const saved=loadState(storage)
  const matches=['admin','employee'].flatMap(role=>{
    const profile=saved.role === role ? saved : structuredClone(saved)
    if (profile.role !== role) switchRole(profile,role)
    const user=currentUser(profile)
    return profile.stage !== 'guest' && contactVerified(profile,item.contact.kind) && user[item.contact.kind] === item.contact.value
      ? [{person:user.person,position:user.position,email:user.email,phone:user.phone,company:saved.company,canPurchase:!!saved.company && canPurchase(profile)}] : []
  })
  return matches.length === 1 ? matches[0] : null
}

function inquiryLines(state) {
  return cartLines(state).map(line=>({name:`${line.name} ${line.edition || ''}`.trim(),variant:String(line.parameterText || line.version || ''),sku:line.sku || '',keySku:line.keySku || '',protection:line.protectionName || '',quantity:line.quantity,unit:line.unit,total:line.total,
    ...(line.pilot ? { keyQuantity: line.keyQuantity, virtualized: line.virtualized } : {})}))
}

function basketKey(lines) {
  return JSON.stringify(lines.map(line=>JSON.stringify([line.sku,line.keySku,line.virtualized,line.variant,line.protection,line.quantity])).sort())
}

export function findCartInquiry(storage,state) {
  if (!state.cart.length || state.stage === 'guest') return null
  const key=basketKey(inquiryLines(state))
  return ownPurchaseInquiries(storage,state).reverse().find(item=>basketKey(item.lines) === key) || null
}

export function submitPurchaseInquiry(storage,state,comment='',id=`PI-${crypto.randomUUID()}`) {
  const contact=inquiryContact(state)
  if (!validId(id) || !text(comment,2000)) throw new Error('Проверьте данные заявки')
  const items=loadPurchaseInquiries(storage), previous=items.find(item=>item.id === id)
  if (previous) {
    const own=ownPurchaseInquiries(storage,state).find(item=>item.id === id)
    if (!own) throw new Error('Заявка недоступна')
    return own
  }
  if (!state.cart.length) throw new Error('Добавьте товары в корзину')
  const existing=findCartInquiry(storage,state)
  if (existing) return existing
  const lines=inquiryLines(state)
  const item={id,date:new Date().toISOString(),status:'new',assignee:'',person:currentUser(state).person || '',contact,comment:comment.trim(),total:total(lines),
    lines,sourceLines:cartLines(state)}
  write(storage,[...items,item])
  return ownPurchaseInquiries(storage,state).find(entry=>entry.id === id)
}

export function updatePurchaseInquiry(storage,id,status,operator) {
  const items=loadPurchaseInquiries(storage), item=items.find(item=>item.id === id)
  if (!item || !text(operator,100) || !operator.trim() || !((item.status === 'new' && status === 'working') || (item.status === 'working' && status === 'done')))
    throw new Error('Заявка изменилась. Обновите страницу.')
  const updated={...item,status,assignee:item.assignee || operator}
  write(storage,items.map(entry=>entry.id === id ? updated : entry))
  return updated
}

export function assignPurchaseInquiry(storage,id,assignee) {
  const items=loadPurchaseInquiries(storage), item=items.find(item=>item.id === id)
  if (!item) throw new Error('Заявка не найдена. Обновите страницу.')
  if (!text(assignee,100)) throw new Error('Выберите ответственного.')
  const updated={...item,assignee:assignee.trim()}
  write(storage,items.map(entry=>entry.id === id ? updated : entry))
  return updated
}

// shortcut: заметки хранятся в общем localStorage демо; в рабочей системе выдавать их только через API оператора.
export function addPurchaseInquiryNote(storage,id,value) {
  const items=loadPurchaseInquiries(storage), item=items.find(item=>item.id === id)
  if (!item) throw new Error('Заявка не найдена. Обновите страницу.')
  if (typeof value !== 'string') throw new Error('Введите заметку.')
  const updated=addInternalNote(item,value)
  write(storage,items.map(entry=>entry.id === id ? updated : entry))
  return updated
}

export function clearPurchaseInquiries(storage) { storage.removeItem(purchaseInquiryKey) }


function billingCompany(value) {
  if (!value || !text(value.name,120) || !value.name.trim() || !text(value.inn,12) || !/^(\d{10}|\d{12})$/.test(value.inn) ||
    !text(value.kpp,9) || (value.inn.length === 10 ? !/^\d{9}$/.test(value.kpp) : value.kpp !== '' && !/^\d{9}$/.test(value.kpp)) ||
    !text(value.legalAddress,250) || !value.legalAddress.trim()) throw new Error('Для счёта заполните название, ИНН, КПП (для юрлица) и юридический адрес покупателя.')
  return value
}

function validOrderLink(link) {
  try {
    return !!link && (link.createdFromInquiry === undefined || typeof link.createdFromInquiry === 'boolean') &&
      (link.relationshipApproval === undefined || (link.relationshipApproval && (link.relationshipApproval.source === undefined || link.relationshipApproval.source === 'verifiedProfile') && text(link.relationshipApproval.author,100) && !!link.relationshipApproval.author.trim() && text(link.relationshipApproval.basis,500) && link.relationshipApproval.basis.trim().length >= 10 && text(link.relationshipApproval.date,40) && Number.isFinite(Date.parse(link.relationshipApproval.date)))) &&
      (link.work === undefined || (link.work && (link.work.assignee === null || text(link.work.assignee,100)) && Array.isArray(link.work.notes) && link.work.notes.every(note=>note && text(note.text,1000) && note.text.trim() && text(note.author,100) && text(note.date,40) && Number.isFinite(Date.parse(note.date))))) && validOrderSnapshot(link.order) && !!billingCompany(link.order.company) &&
      (link.createdFromInquiry && link.counterpartyCode === undefined || text(link.counterpartyCode,100) && !!link.counterpartyCode.trim()) && text(link.author,100) && !!link.author.trim() &&
      text(link.date,40) && Number.isFinite(Date.parse(link.date))
  } catch { return false }
}

function publicOrder(order) {
  return Object.fromEntries(['id','date','company','author','lines','total','delivery','customer','project','invoice','paid','agreement','demoSample'].filter(key=>order[key] !== undefined).map(key=>[key,structuredClone(order[key])]))
}

export function canAccessInquiryOrder(state,order) {
  return canPurchase(state) && !!state.company && state.company.inn === order.company.inn
}

export function companyPurchaseOrders(storage,state) {
  if (!canPurchase(state)) return []
  const linked=loadPurchaseInquiries(storage).flatMap(item=>(item.orderLinks || []).map(link=>link.order)).filter(order=>canAccessInquiryOrder(state,order)).map(publicOrder)
  const progress=loadOrderProgress(storage)
  return [...new Map([...linked,...state.orders.filter(order=>canAccessInquiryOrder(state,order))].map(order=>[order.id,orderWithProgress(order,progress)])).values()]
}

export function purchaseInquiryForOrder(storage,orderId) {
  return loadPurchaseInquiries(storage).find(item=>item.orderLinks?.some(link=>link.order.id === orderId)) || null
}

// shortcut: связанный заказ — снимок локального демо; при интеграции читать актуальный заказ и права из API.
export function linkPurchaseInquiry(storage,id,order,values) {
  const items=loadPurchaseInquiries(storage),item=items.find(item=>item.id === id)
  if (!item) throw new Error('Заявка не найдена. Обновите страницу.')
  if (!order || !/^ORD-\d+$/.test(order.id)) throw new Error('Выберите существующий заказ оператора.')
  const existing=items.find(entry=>entry.orderLinks?.some(link=>link.order.id === order.id))
  if (existing) {
    if (existing.id === id) return existing
    throw new Error('Этот заказ уже связан с другой заявкой.')
  }
  if (values.confirmed !== true) throw new Error('Подтвердите компанию-покупателя и состав заказа.')
  const company={...order.company,position:order.company.position || ''}
  for (const key of ['name','inn','kpp','legalAddress']) {
    if (!text(values[key],key === 'legalAddress' ? 250 : key === 'name' ? 120 : key === 'inn' ? 12 : 9)) throw new Error('Проверьте реквизиты покупателя.')
    const value=values[key].trim()
    if (company[key]?.trim() && value !== company[key]) throw new Error('Нельзя менять реквизиты существующего заказа при привязке.')
    if (order.invoice && value !== (company[key] || '')) throw new Error('Счёт уже опубликован. Сначала уточните реквизиты в заказе.')
    company[key]=value
  }
  billingCompany(company)
  if (!text(values.counterpartyCode,100) || !values.counterpartyCode.trim()) throw new Error('Укажите код контрагента в 1С.')
  const link={order:publicOrder({...order,company}),counterpartyCode:values.counterpartyCode.trim(),author:currentOperator,date:new Date().toISOString()}
  if (!validOrderLink(link)) throw new Error('Проверьте заказ и код контрагента в 1С.')
  const updated={...item,orderLinks:[...(item.orderLinks || []),link]}
  write(storage,items.map(entry=>entry.id === id ? updated : entry))
  return updated
}


export function submitPurchaseInquiryAndClearCart(storage,state,comment,id) {
  const item=submitPurchaseInquiry(storage,state,comment,id)
  if (state.cart.length && basketKey(inquiryLines(state)) !== basketKey(item.lines)) throw new Error('Состав корзины изменился. Заявка уже сохранена; новые товары оставлены в корзине.')
  const next=structuredClone(state)
  clearPurchasedCart(next)
  try { saveState(storage,next) }
  catch { throw new Error('Заявка сохранена, но очистить корзину не удалось. Повторите отправку: дубликат не создастся.') }
  Object.assign(state,next)
  return item
}

export function inquiryOrderLines(item) {
  if (item.sourceLines) return structuredClone(item.sourceLines)
  // shortcut: старые заявки не содержат полного снимка; сопоставляем точный артикул и ключ до миграции на API.
  return item.lines.map(line=>{
    const matches=products.filter(product=>product.sku === line.sku && (product.keySku || '') === line.keySku)
    if (matches.length !== 1) throw new Error(`Не удалось однозначно найти комплектацию ${line.sku}. Привяжите подготовленный заказ.`)
    const [snapshot]=cartLines({...initialState(),cart:[{id:matches[0].id,quantity:line.quantity}]})
    return {...snapshot,name:line.name,edition:'',version:line.variant,protectionName:line.protection,unit:line.unit,total:line.total}
  })
}

export function createOrderFromInquiry(storage,id,values) {
  const items=loadPurchaseInquiries(storage),item=items.find(item=>item.id === id)
  if (!item) throw new Error('Заявка не найдена. Обновите страницу.')
  const previous=item.orderLinks?.find(link=>link.createdFromInquiry)
  if (previous) return previous.order
  const read=(key,max=120)=>{
    if (!text(values[key] ?? '',max)) throw new Error('Проверьте длину заполненных полей.')
    return (values[key] || '').trim()
  }
  const buyer=currentInquiryBuyer(storage,item)
  const author={person:read('person',100),position:buyer?.canPurchase ? buyer.position : '',email:read('contactEmail'),phone:read('contactPhone',30)}
  if (!author.person) throw new Error('Укажите имя контактного лица.')
  if (author[item.contact.kind] !== item.contact.value) throw new Error('Контакт заявителя должен сохраниться в заказе.')
  if (author.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(author.email)) throw new Error('Проверьте почту контактного лица.')
  if (author.phone && !/^[+\d()\s-]{7,30}$/.test(author.phone)) throw new Error('Проверьте телефон контактного лица.')
  const inn=read('inn',12), verifiedCompany=buyer?.canPurchase ? buyer.company : null
  if (verifiedCompany && (inn !== verifiedCompany.inn || read('name') !== verifiedCompany.name || read('kpp',9) !== (verifiedCompany.kpp || '') || read('legalAddress',250) !== (verifiedCompany.legalAddress || '') || ['person','email','phone'].some(key=>author[key] !== buyer[key])))
    throw new Error('Данные заявителя или компании изменились. Обновите карточку заявки.')
  const selectedId=read('selectedCompanyId')
  const matches=verifiedCompany ? [] : searchCompanyDirectory(inn)
  const selected=matches.find(company=>company.id === selectedId && company.inn === inn)
  if (!verifiedCompany && (selectedId || matches.length) && !selected) throw new Error('Выберите компанию из результатов поиска по ИНН.')
  const details=verifiedCompany || selected
  const company=billingCompany({...author,...(details ? {name:details.name,inn:details.inn,kpp:details.kpp,legalAddress:details.legalAddress} : {name:read('name'),inn,kpp:read('kpp',9),legalAddress:read('legalAddress',250)})})
  const lines=inquiryOrderLines(item)
  const delivery=orderDelivery(lines,{delivery:values.delivery,email:read('deliveryEmail',250),recipient:read('recipient',250),phone:read('deliveryPhone',30),address:read('address',250)},author.email)
  const customer=read('customer',150),project=read('project',150)
  if (needsProject(total(lines)) && (!customer || !project)) throw new Error('От 800 000 ₽ укажите проект и конечного заказчика.')
  if (values.confirmed !== true) throw new Error('Подтвердите реквизиты и состав заказа.')
  const order={id:`ORD-LK-${crypto.randomUUID()}`,date:new Date().toISOString(),company,author,lines,total:total(lines)+delivery.cost,delivery,customer,project,invoice:false,paid:false,agreement:false}
  const link={order,author:currentOperator,date:order.date,createdFromInquiry:true,work:{assignee:item.assignee || currentOperator,notes:[]},...(verifiedCompany ? {relationshipApproval:{source:'verifiedProfile',author:'Проверка в ЛК',basis:'Компания и представитель уже подтверждены в личном кабинете на момент создания заказа.',date:order.date}} : {})}
  if (!validOrderLink(link)) throw new Error('Не удалось подготовить заказ. Проверьте состав и реквизиты.')
  write(storage,items.map(entry=>entry.id === id ? {...item,status:'done',orderLinks:[...(item.orderLinks || []),link]} : entry))
  return order
}

export function createdInquiryOrders(storage) {
  return loadPurchaseInquiries(storage).flatMap(item=>(item.orderLinks || []).filter(link=>link.createdFromInquiry).map(link=>({...publicOrder(link.order),assignee:link.work?.assignee || null,notes:link.work?.notes || []})))
}

export function approveInquiryOrderRelationship(storage, orderId, basis) {
  const items=loadPurchaseInquiries(storage)
  const item=items.find(entry=>entry.orderLinks?.some(link=>link.createdFromInquiry && link.order.id === orderId))
  if (!item) throw new Error('Заказ, созданный из заявки, не найден.')
  const link=item.orderLinks.find(link=>link.order.id === orderId)
  if (link.relationshipApproval) return link.relationshipApproval
  if (!text(basis,500) || basis.trim().length < 10) throw new Error('Укажите основание проверки: не менее 10 символов.')
  const approval={author:currentOperator,basis:basis.trim(),date:new Date().toISOString()}
  const updated={...item,orderLinks:item.orderLinks.map(entry=>entry.order.id === orderId ? {...entry,relationshipApproval:approval} : entry)}
  write(storage,items.map(entry=>entry.id === item.id ? updated : entry))
  return approval
}

// shortcut: демо сопоставляет IEK ID по подтверждённому контакту; в рабочей системе нужен неизменяемый subject и серверное решение.
export function activatePaidInquiryCompany(storage,state) {
  if (state.role !== 'admin' || state.stage !== 'identified' || state.company || state.verificationRequestId || state.joinRequest || state.invitation) return null
  const user=currentUser(state)
  if (!user.person.trim() || !['email','phone'].every(kind=>contactVerified(state,kind))) return null
  const progress=loadOrderProgress(storage)
  const eligible=loadPurchaseInquiries(storage).filter(item=>contactVerified(state,item.contact.kind) && user[item.contact.kind] === item.contact.value)
    .flatMap(item=>(item.orderLinks || []).filter(link=>link.createdFromInquiry && link.relationshipApproval && orderWithProgress(link.order,progress).paid).map(link=>link.order))
  if (!eligible.length || !eligible.every(order=>['inn','name','kpp','legalAddress'].every(key=>order.company[key] === eligible[0].company[key]))) return null
  const next=structuredClone(state)
  verifyCompanyFromPaidInquiry(next,eligible[0].company)
  saveState(storage,next)
  Object.assign(state,next)
  return eligible[0]
}

export function updateInquiryOrderWork(storage,order) {
  const items=loadPurchaseInquiries(storage)
  const item=items.find(item=>item.orderLinks?.some(link=>link.createdFromInquiry && link.order.id === order.id))
  if (!item) throw new Error('Заказ не найден. Обновите страницу.')
  const updated={...item,orderLinks:item.orderLinks.map(link=>link.order.id === order.id ? {...link,work:{assignee:order.assignee,notes:order.notes}} : link)}
  write(storage,items.map(entry=>entry.id === item.id ? updated : entry))
}
