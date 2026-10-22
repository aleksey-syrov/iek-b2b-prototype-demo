import { purchaseInquiryKey, inquiryStatusLabels, inquiryContact, findCartInquiry, ownPurchaseInquiries, submitPurchaseInquiry, submitPurchaseInquiryAndClearCart, clearPurchaseInquiries, companyPurchaseOrders, activatePaidInquiryCompany } from './purchase-inquiries.mjs?v=order-flow-24'
import { verificationBridgeKey, loadLinkedRequests, updateLinkedRequest, submitLinkedCompany, submitLinkedEmployee, buildTwoApplicantDemo, applyLinkedRequest, reconcileLinkedApplicants, clearLinkedRequests } from './verification-bridge.mjs?v=public-copy-1'
import { products, initialState, access, canPurchase, contactVerified, contactsVerified, saveProfileName, requestContactCode, confirmContactCode, checkoutDraft, setStage, restoreScenario, product,
  productVersions, nomenclatures, protectionOptions, deliveryMethods, deliveryCost, allowedDelivery, receivingGroups,
  canUseCart, selectedConfiguration, selectConfiguration, continueSelectedOrder, demoIdentityContact, completeDemoIdentity, signOut,
  unitPrice, cartLines, total, needsProject, addItem, changeQuantity, searchCompanyDirectory, registerCompanyFromSearch,
  canRequestCompanyChange, requestCompanyChange, simulateCompanyReview, companyConnectionValues, validateCompanyConnection,
  verificationReviews, reviewSubmission, reviewLabels, canReviewAccess, canViewAccount, startAccessReview, simulateAccessReview, resubmitAccessReview,
  submitOrder, currentUser, switchRole,
  findJoinCompany, requestMembership, approveMembership, inviteEmployee, previewInvitation, acceptInvitation, softwareOrders,
  updateEmployee, removeEmployee, rejectMembership, cancelInvitation,
  administrator, employeeMember, canViewStaff, canManageStaff, staffDirectory, staffRequest, staffInvitation, transferAdministration, staffHistory, staffEventLabels } from './model.mjs?v=public-copy-2'
import { storageKey, loadState, saveState, clearState, submitSavedOrder } from './storage.mjs?v=public-copy-1'
import { orderProgressKey, clearOrderProgress } from './order-progress.mjs'
import { esc, dataFields, verificationStatus, checkoutFieldError, checkoutBlockers } from './presentation.mjs?v=order-flow-24'
import { catalogItems, catalogSource, catalogFamilies, catalogPageSize, kindLabels, pilotConfigurations, pilotKeys, pilotDocuments, pilotKeyQuantity, pilotKeyCost, pilotKeySummary, pilotTotal, canConfigure, catalogLimit, parameterText, catalogGroups, catalogFacets, normalizeCatalogFilters, catalogPeers, lineVariant } from './catalog.mjs?v=public-copy-1'

let state = initialState()
let storageWarning = ''
let storageBlocked = false
try { state = loadState(window.localStorage) }
catch { storageBlocked = true; storageWarning = 'Сохранённые данные недоступны или повреждены. Они не перезаписаны. Чтобы начать заново, сбросьте сценарий.' }
let linkedRequest = null
let employeeLinkedRequest = null
let bridgeWarning = ''
refreshVerification()
let lastSaved = ''
refreshPaidInquiryAccess()
const savedCatalog = normalizeCatalogFilters(state.catalogFilters)
let search = savedCatalog.search
let staffFilters = { action: '', email: '' }
let teamTab = 'members'
let selectedQuantity = selectedConfiguration(state) && selectedConfiguration(state).id === location.hash.slice(1).split('/')[1] ? selectedConfiguration(state).quantity : 1
let catalogFamily = savedCatalog.family
let catalogKind = savedCatalog.kind
let catalogAttributes = savedCatalog.attributes
let catalogPageIndex = savedCatalog.page
let catalogNotice = ''
let checkout = checkoutDraft(state)
let purchaseInquiryDraft = null
let profileContactDraft = {}
let profileNameDraft = null
let profileEditing = {}
let demoOpen = false
let demoSection = 'person'
let toastTimer
let companySearchTimer
let dialogOpener
const app = document.querySelector('#app')
const dialog = document.querySelector('#dialog')
const demoPanel = document.querySelector('#demo-panel')
const money = value => new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(value / 100)
const keyWord = count => ({ one: 'ключ', few: 'ключа', many: 'ключей' })[new Intl.PluralRules('ru').select(count)]
const date = value => new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(value))
const eventDate = value => new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'medium', timeZone: 'Europe/Moscow' }).format(new Date(value))
const route = () => location.hash.slice(1).split('/')
const btn = (text, action, extra = '', cls = '') => `<button type="button" class="btn ${cls}" data-action="${action}" ${extra}>${text}</button>`

function persist() {
  refreshVerification()
  refreshPaidInquiryAccess()
  if (storageBlocked) return
  state.catalogFilters = { family: catalogFamily, search, kind: catalogKind, attributes: { ...catalogAttributes }, page: catalogPageIndex }
  if (JSON.stringify(state) === lastSaved) return
  try {
    saveState(window.localStorage, state)
    lastSaved = JSON.stringify(state)
    storageWarning = ''
  } catch { storageWarning = 'Изменения не сохранены: хранилище браузера недоступно или заполнено. Не обновляйте страницу, пока не устраните проблему.' }
  const status = document.querySelector('#storage-status')
  status.textContent = storageWarning || 'Тестовые данные сохраняются в этом браузере.'
  status.classList.toggle('storage-warning', Boolean(storageWarning))
}

function refreshPaidInquiryAccess() {
  if (storageBlocked) return
  try { activatePaidInquiryCompany(window.localStorage,state) }
  catch (error) { storageWarning = `Не удалось проверить доступ по оплаченному заказу: ${error.message}` }
}

function refreshVerification() {
  try {
    const requests = loadLinkedRequests(window.localStorage)
    linkedRequest = reconcileLinkedApplicants(state, requests)
    employeeLinkedRequest = state.employeeVerificationRequestId ? requests.find(r => r.id === state.employeeVerificationRequestId) || null : null
    if (state.verificationRequestId && !linkedRequest) applyLinkedRequest(state, null)
    bridgeWarning = ''
  } catch (error) { bridgeWarning = error.message; if (state.verificationRequestId) applyLinkedRequest(state, null) }
}

function refreshSavedState() {
  if (storageBlocked || storageWarning) return
  try {
    const saved = loadState(window.localStorage)
    if (JSON.stringify(saved) === lastSaved) return
    if (state.role !== saved.role || currentUser(state).person !== currentUser(saved).person) { profileNameDraft = null; profileContactDraft = {}; profileEditing = {} }
    if (saved.stage === 'guest') purchaseInquiryDraft = null
    state = saved
    lastSaved = JSON.stringify(saved)
    checkout = checkoutDraft(state)
    const filters = normalizeCatalogFilters(state.catalogFilters)
    catalogFamily = filters.family; search = filters.search; catalogKind = filters.kind
    catalogAttributes = filters.attributes; catalogPageIndex = filters.page
  } catch {
    storageBlocked = true
    storageWarning = 'Сохранение из другой вкладки недоступно или повреждено. Оно не перезаписано. Для нового сценария нажмите «Начать заново».'
  }
}

function linkedVerificationPanel() {
  if (!state.verificationRequestId) return ''
  const item = linkedRequest
  const labels = {pending:'Ожидает проверки',approved:'Одобрена',returned:'Нужно уточнение',rejected:'Отклонена'}
  const syncLabels = {not_started:labels[item?.decision] || 'На проверке',pending:'На проверке',ready:'Подтверждено',error:'Проверка занимает больше времени'}
  return `<div data-linked-verification><p class="note">Заявка ${esc(state.verificationRequestId)}</p>${bridgeWarning ? `<p role="alert">${esc(bridgeWarning)}</p>` : !item ? '<p>Заявка недоступна. Отправьте сведения повторно.</p>' : dataFields([['Решение оператора', labels[item.decision], true], ['Проверка компании', syncLabels[item.sync.company]], ['Проверка представителя', syncLabels[item.sync.contact]], ...(item.comment ? [['Комментарий оператора', item.comment, true]] : [])])}</div>`
}

function operatorDemoLinks() {
  const applicants = [[administrator(state).person, state.verificationRequestId], [state.employee.person, state.employeeVerificationRequestId]].sort((a, b) => a[0].localeCompare(b[0], 'ru'))
  return `<div class="actions"><a class="btn secondary small" href="operator.html#requests" target="_blank" rel="noopener">Кабинет оператора ↗</a>${applicants.filter(([, id]) => id).map(([person, id]) => `<a class="btn secondary small" href="operator.html#request/${esc(id)}" target="_blank" rel="noopener">Заявка: ${esc(person)} ↗</a>`).join('')}</div><details><summary>Тестовые ИНН и обмен данными</summary><p class="note">Поиск: 111 или 222 · есть в 1С: 2223334444 · ручной ввод: 3333333333. ЛК и оператор должны быть открыты на одном адресе браузера.</p></details>`
}

function applicantDemoStatus(request, role) {
  if (!request) return 'Заявка ещё не подана'
  if (request.decision === 'pending') return 'Ожидает проверки оператора'
  if (request.automated) return { pending: 'Ожидает решения администратора', approved: 'Сотрудник компании', rejected: 'Администратор отклонил' }[staffRequest(state)?.status] || 'Автоматический обмен с 1С'
  if (request.decision === 'returned') return 'Нужно уточнение'
  if (request.decision === 'rejected') return 'Оператор отказал'
  if (role === 'admin' && state.claimWinnerId === request.id) return 'Администратор компании'
  return { pending: 'Ожидает решения администратора', approved: 'Сотрудник компании', rejected: 'Администратор отклонил' }[staffRequest(state)?.status] || 'Оператор подтвердил'
}

function navigate(path, selectId) {
  if (selectId) {
    const scrollY = window.scrollY
    history.replaceState(null, '', `#${path}`)
    render()
    window.scrollTo(0, scrollY)
    document.getElementById(selectId)?.focus({ preventScroll: true })
  } else if (location.hash === `#${path}`) render(true)
  else location.hash = path
}

function logout() {
  if (storageBlocked) throw new Error('Не удалось сохранить данные. Выход не выполнен.')
  const next = structuredClone(state)
  signOut(next)
  next.catalogFilters = { family: catalogFamily, search, kind: catalogKind, attributes: { ...catalogAttributes }, page: catalogPageIndex }
  saveState(window.localStorage, next)
  state = next
  lastSaved = JSON.stringify(state)
  storageWarning = ''
  profileNameDraft = null; profileContactDraft = {}; profileEditing = {}; purchaseInquiryDraft = null
  checkout = checkoutDraft(state)
  if (demoPanel.open) demoPanel.close()
  demoOpen = false
  navigate('catalog')
  notify('Вы вышли из IEK ID. Данные профиля сохранены в этом браузере.')
}

function notify(message) {
  clearTimeout(toastTimer)
  document.querySelector('#toast').textContent = message
  toastTimer = setTimeout(() => { document.querySelector('#toast').textContent = '' }, 5000)
}

function modal(title, content) {
  if (!dialog.open) dialogOpener = document.activeElement
  dialog.innerHTML = `<div class="dialog-inner"><div class="dialog-head"><h2 id="dialog-title" tabindex="-1">${title}</h2><button class="close" data-action="close" aria-label="Закрыть окно">×</button></div>${content}</div>`
  if (!dialog.open) dialog.showModal()
  dialog.querySelector('#dialog-title').focus()
}

function identityModal(contact = '') {
  const content = contact ? `<p>Введите код для <strong>${esc(contact)}</strong>.</p><form id="identity-code-form"><input type="hidden" name="contact" value="${esc(contact)}"><label class="field">Код подтверждения<input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required placeholder="6 цифр"></label><p class="note">Демо: сообщение не отправляется. Код — <strong>123456</strong>.</p><button class="btn full" type="submit">Продолжить →</button></form><button type="button" class="identity-back" data-action="identity-edit">Изменить почту или телефон</button>` : `<p>Укажите почту или телефон. IEK ID проверит контакт: если аккаунт уже есть, вы войдёте; если нет — зарегистрируетесь после подтверждения кода.</p><form id="identity-contact-form"><label class="field">Почта или телефон<input name="contact" autocomplete="username" required maxlength="120" placeholder="name@example.ru или +7 999 123-45-67"></label><button class="btn full" type="submit">Получить код →</button></form><p class="note">Это локальное демо IEK ID: код не отправляется, настоящий аккаунт не создаётся.</p>`
  modal('Вход или регистрация через IEK ID', `${content}<p id="form-error" class="identity-error" role="alert"></p>`)
  dialog.querySelector('form input:not([type="hidden"])')?.focus()
}

function art(large = false) {
  return `<div class="product-art ${large ? 'large' : ''}" aria-hidden="true"><div class="monitor"><div class="monitor-title">MASTER SCADA / CONTROL SYSTEM</div><div class="monitor-screen"><i></i><i></i><i></i><i></i><i></i></div></div></div>`
}

function priceBlock(item) {
  if (item.sourceCatalog) return `<div class="price">${money(item.rrp)}</div><div class="price-caption">По прайсу 2026 · без НДС · без скидки компании</div>`
  return `<div class="price">${money(unitPrice(item, state.stage))}</div><div class="price-caption">${state.stage === 'verified' ? `Спеццена · РРЦ ${money(item.rrp)}` : 'Рекомендованная розничная цена'} · без НДС</div>`
}

function productCards() {
  const groups = catalogGroups({ search, family: catalogFamily, kind: catalogKind, attributes: catalogAttributes })
  const count = groups.reduce((sum, group) => sum + group.items.length, 0)
  const pages = Math.max(1, Math.ceil(groups.length / catalogPageSize))
  catalogPageIndex = Math.min(catalogPageIndex, pages)
  const start = (catalogPageIndex - 1) * catalogPageSize
  const pagination = pages > 1 ? `<nav class="catalog-pagination" aria-label="Страницы каталога"><button type="button" data-action="catalog-page" data-page="${catalogPageIndex - 1}" ${catalogPageIndex === 1 ? 'disabled' : ''} aria-label="Предыдущая страница">←</button>${Array.from({ length: pages }, (_, index) => `<button type="button" data-action="catalog-page" data-page="${index + 1}" aria-label="Страница ${index + 1}" ${catalogPageIndex === index + 1 ? 'aria-current="page"' : ''}>${index + 1}</button>`).join('')}<button type="button" data-action="catalog-page" data-page="${catalogPageIndex + 1}" ${catalogPageIndex === pages ? 'disabled' : ''} aria-label="Следующая страница">→</button></nav>` : ''
  return `<div class="catalog-results-head"><p class="catalog-count" role="status" tabindex="-1">Найдено: ${count} из ${catalogItems.length} позиций · ${groups.length} групп${groups.length ? ` · Показаны группы ${start + 1}–${Math.min(start + catalogPageSize, groups.length)}` : ''}</p><p class="catalog-source-note">Прайс 2026 · условия НДС — в деталях позиции</p></div>` + (groups.length ? groups.slice(start, start + catalogPageSize).map(group => {
    const configurable = group.items.find(canConfigure)
    const first = configurable || group.items[0]
    const fixed = group.items.filter(item => item.price.kind === 'fixed')
    const comparable = new Set(group.items.map(item => item.kind)).size === 1 && !group.items.some(item => item.attributes.billing_unit || item.kind === 'subscription')
    const free = group.items.some(item => item.price.kind === 'free'), quote = group.items.some(item => item.price.kind === 'on_request')
    const countForm = new Intl.PluralRules('ru').select(group.items.length)
    return `<article class="product-card catalog-group"><div class="card-body"><div class="catalog-group-head"><span class="eyebrow">${esc(group.family)}</span><span class="catalog-group-count">${group.items.length} ${countForm === 'one' ? 'позиция' : countForm === 'few' ? 'позиции' : 'позиций'}</span></div><h3>${esc(group.name)}</h3><ul class="catalog-kind-list" aria-label="Типы позиций">${[...new Set(group.items.map(item => kindLabels[item.kind]))].map(kind => `<li>${esc(kind)}</li>`).join('')}</ul><div class="catalog-group-availability"><span class="status ${configurable ? 'green' : ''}">${configurable ? 'Доступна комплектация' : 'Только просмотр'}</span>${configurable ? '' : '<span>Оформление этих позиций пока недоступно</span>'}</div>
      <div class="catalog-group-footer"><div class="catalog-group-price">${access(state.stage).prices ? `<strong>${fixed.length ? comparable ? `от ${money(Math.min(...fixed.map(item => item.price.amount_minor)))}` : 'Цены в позициях' : free ? 'Есть бесплатные позиции' : 'Цены по запросу'}</strong>${free && fixed.length ? '<span>Есть бесплатные позиции</span>' : ''}${quote && (fixed.length || free) ? '<span>Есть цены по запросу</span>' : ''}` : '<strong>Цены после входа через IEK ID</strong>'}</div>
      <a class="btn secondary" href="#product/source:${first.id}">Посмотреть позиции →</a></div></div></article>`
  }).join('') + pagination : `<div class="filtered-empty"><h3>Ничего не найдено</h3><p>Измените запрос или сбросьте фильтры выше.</p></div>`)
}

function catalogFacetControls() {
  return catalogFacets({ search, family: catalogFamily, kind: catalogKind, attributes: catalogAttributes }).map(field => {
    const selected = field.id === 'kind' ? catalogKind : catalogAttributes[field.id] || ''
    if (field.options.length === 1) return `<div class="field catalog-static"><span>${field.label}</span><strong>${esc(field.options[0].label)}</strong>${field.partial ? '<small>У позиций с этой характеристикой</small>' : ''}</div>`
    return `<label class="field">${field.label}<select id="catalog-${field.id}" data-catalog-filter="${field.id}"><option value="">${field.id === 'kind' ? 'Все типы' : 'Все значения'}</option>${field.options.map(option => `<option value="${esc(option.value)}" ${option.value === selected ? 'selected' : ''} ${option.count === 0 ? 'disabled' : ''}>${esc(option.label)} · ${option.count}</option>`).join('')}</select></label>`
  }).join('')
}

function changeCatalogFamily(family) {
  catalogPageIndex = 1
  const oldFields = catalogFacets({ family: catalogFamily })
  const newFields = catalogFacets({ family })
  const removed = []
  for (const field of oldFields) {
    const value = field.id === 'kind' ? catalogKind : catalogAttributes[field.id]
    if (!value) continue
    const next = newFields.find(next => next.id === field.id)
    // Единственная характеристика — подпись, а не скрытый активный фильтр.
    if (!next || next.options.length === 1 || !next.options.some(option => option.value === value)) {
      removed.push(field.label.toLocaleLowerCase('ru-RU'))
      if (field.id === 'kind') catalogKind = ''
      else delete catalogAttributes[field.id]
    }
  }
  catalogFamily = family
  catalogNotice = removed.length ? `При смене семейства сброшены фильтры: ${removed.join(', ')}.${search ? ' Поисковый запрос сохранён.' : ''}` : ''
}

function catalogPage() {
  return `<section aria-label="Каталог ПО"><section class="panel catalog-filters"><div class="section-head"><h2>Каталог IEK Digital</h2><span class="status">279 позиций из прайса</span></div>
    <div class="catalog-fields"><label class="field">Семейство<select id="catalog-family"><option value="">Все семейства</option>${catalogFamilies.map(name => `<option ${name === catalogFamily ? 'selected' : ''}>${esc(name)}</option>`).join('')}</select></label><label class="field">Поиск<input type="search" id="search" aria-label="Поиск по каталогу" placeholder="Артикул, название, редакция" value="${esc(search)}"></label></div>
    <div class="catalog-facets" id="catalog-facets">${catalogFacetControls()}</div>
    <div class="catalog-filter-footer"><p class="note" role="status" id="catalog-filter-notice">${esc(catalogNotice)}</p>${btn('Сбросить фильтры', 'clear-search', '', 'secondary small')}</div>
    <p class="note">Оформление доступно для лицензий MasterSCADA 4D. Остальные позиции можно изучить в каталоге.</p></section><div class="cards catalog-cards" id="cards">${productCards()}</div></section>`
}

function catalogPrice(item) {
  const text = item.price.kind === 'on_request' ? 'По запросу' : item.price.kind === 'free' ? 'Бесплатно' : money(item.price.amount_minor)
  return `<div class="price">${text}</div><p class="price-caption">Прайс 2026 · ${item.price.tax_display === 'vat_included' ? `НДС включён${item.price.vat_rate_in_source ? ` · ${item.price.vat_rate_in_source}% по источнику` : ''}` : 'без НДС'}</p>`
}

function pilotProductPage(source, chosen) {
  const variants = catalogPeers(source).filter(canConfigure)
  const item = chosen || pilotConfigurations.find(option => option.sku === source.sku && option.keySku === 'AUTO' && !option.virtualized)
  const keys = pilotKeys.filter(key => !item.virtualized || key.capacity > 1)
  const added = state.cart.some(line => line.id === item.id)
  return `<p class="note"><a href="#catalog">Каталог</a> / MasterSCADA 4D / ${esc(source.edition)} / ${esc(source.sku)}</p>
  <div class="real-product-layout"><div class="pilot-product-main"><section class="panel real-product-info"><header class="real-product-hero"><span class="eyebrow">MasterSCADA 4D · лицензия без права возврата</span><h2>${esc(source.product)} ${esc(source.edition)}</h2><div class="real-product-keyfacts"><div><span>Артикул ПО</span><strong class="sku">${esc(source.sku)}</strong></div><div><span>Объём</span><strong>${esc(parameterText(source))}</strong></div></div></header>
  <div class="real-product-section"><h3>Выберите лицензию</h3><label class="field">Редакция<select id="pilot-edition">${[...new Set(variants.map(option => option.edition))].map(edition => `<option value="${esc(edition)}" ${edition === source.edition ? 'selected' : ''}>${esc(edition)}</option>`).join('')}</select></label><label class="field">Количество внешних точек<select id="pilot-sku">${variants.filter(option => option.edition === source.edition).map(option => `<option value="${esc(option.sku)}" ${option.sku === source.sku ? 'selected' : ''}>${esc(parameterText(option))} · ${esc(option.sku)}</option>`).join('')}</select></label></div>
  <div class="real-product-section"><h3>О продукте</h3><p>${esc(source.name)}</p><p class="note">Цена по прайсу 2026, без НДС.</p></div></section>
  <section class="panel pilot-documents-panel" aria-labelledby="pilot-documents-title"><h3 id="pilot-documents-title">Материалы и документы</h3><div class="pilot-documents">${pilotDocuments.map(([label, url]) => `<a class="pilot-document-link" href="${url}" target="_blank" rel="noopener noreferrer"><svg class="pilot-document-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 3h7l4 4v14H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"/><path d="M14 3v5h4M9 12h6M9 16h6"/></svg><span>${esc(label)}</span><span class="pilot-document-arrow" aria-hidden="true">↗</span></a>`).join('')}</div></section></div>
  <section class="panel configuration-panel" data-pilot-id="${item.id}"><h2>Комплектация</h2><p class="note">Для этих лицензий нужен физический ключ защиты. Программный код для них не предлагается.</p>
  <label class="field">Будет ли использоваться виртуализация?<select id="pilot-virtual"><option value="no" ${!item.virtualized ? 'selected' : ''}>Нет</option><option value="yes" ${item.virtualized ? 'selected' : ''}>Да</option></select></label>
  <label class="field">Ключ защиты<select id="pilot-key"><option value="AUTO" ${item.keySku === 'AUTO' ? 'selected' : ''}>Автоподбор по количеству лицензий</option>${keys.map(key => `<option value="${key.sku}" ${key.sku === item.keySku ? 'selected' : ''}>${esc(key.sku)} · до ${key.capacity} ${key.capacity === 1 ? 'лицензии' : 'лицензий'} · ${money(key.price.amount_minor)}</option>`).join('')}</select></label>
  <div class="qty-price"><div><label for="product-quantity" class="qty-label">Лицензий</label><div class="quantity"><button type="button" data-action="product-minus" aria-label="Уменьшить количество" ${selectedQuantity <= 1 ? 'disabled' : ''}>−</button><input id="product-quantity" type="number" min="1" max="99" step="1" value="${selectedQuantity}"><button type="button" data-action="product-plus" aria-label="Увеличить количество" ${selectedQuantity >= 99 ? 'disabled' : ''}>+</button></div></div></div>
  <div class="configuration-parts"><div><span id="pilot-software-label">${selectedQuantity} лиц. × ${money(item.softwareRrp)}</span><strong id="pilot-software-total">${money(selectedQuantity * item.softwareRrp)}</strong></div><div><span id="pilot-key-label">${esc(pilotKeySummary(item, selectedQuantity))}</span><strong id="pilot-key-total">${money(pilotKeyCost(item, selectedQuantity))}</strong></div><div><strong>Товары</strong><strong id="pilot-total">${money(pilotTotal(item, selectedQuantity))}</strong></div></div>
  <p class="note">Автоподбор использует минимальное число ключей; при равном числе выбирает более дешёвый набор. Тип ключа можно выбрать вручную. Физические ключи доставляются курьером.</p>
  ${canUseCart(state) ? added ? '<a class="btn full" href="#cart">Перейти в корзину →</a><p class="note">Комплектация уже в корзине; количество можно изменить там.</p>' : btn('Добавить в корзину →', 'add', `data-id="${item.id}"`, 'full') : btn('Продолжить с этой комплектацией →', 'prepare-selection', `data-id="${item.id}"`, 'full')}
  <a class="catalog-back" href="#catalog">← Вернуться в каталог</a></section></div>`
}

function realProductPage(source) {
  const peers = catalogPeers(source), category = item => `${item.kind}:${item.edition || ''}`
  const categories = [...new Map(peers.map(item => [category(item), `${kindLabels[item.kind]}${item.edition ? ` · ${item.edition}` : ''}`])).entries()]
  const attributes = source.attributes
  const fields = [['Редакция', source.edition || 'Не задана'], ['Релиз / версия', source.release || 'В прайсе не указан'],
    ...(attributes.linux !== undefined ? [['Установка на Linux', attributes.linux ? 'Да' : 'Нет']] : []),
    ...(attributes.supported_os_text ? [['ОС', attributes.supported_os_text]] : [])]
  return `<p class="note"><a href="#catalog">Каталог</a> / ${esc(source.family)} / ${esc(source.product)}</p>
    <div class="real-product-layout"><section class="panel real-product-info"><header class="real-product-hero"><span class="eyebrow">${esc(source.family)}</span><h2>${esc(source.product)}</h2><ul class="catalog-kind-list" aria-label="Тип позиции"><li>${esc(kindLabels[source.kind])}</li>${source.edition ? `<li>Редакция: ${esc(source.edition)}</li>` : ''}</ul><div class="real-product-keyfacts"><div><span>Артикул</span><strong class="sku">${esc(source.sku)}</strong></div>${parameterText(source) ? `<div><span>Параметры</span><strong>${esc(parameterText(source))}</strong></div>` : ''}</div></header>
    <div class="real-product-section"><h3>Выбор позиции</h3><label class="field">Редакция / тип позиции<select id="real-category" data-source="${source.id}">${categories.map(([value, label]) => `<option value="${value}" ${value === category(source) ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select></label><label class="field">Номенклатура<select id="real-variant">${peers.filter(item => category(item) === category(source)).map(item => `<option value="${item.id}" ${item.id === source.id ? 'selected' : ''}>${esc(item.sku)} · ${esc(parameterText(item) || item.name)}</option>`).join('')}</select></label></div>
    <div class="real-product-section"><h3>Характеристики</h3>${dataFields(fields)}</div><details class="explanation" open><summary>Описание из прайса</summary><p>${esc(source.name)}</p>${attributes.included_text ? `<p>${esc(attributes.included_text)}</p>` : ''}${attributes.technical_description ? `<p>${esc(attributes.technical_description)}</p>` : ''}</details>
    <p class="note"><a href="${catalogSource.url}#page=${source.page}" target="_blank" rel="noopener noreferrer">Прайс IEK · стр. ${source.page} ↗</a></p></section>
    <section class="panel configuration-panel"><h2>Сведения о позиции</h2>${catalogPrice(source)}<p class="notice">${esc(catalogLimit(source))}</p><a class="catalog-back" href="#catalog">← Вернуться в каталог</a></section></div>`
}

function gateAction() {
  if (canViewAccount(state) && !canPurchase(state)) return '<a class="btn full" href="#company/info">Компания и статус проверки →</a>'
  if (selectedConfiguration(state)) return '<a class="btn full" href="#prepare">Продолжить подготовку заказа →</a>'
  if (state.stage === 'identified') return '<a class="btn full" href="#prepare">Подготовить доступ →</a>'
  if (state.role === 'employee') return '<a class="btn full" href="#company">Присоединение и доступ →</a>'
  return state.stage === 'guest' ? btn('Войти или зарегистрироваться', 'login', '', 'full') : `<a class="btn full" href="#company">${state.stage === 'identified' ? 'Добавить компанию' : 'Посмотреть состояние проверки'}</a>`
}

function productPage(id) {
  const source = catalogItems.find(item => `source:${item.id}` === id)
  if (source && canConfigure(source)) return pilotProductPage(source)
  if (source) return realProductPage(source)
  let item
  try { item = product(id) } catch { return empty('Товар не найден', 'Вернитесь в каталог и выберите другую позицию.') }
  if (item.pilot) return pilotProductPage(catalogItems.find(source => source.sku === item.sku), item)
  if (item.sourceCatalog) return realProductPage(catalogItems.find(source => source.sku === item.sku))
  const added = state.cart.some(line => line.id === id)
  return `<p class="note"><a href="#catalog">Продукт: MasterSCADA 4D</a> → ${esc(item.version)} → ${esc(item.sku)}</p><div class="product-layout"><section>${art(true)}<div class="panel"><span class="eyebrow">Номенклатура ПО</span><h2>${item.name} ${item.edition}</h2><p>${item.description}</p><dl class="specs"><div><dt>Версия</dt><dd>${esc(item.version)}</dd></div><div><dt>Редакция</dt><dd>${item.edition}</dd></div><div><dt>Точки ввода-вывода</dt><dd>${item.capacity}</dd></div><div><dt>Артикул ПО</dt><dd class="sku">${item.sku}</dd></div></dl></div></section><section class="panel"><h2>Комплектация</h2><label class="field">Версия продукта<select id="product-version">${productVersions.map(v => `<option value="${v.id}" ${v.id === item.versionId ? 'selected' : ''}>${v.name}</option>`).join('')}</select></label><label class="field">Номенклатура<select id="variant">${nomenclatures.filter(p => p.versionId === item.versionId).map(p => `<option value="${p.id}" ${p.id === item.nomenclatureId ? 'selected' : ''}>${p.edition} · ${p.capacity} точек · ${p.sku}</option>`).join('')}</select></label><label class="field">Способ защиты / ключ<select id="protection">${protectionOptions.map(key => `<option value="${key.id}" ${key.id === item.protection ? 'selected' : ''}>${key.name}${access(state.stage).prices && key.physical ? ` · +${money(key.rrp)}` : ''}</option>`).join('')}</select></label><p class="note">Sign — для ПК, Sign-net — сетевой ключ. Количество ключей соответствует количеству комплектов.</p><div class="mini-box"><strong>Состав одной комплектации</strong><p>ПО: ${item.sku}${access(state.stage).prices ? ` · ${money(unitPrice({ rrp: item.softwareRrp }, state.stage))}` : ''}</p><p>${item.physical ? `Ключ: ${item.keySku}${access(state.stage).prices ? ` · ${money(item.keyRrp)}` : ''}` : 'Программная активация кодом · без физического ключа'}</p><p>Получение: ${item.physical ? 'курьером в руки' : 'электронно по email'}. Реквизиты получателя укажете при оформлении.</p></div><div class="qty-price"><div><label for="product-quantity" class="qty-label">Количество комплектов</label><div class="quantity"><button data-action="product-minus" aria-label="Уменьшить количество лицензий" ${selectedQuantity <= 1 ? 'disabled' : ''}>−</button><input id="product-quantity" type="number" min="1" max="99" step="1" value="${selectedQuantity}"><button data-action="product-plus" aria-label="Увеличить количество лицензий" ${selectedQuantity >= 99 ? 'disabled' : ''}>+</button></div></div><div>${priceBlock(item)}<span class="note">за комплект</span></div></div>${canUseCart(state) ? (added ? `<a class="btn full" href="#cart">Перейти в корзину →</a><p class="note">Эта комплектация уже в корзине. Количество можно изменить в корзине.</p>` : btn('Добавить в корзину →', 'add', `data-id="${id}"`, 'full')) : `${btn('Продолжить с этой комплектацией →', 'prepare-selection', `data-id="${id}"`, 'full')}<p class="note">Сохраним выбор и поможем завершить подготовку доступа. Это ещё не корзина и не заказ.</p>`}<p class="note">Цены для этой комплектации приведены для демонстрации.</p><div class="help-line"><a href="#catalog">← Каталог</a><a href="#cart">Корзина</a></div></section></div>`
}

function companyRequisites(company) {
  return `<div class="company-name">${esc(company.name)}</div>${dataFields([['ИНН', company.inn], ['КПП', company.kpp], ['Юридический адрес', company.legalAddress, true]])}`
}

function companyDetailsPanel(compact = false, demo = false) {
  const displayedCompany = compact && state.role === 'admin' && linkedRequest && !canPurchase(state) ? {...state.company, name:linkedRequest.company, inn:linkedRequest.inn, kpp:linkedRequest.kpp, legalAddress:linkedRequest.address} : state.company
  const change = state.companyChange
  const pending = change?.status === 'pending'
  return `<section class="panel" aria-label="Реквизиты компании">${compact ? '<h2>Реквизиты компании</h2>' : verificationHeader(verificationReviews(state).company.status === 'confirmed' ? 'Действующие реквизиты' : 'Реквизиты на проверке', 'company')}${companyRequisites(displayedCompany)}${canRequestCompanyChange(state) && !pending ? btn('Предложить изменение реквизитов', 'edit-company', '', 'secondary small') : ''}${!compact || change ? `<p class="note">Изменения сначала проходят проверку и подтверждение. До этого используются действующие реквизиты. ${state.role === 'employee' ? 'Сотруднику доступен только просмотр.' : !canRequestCompanyChange(state) ? 'Отправка заявки доступна после подтверждения доступа администратора.' : ''}</p>` : ''}
  ${change ? `<div class="rule"></div><h3>${pending ? 'Предложенные изменения · на проверке' : change.status === 'confirmed' ? 'Последняя заявка · подтверждена' : change.status === 'returned' ? 'Заявка · нужно исправить' : 'Последняя заявка · отклонена'}</h3><p class="note">Отправил(а): ${esc(change.author.person)} · ${esc(change.author.email)} · ${eventDate(change.date)}</p>${dataFields([['Название', change.proposed.name, true], ['КПП', change.proposed.kpp], ['Юридический адрес', change.proposed.legalAddress, true]])}${change.reason ? `<p class="form-error"><strong>Причина:</strong> ${esc(change.reason)}</p>` : ''}${change.previousReason ? `<p>Предыдущая причина: ${esc(change.previousReason)}</p>` : ''}${['returned', 'rejected'].includes(change.status) && canRequestCompanyChange(state) ? btn('Исправить заявку на реквизиты', 'edit-company', '', 'secondary') : ''}<p>${pending ? 'Действующие данные ещё не изменены. Повторная заявка доступна после результата проверки.' : ['returned', 'rejected'].includes(change.status) ? 'Реквизиты не изменены. Администратор может отправить исправленную заявку.' : 'Новые реквизиты применены. Ранее оформленные заказы не переписаны.'}</p>` : ''}
  </section>
  ${demo && pending && canRequestCompanyChange(state) ? `<section class="lab-card" aria-label="Пульт проверки реквизитов"><h3>Имитировать внешний результат проверки</h3><p>Имитируйте ответ на заявку. Запросы в 1С не отправляются.</p><div class="actions">${btn('Имитировать подтверждение изменений', 'company-review', 'data-result="confirmed"', 'secondary small')}${btn('Вернуть реквизиты на исправление', 'company-review', 'data-result="returned"', 'secondary small')}${btn('Имитировать отклонение изменений', 'company-review', 'data-result="rejected"', 'secondary small')}</div></section>` : ''}`
}

function companyLookupBody() {
  const draft = { ...currentUser(state), inn: '', name: '', kpp: '', legalAddress: '', ...state.companyDraft }
  if (!/^\d{3,12}$/.test(draft.inn || '')) return '<p class="note">Введите не менее 3 цифр ИНН, чтобы найти компанию.</p>'
  const matches = state.verificationRequestId ? [] : searchCompanyDirectory(draft.inn)
  const selected = matches.find(company => company.id === draft.selectedCompanyId && company.inn === draft.inn)
  const table = matches.length ? `<div class="company-results-scroll"><table class="company-results" aria-label="Компании по ИНН"><thead><tr><th scope="col">Компания / адрес</th><th scope="col">ИНН</th><th scope="col">КПП</th><th scope="col"><span class="sr-only">Выбор компании</span></th></tr></thead><tbody>${(selected ? [selected] : matches).map(company => `<tr ${selected ? 'class="is-selected"' : `data-action="select-company" data-id="${esc(company.id)}"`}><td><strong>${esc(company.name)}</strong><span>${esc(company.legalAddress || 'Адрес не указан')}</span></td><td>${esc(company.inn)}</td><td>${esc(company.kpp || '—')}</td><td>${selected ? '<span class="status green">✓ Выбрана</span>' : btn('Выбрать', 'select-company', `data-id="${esc(company.id)}" aria-label="Выбрать ${esc(company.name)}"`, 'secondary small')}</td></tr>`).join('')}</tbody></table></div>` : ''
  if (matches.length && !selected) return `<p class="company-results-count" role="status">Найдено компаний: ${matches.length}</p>${table}<p class="note">Выберите компанию для подключения. Доступ к её данным откроется после проверки.</p>`
  if (!/^(\d{10}|\d{12})$/.test(draft.inn)) return '<p role="status">Совпадений пока нет. Для ручного добавления введите полный ИНН: 10 или 12 цифр.</p>'
  return `<p role="status">${state.verificationRequestId ? 'Исправьте реквизиты — они будут отправлены оператору на повторную проверку.' : selected ? 'Компания выбрана' : 'Совпадений нет. Заполните реквизиты вручную.'}</p>
    ${selected ? ` ${table}<p class="note">${state.verificationRequestId ? 'Компания уже указана в заявке. Повторный выбор не нужен.' : 'Чтобы выбрать другую компанию, измените ИНН.'}</p>` : `<label class="field">Название компании<input name="name" required maxlength="120" value="${esc(draft.name)}"></label><div class="field-row"><label class="field">КПП (необязательно)<input name="kpp" pattern="[0-9]{9}" inputmode="numeric" maxlength="9" value="${esc(draft.kpp)}"></label><label class="field">Юридический адрес (необязательно)<input name="legalAddress" maxlength="250" value="${esc(draft.legalAddress)}"></label></div>`}
    <button class="btn" type="submit">Далее: представитель →</button>`
}

function contactConfirmationPanel(kind, profile = false) {
  const user = currentUser(state), verified = contactVerified(state, kind), phone = kind === 'phone'
  const challenge = state[`${kind}Challenge`]?.role === state.role ? state[`${kind}Challenge`] : null
  const value = user[kind] || (profile ? profileContactDraft[kind] : state.companyDraft[kind]) || challenge?.[kind] || ''
  const title = phone ? 'Телефон IEK ID' : 'Почта IEK ID', label = phone ? 'Телефон' : 'Почта'
  if (verified) return `<div class="confirmed-contact" aria-label="${title}: подтверждено"><span>${label}</span><strong>${esc(value)}</strong><span class="status green">✓ ${phone ? 'Подтверждён' : 'Подтверждена'}${profile ? '' : ' · IEK ID'}</span><input type="hidden" name="${kind}" value="${esc(value)}"></div>`
  if (profile) {
    const expanded = profileEditing[kind] ?? Boolean(challenge)
    return `<div class="profile-contact-editor"><div class="confirmed-contact"><span>${label}</span><strong class="${user[kind] ? '' : 'muted'}">${esc(user[kind] || (phone ? 'Не добавлен' : 'Не добавлена'))}</strong>${btn(expanded ? 'Свернуть' : user[kind] || challenge ? 'Подтвердить' : 'Добавить', 'profile-edit', `data-kind="${kind}" aria-label="${expanded ? 'Свернуть' : 'Добавить или подтвердить'} ${phone ? 'телефон' : 'почту'}" aria-expanded="${expanded}" aria-controls="profile-${kind}-editor"`, 'secondary small')}</div>
      ${expanded ? `<div id="profile-${kind}-editor" class="profile-inline-editor"><div class="profile-input-line"><label class="field"><span class="sr-only">${label}</span><input id="identity-${kind}" ${user[kind] ? 'readonly' : ''} name="${kind}" type="${phone ? 'tel' : 'email'}" required maxlength="${phone ? 30 : 120}" value="${esc(value)}" autocomplete="${phone ? 'tel' : 'email'}" placeholder="${phone ? '+7 999 123-45-67' : 'name@example.ru'}"></label>${btn(challenge ? 'Отправить повторно' : 'Получить код', 'request-contact-code', `data-kind="${kind}"`, 'secondary')}</div>
      ${challenge ? `<p class="note" role="status">Демо: ${phone ? 'SMS' : 'письмо'} не отправляется. Код <strong>123456</strong> для ${esc(challenge[kind])}, действует 10 минут.</p><div class="profile-input-line"><label class="field"><span class="sr-only">Код из ${phone ? 'SMS' : 'письма'}</span><input id="identity-${kind}-code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" placeholder="Код из ${phone ? 'SMS' : 'письма'}"></label>${btn(phone ? 'Подтвердить телефон' : 'Подтвердить почту', 'confirm-contact', `data-kind="${kind}"`)}</div>` : '<p class="note">Подтверждение через IEK ID · в демо сообщения не отправляются.</p>'}</div>` : ''}</div>`
  }
  return `<section class="notice contact-confirmation" aria-label="Подтверждение ${phone ? 'телефона' : 'почты'} IEK ID"><div class="section-head"><h3>${title}</h3><span class="status yellow">Требует подтверждения</span></div>
    <label class="field">${label}<input id="identity-${kind}" ${user[kind] ? 'readonly' : ''} name="${kind}" type="${phone ? 'tel' : 'email'}" required maxlength="${phone ? 30 : 120}" value="${esc(value)}" autocomplete="${phone ? 'tel' : 'email'}" ${phone ? 'placeholder="+7 999 123-45-67"' : ''}></label>
    <p>${user[kind] ? 'Контакт получен из IEK ID, но ещё не подтверждён.' : phone ? 'Вы вошли по почте. Добавьте телефон и подтвердите его кодом из SMS.' : 'Вы вошли по телефону. Добавьте почту и подтвердите её кодом из письма.'} Для покупок нужны оба подтверждённых контакта.</p>
    <p class="note">Демо: ${phone ? 'SMS' : 'письмо'} не отправляется. Тестовый код — <strong>123456</strong>, действует 10 минут.</p>
    ${challenge ? `<p role="status">Демо-код запрошен для ${esc(challenge[kind])}.</p><label class="field">Код из ${phone ? 'SMS' : 'письма'}<input id="identity-${kind}-code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" placeholder="6 цифр"></label><div class="actions">${btn(phone ? 'Подтвердить телефон' : 'Подтвердить почту', 'confirm-contact', `data-kind="${kind}"`)}${btn('Запросить код повторно', 'request-contact-code', `data-kind="${kind}"`, 'secondary')}</div>` : btn(phone ? 'Получить код по SMS' : 'Получить код по почте', 'request-contact-code', `data-kind="${kind}"`)}</section>`
}

function companyRegistrationForm() {
  const step = state.companyDraft.step || 1, draft = companyConnectionValues(state)
  const steps = ['Компания', 'Представитель', 'Проверка данных']
  return `<section class="panel connection-wizard"><div class="section-head"><div><span class="eyebrow">Подключение компании</span><h2 id="connection-title" tabindex="-1">Шаг ${step} из 3 · ${steps[step - 1]}</h2></div><a class="btn secondary small" href="#profile">Продолжить позже</a></div>
    <ol class="connection-steps" aria-label="Шаги подключения">${steps.map((title, i) => `<li ${step === i + 1 ? 'aria-current="step"' : ''}><span>${i + 1}</span>${title}</li>`).join('')}</ol>
    ${step === 3 ? '<p class="connection-intro">Проверьте реквизиты компании и данные её представителя перед отправкой.</p>' : step === 2 ? '<p class="note">Черновик сохраняется автоматически.</p>' : ''}
    <form id="company-form"><div class="form-error" id="form-error" role="alert" tabindex="-1"></div>
    ${step === 1 ? `<p class="company-search-intro">${state.verificationRequestId ? 'Реквизиты компании из вашей заявки.' : 'Найдите компанию по ИНН или добавьте новую вручную.'}</p><label class="field">ИНН компании<input name="inn" ${state.verificationRequestId ? 'readonly' : ''} required pattern="[0-9]{10}|[0-9]{12}" inputmode="numeric" maxlength="12" value="${esc(draft.inn)}" aria-describedby="inn-help"><small id="inn-help">${state.verificationRequestId ? 'При исправлении заявки ИНН не меняется.' : 'Поиск от 3 цифр. Полный ИНН — 10 или 12 цифр.'}</small></label><div id="company-lookup-body" aria-live="polite">${companyLookupBody()}</div>` : step === 2 ? `
    <p>Заполните ФИО, выберите должность и подтвердите полномочия. Почта и телефон относятся к вашему IEK ID.</p>
    <div class="field-row"><label class="field">ФИО<input name="person" required maxlength="100" value="${esc(draft.person)}" autocomplete="name" placeholder="Фамилия Имя Отчество"></label>
    <label class="field">Должность<select name="position" required><option value="">Выберите должность</option>${[...new Set(['Инженер', 'Инженер проектов', 'Специалист по закупкам', 'Руководитель закупок', 'Руководитель компании', 'Другая должность', draft.position].filter(Boolean))].map(position => `<option value="${esc(position)}" ${draft.position === position ? 'selected' : ''}>${esc(position)}</option>`).join('')}</select></label></div>
    ${contactConfirmationPanel('email')}${contactConfirmationPanel('phone')}
    <label class="connection-consent"><input name="authority" type="checkbox" required ${draft.authority ? 'checked' : ''}><span>Я представляю эту компанию и запрашиваю полномочия администратора её кабинета</span></label>
    <button class="btn" type="submit" ${contactsVerified(state) ? '' : 'disabled'}>Далее: проверка данных →</button>` : `
    <div class="connection-review"><section class="review-block" aria-labelledby="review-company-title"><h3 id="review-company-title">Компания</h3>${companyRequisites(draft)}</section>
    <section class="review-block" aria-labelledby="review-person-title"><h3 id="review-person-title">Представитель</h3><p class="review-role">Администратор кабинета компании</p>${dataFields([['ФИО', draft.person], ['Должность', draft.position], ['Почта', draft.email], ['Телефон', draft.phone]])}</section></div>
    <section class="review-submit" aria-labelledby="review-submit-title"><h3 id="review-submit-title">После отправки</h3><p>Заявка поступит оператору. Покупки станут доступны после проверки компании и представителя. Статус проверки появится в разделе компании.</p><p class="note">Личный кабинет продолжит работать независимо от результата.</p><div class="actions"><button class="btn" type="submit">Отправить заявку на подключение →</button>${btn('← Назад', 'connection-back', '', 'secondary')}</div></section>`}
    ${step === 2 ? btn('← Назад', 'connection-back', '', 'secondary') : ''}</form></section>`
}

function profilePage() {
  if (state.stage === 'guest') return companyPage()
  const user = currentUser(state)
  return `<section class="panel personal-profile"><h2>Личные данные</h2>
    <div id="form-error" class="form-error" role="alert" tabindex="-1"></div>
    <div class="confirmed-contact"><span>ФИО</span><strong class="${user.person ? '' : 'muted'}">${esc(user.person || 'Не указано')}</strong>${btn(profileEditing.person ? 'Отмена' : user.person ? 'Изменить' : 'Указать', 'profile-edit', `data-kind="person" aria-label="${profileEditing.person ? 'Отменить изменение' : 'Изменить'} ФИО" aria-expanded="${Boolean(profileEditing.person)}" aria-controls="profile-name-form"`, 'secondary small')}</div>
    ${profileEditing.person ? `<form id="profile-name-form" class="profile-name-form"><label class="field"><span class="sr-only">ФИО</span><input id="profile-name" name="person" required maxlength="100" autocomplete="name" placeholder="Фамилия Имя Отчество" value="${esc(profileNameDraft ?? user.person)}"></label><button class="btn" type="submit">Сохранить ФИО</button></form>` : ''}
    <div class="profile-contacts">${contactConfirmationPanel('email', true)}${contactConfirmationPanel('phone', true)}</div>
    <p class="note">Подтверждённые контакты изменяются в IEK ID.</p></section>
    ${canViewAccount(state) ? `<section class="panel profile-company-strip"><div><span class="note">Ваша компания</span><strong>${esc(state.company.name)}</strong></div><a class="btn secondary small" href="#company/info">Открыть компанию →</a></section>` : `<section class="panel profile-company-strip"><strong>Покупаете от имени компании?</strong><a class="btn small" href="#company/connect">${state.companyDraft.inn || state.companyDraft.step ? 'Продолжить подключение компании' : 'Подключить компанию'} →</a></section>`}`
}

function helpdeskPage() {
  return state.stage === 'guest' ? companyPage() : `<section class="panel"><span class="status">Планируется</span><h2>HelpDesk</h2><p>Здесь появятся ваши обращения в поддержку и их статусы.</p><p class="note">Раздел поддержки пока недоступен.</p></section>`
}

function companyPage() {
  if (state.role === 'employee') return employeeJoinPage()
  if (state.stage === 'guest') return empty('Войдите или зарегистрируйтесь через IEK ID', 'После входа будут доступны личные данные и заявки.', btn('Войти или зарегистрироваться →', 'login'))
  if (state.stage === 'identified') return profilePage()
  return companyInfo()
}

const verificationTitles = { user: 'Проверка представителя', company: 'Компания и связь с представителем' }

function verificationButton(kind, iconOnly = false) {
  const check = verificationStatus(state, kind)
  return `<button type="button" class="verification-button ${iconOnly ? 'icon-only' : ''}" data-action="verification-details" data-kind="${kind}" aria-haspopup="dialog" aria-label="${verificationTitles[kind]}: ${check.label}. Подробнее" title="${check.label}"><span class="verification-icon ${check.tone}" aria-hidden="true">${check.icon}</span>${iconOnly ? '' : `<span>${check.label}</span>`}</button>`
}

function verificationHeader(title, kind) {
  const check = verificationStatus(state, kind)
  return `<div class="section-head entity-head"><h2>${title}</h2><div class="entity-verification"><span class="data-caption">${kind === 'company' ? 'Компания и связь' : 'Представитель'}</span>${verificationButton(kind)}</div></div>${check.needsAction ? '<p class="verification-attention">Требуется ваше действие. Откройте статус, чтобы посмотреть причину и исправить заявку.</p>' : check.status === 'unrequested' ? '<p class="note">Проверка нужна для работы от имени компании.</p>' : ''}`
}

function showVerification(kind) {
  if (state.role === 'employee' && state.employeeVerificationRequestId) {
    modal('Проверка заявителя', `<p class="note">Заявка ${esc(state.employeeVerificationRequestId)}</p>${employeeLinkedRequest ? dataFields([[employeeLinkedRequest.automated ? 'Присоединение' : 'Решение оператора', employeeLinkedRequest.automated ? {pending:'Ожидает решения администратора',approved:'Одобрено администратором',rejected:'Отклонено администратором'}[staffRequest(state)?.status] || 'Автоматическая проверка' : {pending:'Ожидает проверки',approved:'Подтверждено',returned:'Нужно уточнение',rejected:'Отклонено'}[employeeLinkedRequest.decision]], ['Проверка контактного лица', {not_started:'Не запрошено',pending:'Ожидаем подтверждение',ready:'Подтверждено',error:'Ошибка обмена'}[employeeLinkedRequest.sync.contact]], ...(employeeLinkedRequest.comment ? [['Комментарий оператора',employeeLinkedRequest.comment,true]] : [])]) : '<p>Заявка недоступна.</p>'}`)
    return
  }
  if (state.verificationRequestId) { modal('Проверка компании и представителя', linkedVerificationPanel()); return }
  if (state.stage === 'guest' || !Object.hasOwn(verificationTitles, kind)) throw new Error('Сначала войдите через IEK ID')
  modal(verificationTitles[kind], verificationPanel(kind))
}

const reviewFieldLabels = { person: 'ФИО', position: 'Должность', email: 'Рабочий email', phone: 'Телефон пользователя', inn: 'ИНН', name: 'Название компании', kpp: 'КПП', legalAddress: 'Юридический адрес' }
function reviewValuesView(submission) {
  return dataFields(Object.entries(submission.values).map(([key, value]) => [reviewFieldLabels[key], value, ['name', 'legalAddress'].includes(key)]))
}

function reviewCorrectionFields(submission) {
  if (submission.type === 'membership') return '<p>Реквизиты компании сотрудник не меняет. Уточните основание связи в пояснении. Контактные данные исправляются в заявке на верификацию пользователя.</p>'
  return Object.entries(submission.values).map(([key, value]) => key === 'inn'
    ? `<p>ИНН: ${esc(value)} · ИНН нельзя изменить в этой заявке.</p>`
    : `<label class="field">${reviewFieldLabels[key]}<input name="${key}" value="${esc(value)}" ${['kpp', 'legalAddress'].includes(key) ? '' : 'required'} maxlength="${({ person: 100, position: 100, email: 120, phone: 30, name: 120, kpp: 9, legalAddress: 250 })[key]}" ${key === 'email' ? 'type="email"' : key === 'phone' ? 'type="tel" pattern="[+0-9()\\s\\-]{7,30}"' : key === 'kpp' ? 'pattern="[0-9]{9}" inputmode="numeric"' : ''}></label>`).join('')
}

function userDataPanel(compact = false) {
  const person = compact && state.role === 'admin' && linkedRequest && !canPurchase(state) ? linkedRequest : currentUser(state)
  if (compact) return `<section class="panel company-person" aria-label="Представитель"><h2>Представитель</h2>${dataFields([['ФИО', person.person], ['Должность', person.position || 'Не указана'], ['Почта', person.email], ['Телефон', person.phone]])}</section>`
  return `<section class="panel verification-intro" aria-label="Данные пользователя">${verificationHeader('Данные пользователя', 'user')}${dataFields([['ФИО', currentUser(state).person], ['Должность', currentUser(state).position || 'Не указана'], ['Рабочий email', currentUser(state).email], ['Телефон', currentUser(state).phone]])}<div class="context-strip"><span class="data-caption">Компания</span><strong>${state.stage === 'identified' ? 'Компания ещё не привязана' : esc(state.company.name)}</strong>${state.stage === 'identified' ? '<a class="link-btn" href="#company/connect">Подключить компанию →</a>' : `<span class="note">ИНН ${esc(state.company.inn)}</span>`}</div><details class="explanation"><summary>Как проверяются и меняются данные</summary><p>Действующие данные пользователя в магазине. Исправления заявки применяются после подтверждения; профиль во внешнем IEK ID не изменяется. Проверка пользователя независима от подтверждения связи с компанией.</p></details></section>`
}

function verificationPanel(kindFilter, demo = false) {
  if (state.role === 'admin' && state.verificationRequestId) return demo ? '<p>Решения по связанной заявке принимаются в кабинете оператора.</p>' : linkedVerificationPanel()
  if (!canViewAccount(state)) return '<section class="panel"><h2>Подключение компании</h2><p>Личный кабинет не требует проверки представителя. Для покупок от компании сначала отправьте заявку на подключение.</p><a class="btn" href="#company/connect">Подключить компанию →</a></section>'
  const checks = verificationReviews(state)
  return Object.entries(verificationTitles).filter(([kind]) => !kindFilter || kind === kindFilter).map(([kind, title]) => {
    const check = checks[kind], available = canReviewAccess(state, kind), indicator = verificationStatus(state, kind)

    return `<section class="verification-details" aria-label="${title}"><div class="section-head"><span class="status ${indicator.tone}">${indicator.icon} ${indicator.label}</span></div>
    ${!available ? `<p>${state.role === 'employee' ? 'Сначала нужно одобрение заявки администратором или принятие приглашения. Проверка пользователя не заменяет присоединение.' : 'Сначала отправьте заявку на подключение компании из личного профиля.'}</p><a class="btn secondary" href="#company/info" data-action="close">Перейти в раздел «Компания» →</a>` : `<p class="note">Попытка №${check.attempt}${check.date ? ` · обновлено ${eventDate(check.date)}` : ''}</p>
    ${check.reason ? `<div class="decision-note"><span class="data-caption">Причина решения</span><strong>${esc(check.reason)}</strong></div>` : ''}
    ${check.previousDecision ? `<p class="note">Предыдущее решение: ${reviewLabels[check.previousDecision.status]}. ${esc(check.previousDecision.reason)}</p>` : ''}
    ${check.response ? `<p><strong>Ваше пояснение:</strong> ${esc(check.response)}</p>` : ''}
    ${check.submission ? `<h3>${check.status === 'confirmed' && check.attempt > 1 ? (check.submission.type === 'membership' ? 'Проверенная связь с компанией' : 'Проверенные значения · применены в магазине') : 'Отправленные данные'}</h3>${reviewValuesView(check.submission)}` : '<p class="note">Данные предыдущей отправки недоступны. При исправлении будут показаны текущие значения.</p>'}
    <p>${check.status === 'returned' ? 'Откройте заявку, исправьте поля и отправьте повторно. До подтверждения действующие данные не меняются.' : check.status === 'rejected' ? 'Проверка завершилась отказом. Вы можете запросить повторное рассмотрение с пояснением.' : check.status === 'pending' ? 'Ожидаем решения. Повторная отправка будет доступна после завершения проверки.' : (canPurchase(state) ? 'Обе проверки подтверждены. Можно продолжить оформление.' : 'Эта проверка подтверждена. Для доступа также нужна вторая проверка.')}</p>
    ${['returned', 'rejected'].includes(check.status) ? btn(check.status === 'returned' ? 'Исправить заявку и отправить повторно' : 'Запросить повторное рассмотрение', 'access-resubmit', `data-kind="${kind}"`) : ''}
    ${demo ? `<div class="lab-card" aria-label="Пульт: ${title}"><h3>${title}</h3><p>Тестовое решение, без внешних запросов.</p><div class="actions">
    ${check.status === 'confirmed' ? btn('Начать тестовую проверку', 'access-start', `data-kind="${kind}"`, 'secondary small') : check.status === 'pending' ? `${btn('Имитировать подтверждение', 'access-result', `data-kind="${kind}" data-result="confirmed"`, 'secondary small')}${btn('Имитировать возврат на исправление', 'access-result', `data-kind="${kind}" data-result="returned"`, 'secondary small')}${btn('Имитировать отказ', 'access-result', `data-kind="${kind}" data-result="rejected"`, 'secondary small')}` : '<p>Сначала повторная подача от пользователя; затем можно имитировать новое решение.</p>'}
    </div></div>` : ''}`}</section>`
  }).join('')
}

function accessPage() {
  return companyInfo()
}

function empty(title, text, action = '<a class="btn" href="#catalog">Перейти в каталог →</a>') {
  return `<section class="empty"><h2>${title}</h2><p>${text}</p>${action}</section>`
}

function closedAccessNotice() {
  const rejected = staffRequest(state)?.status === 'rejected'
  if (!rejected && staffInvitation(state)?.status !== 'cancelled') return ''
  return `<section class="panel" role="status"><h2>${rejected ? 'Заявка отклонена администратором' : 'Приглашение отменено администратором'}</h2><p>${esc(rejected ? staffRequest(state).email : staffInvitation(state).email)}</p><p>${rejected ? 'По этой заявке доступ не предоставлен.' : 'Это приглашение больше нельзя принять.'} Проверка представителя не меняется и сама по себе не открывает доступ.</p><p>Вы можете подать новую заявку или получить новое приглашение.</p></section>`
}

function employeeJoinPage() {
  if (state.adminUser && employeeMember(state)) return `<section class="panel">${verificationHeader('Ваш доступ к компании', 'company')}<p><strong>${esc(state.employee.person)}</strong> · ${esc(state.employee.email)}</p><p>Ваша роль: <strong>Сотрудник</strong>. Администратор компании: <strong>${esc(administrator(state).person)}</strong> · ${esc(administrator(state).email)}.</p><p>Управление сотрудниками и передача прав доступны только действующему администратору. Проверка представителя: ${state.employeeVerified ? 'пройдена' : 'не пройдена'}.</p></section>`
  if (staffInvitation(state) && ['pending', 'accepted'].includes(staffInvitation(state).status)) return invitationPage()
  const request = ['removed', 'rejected'].includes(staffRequest(state)?.status) ? null : staffRequest(state)
  const approved = request?.status === 'approved'
  const automated = employeeLinkedRequest?.automated
  const intro = `${closedAccessNotice()}<section class="panel"><div class="eyebrow">Подключение компании</div>${verificationHeader('Проверка заявителя', 'company')}<p><strong>${esc(state.employee.person)}</strong>${state.employee.position ? ` · ${esc(state.employee.position)}` : ''} · ${esc(state.employee.email)}</p><p>${automated ? 'Контактное лицо и связь с компанией проходят автоматическую проверку. Доступ предоставит администратор компании.' : 'Оператор проверит ваши полномочия. Если у компании уже есть администратор, он отдельно решит, предоставить ли вам доступ.'}</p></section>`
  if (request) return `${intro}<section class="panel"><div class="section-head"><h2>Заявка на присоединение</h2><span class="status ${approved ? 'green' : 'yellow'}">${approved ? 'Одобрена администратором' : 'Ожидает решения администратора'}</span></div><p>${esc(state.company.name)} · ИНН ${esc(request.inn)}</p><p>${automated ? 'Данные направлены на проверку автоматически.' : 'Оператор подтвердил заявку.'} ${approved ? 'Доступ к компании зависит от завершения проверки.' : 'Теперь решение принимает администратор компании.'}</p>${approved ? '<a class="btn" href="#catalog">Перейти в каталог →</a>' : ''}</section>`
  if (staffRequest(state)?.status === 'rejected' && employeeLinkedRequest?.decision === 'approved') return `${intro}<section class="panel"><h2>Администратор отклонил присоединение</h2><p>${automated ? 'Автоматическая проверка сохранена.' : 'Проверка оператора сохранена.'} Вы можете повторно запросить доступ; новое решение снова примет администратор.</p>${btn('Повторно запросить доступ', 'retry-membership')}</section>`
  const activeCheck = employeeLinkedRequest && !['returned','rejected'].includes(employeeLinkedRequest.decision)
  if (activeCheck) return `${intro}<section class="panel"><div class="section-head"><h2>Заявка ${esc(employeeLinkedRequest.id)}</h2><span class="status yellow">${automated ? 'Ожидает решения администратора' : employeeLinkedRequest.decision === 'approved' ? 'Оператор подтвердил' : 'Ожидает проверки оператора'}</span></div><p>${automated ? 'Данные проверяются автоматически. Доступ откроется после решения администратора и завершения проверки.' : 'До подтверждения оператора и решения о роли доступ к компании закрыт.'}</p></section>`
  return `${intro}<div class="two-col"><section class="panel">${employeeLinkedRequest ? `<p role="status">${employeeLinkedRequest.decision === 'returned' ? 'Оператор просит уточнить данные.' : 'Оператор отклонил заявку.'} ${esc(employeeLinkedRequest.comment)}</p>` : ''}<form id="join-find-form"><h2>Найти компанию</h2><label class="field">ИНН компании<input name="inn" required inputmode="numeric" pattern="[0-9]{10}|[0-9]{12}" maxlength="12" value="${esc(state.company.inn)}"><small>Тестовый ИНН: ${esc(state.company.inn)}.</small></label><button class="btn secondary" type="submit">Найти по ИНН</button></form>${state.companyFound ? `<div class="rule"></div><form id="join-request-form"><h3>${esc(state.company.name)}</h3><p>Заявитель: ${esc(state.employee.person)}<br>Контакты IEK ID: ${esc(state.employee.email)} · ${esc(state.employee.phone)}</p><label class="field">Должность<input name="position" required maxlength="100" value="${esc(state.employee.position)}"></label><button class="btn" type="submit">${state.claimWinnerId || state.adminStage === 'verified' ? 'Запросить присоединение' : 'Отправить на проверку оператору'}</button></form>` : ''}<div class="form-error" id="form-error" role="alert"></div></section><aside class="panel"><h3>Что произойдёт</h3><ol><li>${state.claimWinnerId || state.adminStage === 'verified' ? 'Сервис направит данные контактного лица и связь с компанией на проверку.' : 'Оператор проверит заявителя. Первый подтверждённый заявитель станет администратором.'}</li><li>Администратор компании примет или отклонит присоединение.</li></ol></aside></div>`
}

function staffList(manage) {
  return staffDirectory(state).map(member => `<section class="employee-card" aria-label="Участник ${esc(member.person)}"><div class="section-head"><div><h3>${esc(member.person)}</h3></div><span class="status">${member.role === 'admin' ? 'Администратор' : 'Сотрудник'}</span></div>${dataFields([['Должность', member.position], ['Рабочий email', member.email]])}${manage && member.role === 'employee' ? `<div class="actions">${btn('Редактировать', 'edit-employee', `data-email="${esc(member.email)}"`, 'secondary small')}${btn('Удалить из компании', 'review-remove-employee', `data-email="${esc(member.email)}"`, 'secondary small danger')}${btn('Передать права администратора', 'review-transfer-admin', `data-email="${esc(member.email)}" ${member.email !== state.employee.email || !state.employeeVerified ? 'disabled' : ''}`, 'secondary small')}</div><p class="note">${member.email === state.employee.email && state.employeeVerified ? 'Доступна передача администрирования этому сотруднику.' : 'Для передачи нужна отдельная верификация уже присоединённого сотрудника.'}</p>` : ''}</section>`).join('')
}

function teamPage() {
  if (!canViewStaff(state)) return empty('Список сотрудников пока недоступен', 'Нужны вход и присоединение к компании. Отдельная проверка представителя для просмотра списка не требуется.', '<a class="btn" href="#company/info">Найти компанию →</a>')
  const manage = canManageStaff(state)
  if (!manage) teamTab = 'members'
  const tabs = [['members', 'Сотрудники'], ['invitations', 'Приглашения'], ['history', 'Журнал действий']]
  const contents = { members: staffMembersPanel(manage), invitations: manage ? `${staffRequestsPanel()}${invitePanel()}` : '', history: manage ? staffHistoryPanel() : '' }
  return `<div class="team-tabs" role="tablist" aria-label="Разделы сотрудников">${tabs.map(([key, label]) => `<button type="button" id="team-tab-${key}" role="tab" data-action="team-tab" data-tab="${key}" aria-controls="team-panel-${key}" aria-selected="${teamTab === key}" tabindex="${teamTab === key ? '0' : '-1'}" ${!manage && key !== 'members' ? 'disabled title="Доступно только подтверждённому администратору"' : ''}>${label}</button>`).join('')}</div>
  ${!manage ? '<p class="note team-access-note">Список сотрудников доступен для просмотра. Приглашения, заявки и журнал — только для администратора с подтверждённым доступом.</p>' : ''}
  ${tabs.map(([key]) => `<div id="team-panel-${key}" class="team-tab-panel" role="tabpanel" aria-labelledby="team-tab-${key}" tabindex="0" ${teamTab !== key ? 'hidden' : ''}>${contents[key]}</div>`).join('')}`
}

function selectTeamTab(tab) {
  if (!['members', 'invitations', 'history'].includes(tab) || !canViewStaff(state) || (tab !== 'members' && !canManageStaff(state))) throw new Error('Раздел сотрудников недоступен')
  teamTab = tab
  for (const button of app.querySelectorAll('[data-action="team-tab"]')) {
    const selected = button.dataset.tab === tab
    button.setAttribute('aria-selected', String(selected))
    button.tabIndex = selected ? 0 : -1
    document.getElementById(button.getAttribute('aria-controls')).hidden = !selected
  }
}

function staffMembersPanel(manage) {
  const removed = staffRequest(state)?.status === 'removed' || staffInvitation(state)?.status === 'removed'
  return `<section class="panel"><div class="section-head"><h2>Сотрудники компании</h2><span class="status">Сотрудники: ${state.members.length} / 3</span></div>
    <p>Администратор: ${esc(administrator(state).person)}.</p>
    ${staffList(manage)}
    ${manage && removed ? '<p role="status">Сотрудник удалён из компании. Его заказы и документы сохранены. Новая заявка или приглашение — на вкладке «Приглашения».</p>' : ''}
    <p class="note">${manage ? ` Администратор может изменить ФИО и должность сотрудника.` : 'Управление сотрудниками доступно только администратору компании.'}</p></section>`
}

function staffRequestsPanel() {
  if (!canManageStaff(state)) return ''
  const request = staffRequest(state)?.status === 'removed' ? null : staffRequest(state)
  const applicantCheck = employeeLinkedRequest?.automated
    ? `Данные проверяются автоматически. Подтверждение контакта: ${state.employeeVerified ? 'получено' : 'ожидается'}`
    : employeeLinkedRequest?.decision === 'approved'
    ? `Оператор подтвердил заявителя. Подтверждение контакта: ${state.employeeVerified ? 'получено' : 'ожидается'}`
    : `Проверка представителя: ${state.employeeVerified ? 'пройдена' : 'не пройдена'}`
  return `<section class="panel"><h2>Заявки на присоединение</h2>
    ${request ? `<h3>Заявка ${request.id}</h3>${dataFields([['ФИО', request.person], ['Должность', request.position], ['Рабочий email', request.email], ['ИНН компании', request.inn]])}<span class="status ${request.status === 'approved' ? 'green' : 'yellow'}">${request.status === 'approved' ? 'Одобрена' : request.status === 'rejected' ? 'Отклонена администратором' : 'Ожидает рассмотрения'}</span><p>${applicantCheck}. Данные заявки зафиксированы при подаче.</p>${request.status === 'pending' ? `<div class="actions">${btn('Рассмотреть заявку', 'review-membership', `data-id="${request.id}"`)}${btn('Отклонить заявку', 'review-reject-membership', `data-id="${request.id}"`, 'secondary danger')}</div>` : request.status === 'rejected' ? `<p>Доступ не предоставлен. Можно рассмотреть новую заявку или создать приглашение.</p>` : ''}` : '<p>Заявок на присоединение пока нет.</p>'}</section>`
}

function staffHistoryPanel() {
  if (!canManageStaff(state)) return ''
  const history = staffHistory(state)
  const events = staffHistory(state, staffFilters)
  const people = new Map()
  for (const event of history) for (const person of [event.actor, event.subject]) {
    if (!people.get(person.email)) people.set(person.email, person.person)
  }
  const filters = `<div class="field-row"><label class="field">Тип действия<select id="staff-action"><option value="">Все действия</option>${Object.entries(staffEventLabels).map(([key, label]) => `<option value="${key}" ${staffFilters.action === key ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select></label><label class="field">Сотрудник<select id="staff-person"><option value="">Все сотрудники</option>${[...people].sort(([a], [b]) => a.localeCompare(b)).map(([email, name]) => `<option value="${esc(email)}" ${staffFilters.email === email ? 'selected' : ''}>${name ? `${esc(name)} · ` : ''}${esc(email)}</option>`).join('')}</select></label></div><p class="note">Сотрудник — автор или адресат действия, включая удалённых и приглашённых.</p><div class="section-head"><span role="status">Показано: ${events.length} из ${history.length}</span>${btn('Сбросить фильтры', 'reset-staff-filters', '', 'secondary small')}</div>`
  return `<section id="staff-history-panel" class="panel" aria-labelledby="staff-history-title"><div class="section-head"><h2 id="staff-history-title">Журнал действий</h2><span class="status">Записей: ${history.length}</span></div><p class="note">Время указано по Москве.</p><p class="note">Журнал доступен администратору компании.</p>${filters}${events.length ? `<div class="staff-history" tabindex="0" role="region" aria-label="Записи журнала действий"><ol>${events.map(event => `<li><div class="section-head"><strong>${esc(staffEventLabels[event.action])}</strong><time datetime="${esc(event.date)}">${eventDate(event.date)}</time></div><p><span class="muted">Кто:</span> ${esc(event.actor.person)} · ${esc(event.actor.email)} · ${event.actor.role === 'admin' ? 'Администратор' : 'Сотрудник / заявитель'}</p><p><span class="muted">В отношении:</span> ${event.subject.person ? `${esc(event.subject.person)} · ` : ''}${esc(event.subject.email)}</p><span class="note">Запись №${event.id} · данные на момент действия</span></li>`).join('')}</ol></div>` : history.length ? '<p>По выбранным фильтрам ничего не найдено. Измените условия или сбросьте фильтры.</p>' : '<p>Записей пока нет. Пригласите сотрудника или рассмотрите новую заявку — здесь появится действие, его автор и время.</p>'}</section>`
}

function refreshStaffHistory(focusId = 'staff-action') {
  document.querySelector('#staff-history-panel').outerHTML = staffHistoryPanel()
  document.getElementById(focusId).focus({ preventScroll: true })
}

function invitePanel() {
  if (!canManageStaff(state)) return ''
  const invitation = ['removed', 'cancelled'].includes(staffInvitation(state)?.status) ? null : staffInvitation(state)
  if (invitation) return `<section class="panel"><h2>Приглашение по почте</h2><p>${esc(invitation.email)} · <span class="status ${invitation.status === 'accepted' ? 'green' : 'yellow'}">${invitation.status === 'accepted' ? 'Принято' : 'Ожидает принятия'}</span></p><p>Приглашение ожидает ответа. Чтобы посмотреть экран получателя, откройте его через пульт демонстрации.</p><div class="actions">${btn('Открыть письмо как получатель · демо', 'preview-invitation')}${invitation.status === 'pending' ? btn('Отменить приглашение', 'review-cancel-invitation', `data-id="${invitation.id}"`, 'secondary danger') : ''}</div>${invitation.status === 'pending' ? `` : ''}<p>Принятие не выполняет проверку пользователя.</p></section>`
  if ((staffRequest(state) && !['removed', 'rejected'].includes(staffRequest(state).status)) || state.members.length) return `<section class="panel"><h3>Приглашение по почте</h3><p>У компании уже есть сотрудник или активная заявка. Приглашение будет доступно после их обработки.</p></section>`
  return `${staffInvitation(state)?.status === 'cancelled' ? closedAccessNotice() : ''}<section class="panel"><form id="invite-form"><h2>Пригласить сотрудника</h2><p>Прямое добавление: существующий IEK ID и почта в домене администратора.</p><label class="field">Рабочий email<input name="email" type="email" required maxlength="120" value="${esc(state.employee.email.split('@')[0])}@${esc(administrator(state).email.split('@')[1])}"><small>Получатель — ${esc(state.employee.person)}. Используйте только вымышленные данные.</small></label><label class="check"><input type="checkbox" name="hasIekId"><span>Имитировать результат проверки: IEK ID получателя существует. Это не проверка представителя.</span></label><div class="form-error" id="form-error" role="alert"></div><button class="btn" type="submit">Создать приглашение</button></form></section>`
}

function invitationPage() {
  const invitation = staffInvitation(state)
  const accepted = invitation.status === 'accepted'
  return `<section class="panel"><div class="eyebrow">Приглашение сотруднику</div>${verificationHeader(accepted ? 'Приглашение принято' : 'Вас приглашают в ЛК компании', 'company')}<p>${esc(state.company.name)} · ИНН ${esc(invitation.inn)}</p><p>Получатель: <strong>${esc(invitation.email)}</strong><br>Текущий пользователь: ${esc(state.employee.email)}</p><p>Принятие подтверждает связь с компанией. Проверка представителя остаётся отдельной.</p><div class="actions">${accepted ? '<a class="btn" href="#company/info">Информация о компании →</a>' : invitation.email === state.employee.email ? btn('Принять приглашение', 'accept-invitation') : btn('Войти как получатель · демо', 'preview-invitation')}</div><p class="note">${accepted ? (state.employeeVerified ? 'Пользователь проверен: доступны спеццены и отправка заказа менеджеру.' : 'Сейчас доступны РРЦ и наполнение корзины. Для доступа к покупкам потребуется проверка пользователя.') : 'До принятия нет доступа к заказам и документам, даже если пользователь уже верифицирован.'}</p></section>`
}

function purchaseAccessPanel() {
  const ready = canPurchase(state), contactsReady = contactsVerified(state), checks = verificationReviews(state)
  const linked = state.role === 'admin' && Boolean(state.verificationRequestId), item = linkedRequest
  const corrections = Object.entries(checks).filter(([, check]) => ['returned', 'rejected'].includes(check.status))
  let title = 'Компания на проверке', description = 'Проверяем реквизиты компании и полномочия представителя.', action = '', reason = ''
  if (ready) { title = 'Компания подтверждена'; description = '' }
  else if (linked && bridgeWarning) { title = 'Не удалось обновить статус'; description = 'Попробуйте обновить страницу. Сохранённые данные заявки не изменены.' }
  else if (linked && !item) { title = 'Нужно отправить заявку повторно'; description = 'Предыдущая заявка недоступна. Проверьте сведения и отправьте их ещё раз.'; if (state.role === 'admin') action = btn('Проверить и отправить заявку', 'linked-edit') }
  else if (linked && ['returned', 'rejected'].includes(item.decision)) {
    title = item.decision === 'returned' ? 'Требуются исправления' : 'Заявка отклонена'
    description = 'Уточните данные и отправьте заявку на повторную проверку.'
    reason = item.comment ? `<p class="company-check-reason"><strong>Причина:</strong> ${esc(item.comment)}</p>` : ''
    if (state.role === 'admin') action = btn('Исправить представителя', 'linked-edit') + btn('Исправить реквизиты', 'linked-edit', 'data-step="1"', 'secondary')
  } else if (!linked && corrections.length) {
    title = corrections.some(([, check]) => check.status === 'returned') ? 'Требуются исправления' : 'Заявка отклонена'
    description = 'Уточните данные и отправьте заявку на повторную проверку.'
    reason = corrections.map(([kind, check]) => `<p class="company-check-reason"><strong>${kind === 'company' ? 'Компания' : 'Представитель'}:</strong> ${esc(check.reason || reviewLabels[check.status])}</p>`).join('')
    action = corrections.filter(([kind]) => canReviewAccess(state, kind)).map(([kind]) => btn(kind === 'company' ? 'Исправить данные компании' : 'Исправить данные представителя', 'access-resubmit', `data-kind="${kind}"`, 'small')).join('')
  } else if (linked && item.decision === 'approved') {
    title = 'Завершаем подключение'
    description = Object.values(item.sync).includes('error') ? 'Возникла задержка подтверждения. Оператор повторит запрос; от вас действий не требуется.' : 'Заявка одобрена. Ожидаем подтверждения компании и контактного лица.'
    if (Object.values(item.sync).every(value => value === 'ready')) description = 'Ожидаем завершения проверки вашего доступа к компании.'
  }
  const contactAction = !contactsReady ? `<p class="note">Для покупок подтвердите недостающие контакты IEK ID.</p><a class="btn secondary small" href="#profile">Подтвердить контакты →</a>` : ''
  if (!ready && !contactsReady && !action && !bridgeWarning) { title = 'Подтвердите контакты'; description = 'Подтвердите почту и телефон в личных данных, чтобы оформлять заказы.' }
  return `<section class="panel company-check"><div class="section-head"><h2>${title}</h2><span class="status ${ready ? 'green' : 'yellow'}">${ready ? 'Покупки доступны' : 'Покупки пока недоступны'}</span></div>${description ? `<p>${description}</p>` : ''}${reason}${action ? `<div class="actions">${action}</div>` : ''}${contactAction}
    <details id="company-check-details" class="explanation"><summary>Подробнее о проверке</summary>${linked ? linkedVerificationPanel() : `<div class="company-check-stages">${Object.entries(verificationTitles).map(([kind, label]) => `<section><h3>${label}</h3>${verificationPanel(kind)}</section>`).join('')}</div>`}</details></section>`
}

function companyInfo() {
  if (!canViewAccount(state)) return state.role === 'employee' ? employeeJoinPage() : profilePage()
  return `${purchaseAccessPanel()}<div class="company-records">${companyDetailsPanel(true)}${userDataPanel(true)}</div>`
}

function visibleCompanyOrders() {
  try { return companyPurchaseOrders(window.localStorage,state) }
  catch { storageWarning='Не удалось прочитать связанные заказы. Данные не изменены; обновите страницу.'; return [] }
}

function inquiryOrdersPanel(item) {
  if (!item.hasLinkedOrders) return '<section class="panel inquiry-related-orders"><h2>Связанные заказы</h2><p class="note">Заказ пока не создан. Товары сохранены в заявке.</p></section>'
  const connected = canViewAccount(state)
  return `<section class="panel inquiry-related-orders"><h2>Связанные заказы</h2>${item.orders.length ? item.orders.map(order=>`<div class="inquiry-related-order"><div><strong>Заказ ${esc(order.id)}</strong><small>${esc(order.company.name)} · ${money(order.total)} · ${order.paid ? 'Оплата подтверждена' : 'Не оплачен'}</small></div><div class="actions"><a class="btn secondary small" href="#order/${esc(order.id)}">Открыть заказ</a>${order.invoice ? documentLink(order,'invoice','Счёт','secondary small') : '<span class="note">Счёт не опубликован</span>'}${order.agreement ? documentLink(order,'agreement','Соглашение','secondary small') : ''}</div></div>`).join('') : `<p><strong>По вашей заявке есть заказ.</strong> Заказ и документы будут доступны после подтверждения вашего доступа к компании-покупателю.</p><a class="btn" href="#${connected ? 'company/info' : 'company/connect'}">${connected ? 'Проверить доступ к компании' : 'Подключить компанию'} →</a>`}</section>`
}

function documentsPage() {
  const documents = visibleCompanyOrders().flatMap(order => ['invoice', 'agreement'].filter(kind => order[kind]).map(kind => ({ order, kind })))
  return `<section class="panel"><h2>Документы компании</h2><p>Опубликованные документы по заказам. Оплата сама по себе не создаёт соглашение.</p>${documents.length ? documents.map(({ order, kind }) => `<div class="document"><div class="document-icon">Док.</div><div><strong>${kind === 'invoice' ? 'Счёт на оплату' : 'Лицензионное соглашение'}</strong>${dataFields([['Заказ', order.id], ['Дата заказа', date(order.date)]])}</div>${btn('Открыть образец', 'document', `data-id="${order.id}" data-kind="${kind}"`, 'secondary small')}</div>`).join('') : '<p class="note">Опубликованных документов пока нет.</p>'}</section>`
}

function licensesPage() {
  const groups = softwareOrders({...state,orders:visibleCompanyOrders()})
  const labels = { unpaid: 'Заказ не оплачен', unpublished: 'Соглашение не опубликовано', published: 'Соглашение доступно' }
  const intro = `<section class="panel"><div class="eyebrow">Лицензии · данные заказов</div><h2>ПО по заказам и соглашения</h2><p>${esc(state.company.name)} · сведения компании, не только текущего пользователя.</p><p class="note">Здесь состав заказанного ПО и опубликованные соглашения. Данные о ключах, сроках действия и активации здесь не отображаются.</p><details class="explanation"><summary>Как читать эти данные</summary><p>Количество показывает заказанные единицы, а не выданные лицензии.</p></details></section>`
  if (!groups.length) return `${intro}${empty('Нет заказанного ПО', 'В истории компании пока нет заказов. Лицензии, приобретённые вне магазина, здесь не отображаются.')}`
  return `${intro}<div class="software-orders">${groups.map(({ order, status }) => `<section class="panel software-order" aria-label="ПО по заказу ${order.id}"><div class="section-head"><div><h3>Заказ ${order.id}</h3>${dataFields([['Дата заказа', date(order.date)], ['Автор', order.author.person]])}</div><span class="status ${status === 'published' ? 'green' : 'yellow'}">${labels[status]}</span></div><ul class="software-lines">${order.lines.map(line => `<li><div><strong>${esc(line.name)} ${esc(line.edition)}</strong>${dataFields(lineFields(line))}</div><span class="small">Заказано: ${line.quantity} шт.</span></li>`).join('')}</ul><div class="agreement-block"><div><h3>Лицензионное соглашение</h3><p>${status === 'unpaid' ? 'Оплата не подтверждена. Соглашение пока недоступно; публикация выполняется отдельно после оплаты.' : status === 'unpublished' ? 'Оплата подтверждена. Файл соглашения ещё не опубликован ответственным сотрудником.' : 'Доступен демонстрационный образец на весь заказ. Это не ключ и не подтверждение активации ПО.'}</p></div>${status === 'published' ? btn('Открыть соглашение', 'document', `data-id="${order.id}" data-kind="agreement"`, 'secondary small') : '<span class="small muted">Файл недоступен</span>'}</div><div class="help-line"><a href="#order/${order.id}">Перейти к заказу ${order.id} →</a></div></section>`).join('')}</div>`
}

function accountPage(section = 'info') {
  if (section === 'connect' && state.verificationRequestId && Object.keys(state.companyDraft).length) return companyRegistrationForm()
  if (section === 'connect') return canViewAccount(state) ? companyInfo() : state.role === 'employee' ? employeeJoinPage() : companyRegistrationForm()
  if (!canViewAccount(state)) return state.role === 'employee' ? employeeJoinPage() : profilePage()
  if (section === 'info') return companyInfo()
  if (section === 'access') return accessPage()
  if (section === 'team' && (canPurchase(state) || canManageStaff(state))) return teamPage()
  if (!canPurchase(state)) return `${empty('Нужно подтверждение доступа', 'Документы и лицензии компании закрыты до подтверждения пользователя и его связи с компанией.', gateAction())}`
  if (section === 'documents') return documentsPage()
  if (section === 'licenses') return licensesPage()
  return companyInfo()
}

function accountLayout(content, active) {
  const corporate = canViewAccount(state)
  const links = [['profile', 'Личные данные'], ...(corporate ? [['company/info', 'Компания', true], ...((canPurchase(state) || canManageStaff(state)) ? [['company/team', 'Сотрудники']] : [])] : []), [canPurchase(state) ? 'orders' : 'inquiries', 'Заказы', true], ...(corporate && canPurchase(state) ? [['company/documents', 'Документы'], ['company/licenses', 'Лицензии']] : []), ['helpdesk', 'HelpDesk', true]]
  return `<div class="account-layout"><aside class="account-side"><nav aria-label="Разделы личного кабинета">${links.map(([href, label, group]) => `<div class="account-nav-item${group ? ' group-start' : ''}"><a href="#${href}" ${active === href ? 'aria-current="page"' : ''}>${label}${href === 'helpdesk' ? ' <small>Скоро</small>' : ''}</a></div>`).join('')}</nav></aside><div class="account-content">${content}</div></div>`
}

function itemsView(lines, editable = false) {
  const showPrices = access(state.stage).prices
  return lines.map(item => `<div class="item compact-item"><div class="item-info"><h3>${esc(item.name)} ${esc(item.edition)}</h3><p class="item-variant">${esc(lineVariant(item))}</p><span class="note">${item.pilot ? 'Лицензия без права возврата' : item.sourceCatalog ? 'Прайс 2026' : 'Сохранённая комплектация'}</span><br><span class="receiving-tag">${item.physical ? 'Ключ курьером в руки' : 'Код по email'}</span><details class="item-specs"><summary>Артикулы и комплектация</summary>${dataFields([['Артикул ПО', item.sku], ...(item.keySku ? [...(item.pilot && item.keySku === 'AUTO' ? [['Состав ключей', pilotKeySummary(item, item.quantity)], ['Ключей', item.keyQuantity]] : [['Артикул ключа', item.keySku], ['Ключей', item.keyQuantity ?? item.quantity], ...(showPrices ? [['Цена одного ключа без скидки', money(item.keyRrp)]] : [])]), ...(item.pilot ? [['Виртуализация', item.virtualized ? 'Да' : 'Нет']] : [])] : [])])}</details></div>${editable ? `<div class="quantity"><button type="button" data-action="qty-minus" data-id="${item.id}" aria-label="Уменьшить количество ${esc(item.sku)}" ${item.quantity <= 1 ? 'disabled' : ''}>−</button><input type="number" min="1" max="99" step="1" data-quantity="${item.id}" value="${item.quantity}" aria-label="Количество ${esc(item.sku)}"><button type="button" data-action="qty-plus" data-id="${item.id}" aria-label="Увеличить количество ${esc(item.sku)}" ${item.quantity >= 99 ? 'disabled' : ''}>+</button></div>` : `<span class="item-quantity">${item.quantity} шт.</span>`}<div class="item-price">${showPrices ? `<strong>${money(item.total)}</strong><small>${item.pilot ? `${money(item.unit)} / лицензия + ${item.keyQuantity} ${keyWord(item.keyQuantity)}` : `${money(item.unit)} / комплект`}</small>` : '<small>Цена после входа</small>'}${editable ? `<button type="button" class="remove" data-action="remove" data-id="${item.id}" aria-label="Удалить ${esc(item.sku)}">Удалить</button>` : ''}</div></div>`).join('')
}

function lineFields(line) {
  return [
    ['Релиз / версия', line.version || (line.sourceCatalog ? 'В прайсе не указан' : 'Не указана')],
    ...(line.sourceCatalog ? [['Параметры', line.parameterText]] : [['Точки ввода-вывода', line.capacity]]),
    ['Артикул ПО', line.sku], ['Защита', line.protectionName || 'Программная активация кодом'],
    ...(line.keySku ? line.pilot && line.keySku === 'AUTO' ? [['Состав ключей', pilotKeySummary(line, line.quantity)], ['Количество ключей', line.keyQuantity]] : [['Артикул ключа', line.keySku], ['Количество ключей', line.keyQuantity ?? line.quantity]] : []),
    ...(line.pilot ? [['Виртуализация', line.virtualized ? 'Да' : 'Нет']] : [])
  ]
}

function pricingNote(lines) {
  return lines.some(line => line.sourceCatalog)
    ? 'Цены по прайсу 2026 без скидки компании. Стоимость сохранённых комплектаций может отличаться.'
    : 'Стоимость этой комплектации приведена для демонстрации.'
}

function receivingList(lines) {
  return `<ul class="receiving-items">${lines.map(line => `<li><span>${esc(line.name)} ${esc(line.edition)} · ${esc(line.sourceCatalog ? line.parameterText : line.version || 'Версия не указана')}<small>${esc(line.protectionName || 'Программная активация кодом')}</small></span><strong>${line.pilot ? `${line.keyQuantity} ${keyWord(line.keyQuantity)} для ${line.quantity} лицензий` : `${line.quantity} шт.`}</strong></li>`).join('')}</ul>`
}

function chosenDelivery(lines) {
  return allowedDelivery(lines)[0]
}

function receivingPanel(lines) {
  const groups = receivingGroups(lines)
  return `<input type="hidden" name="delivery" value="${chosenDelivery(lines)}">
  ${groups.courier.length ? `<section class="receiving-group" aria-label="Ключи курьером в руки"><h3>Ключи курьером в руки</h3>${receivingList(groups.courier)}<p>Стоимость: ${money(deliveryCost('courier'))}</p>${btn('Скопировать контакты автора', 'copy-author-contacts', '', 'secondary small')}<div class="field-row"><label class="field">Получатель<input name="recipient" required maxlength="250" value="${esc(checkout.recipient ?? currentUser(state).person)}"></label><label class="field">Телефон получателя<input name="phone" type="tel" required maxlength="30" value="${esc(checkout.phone)}" placeholder="+7 000 000-00-00"></label></div>${state.company.legalAddress ? btn('Скопировать юридический адрес', 'copy-legal-address', '', 'secondary small') : '<p class="note">Юридический адрес компании не указан — заполните адрес получателя.</p>'}<label class="field">Адрес доставки<input name="address" required maxlength="250" value="${esc(checkout.address)}" placeholder="Только вымышленный адрес"></label></section>` : ''}
  ${groups.email.length ? `<section class="receiving-group" aria-label="Коды по email"><h3>Коды по email</h3>${receivingList(groups.email)}<p>Стоимость: 0 ₽</p>${btn('Использовать email автора', 'copy-author-email', '', 'secondary small')}<label class="field">Email получения кодов<input type="email" name="email" required maxlength="250" value="${esc(checkout.email ?? currentUser(state).email)}"></label><p class="note">По умолчанию — email автора. Можно указать другого получателя кодов.</p></section>` : ''}
  <p class="note">Способы получения определяются составом заказа. Получателей укажите для обработки заказа.</p>`
}

function summary(lines, action = '', receiving = false) {
  const base = lines.reduce((sum, item) => sum + (item.pilot ? item.total : item.rrp * item.quantity), 0)
  const method = chosenDelivery(lines), fee = deliveryCost(method)
  return `<aside class="panel summary"><h3>${receiving ? 'Итого к отправке' : 'Итого по корзине'}</h3><div class="summary-row"><span>${lines.some(item => item.sourceCatalog) ? 'Товары по прайсу' : 'Товары по РРЦ'}</span><span>${money(base)}</span></div>${base > total(lines) ? `<div class="summary-row"><span>Скидка на ПО</span><span>−${money(base - total(lines))}</span></div>` : ''}<div class="summary-row"><span>Товары ${base > total(lines) ? 'со скидкой' : ''}</span><span>${money(total(lines))}</span></div><div class="summary-row"><span>${deliveryMethods[method]}</span><span>${money(fee)}</span></div>${method === 'courier' && receivingGroups(lines).email.length ? '<div class="summary-row"><span>Коды по email</span><span>0 ₽</span></div>' : ''}<div class="summary-row"><span>НДС</span><span>Не начислен</span></div><div class="summary-total"><span>Итого</span><strong>${money(total(lines) + fee)}</strong></div><p class="note">Доставка уже включена.</p>${action}<p class="small">Заказ поступит на ручную обработку. Онлайн-оплаты нет.</p><p class="note">${pricingNote(lines)}</p></aside>`
}

function cartInquiryNotice() {
  try {
    const item=findCartInquiry(window.localStorage,state)
    return item ? `<div class="cart-inquiry-sent"><strong>✓ Заявка уже отправлена</strong><p class="note">${date(item.date)} · ${inquiryStatusLabels[item.status]}</p><a class="btn secondary full" href="#inquiry/${esc(item.id)}">Открыть заявку →</a></div>` : ''
  } catch {
    return '<p class="notice" role="alert">Не удалось проверить отправленные заявки. Обновите страницу перед повторной отправкой.</p>'
  }
}

function cartPage() {
  if (!state.cart.length) return empty('В корзине пока нет товаров', 'Выберите ПО и комплектацию в каталоге.')
  const lines = cartLines(state), ready = canPurchase(state), fee = deliveryCost(chosenDelivery(lines))
  if (state.stage === 'guest') return `<div class="cart-layout"><section class="panel cart-products"><h2>Товары в корзине</h2>${itemsView(lines,true)}<a class="cart-back" href="#catalog">← Продолжить выбор</a></section><aside class="panel cart-total"><h2>Ваш выбор сохранён</h2><div class="summary-total"><span>Сумма товаров</span><strong>${money(total(lines))}</strong></div><p>Цены видны без входа. Войдите или зарегистрируйтесь через IEK ID, чтобы продолжить покупку. Товары и количество останутся в корзине.</p>${btn('Войти или зарегистрироваться', 'login', '', 'full')}</aside></div>`
  const sentNotice=cartInquiryNotice()
  return `<div class="cart-layout"><section class="panel cart-products"><div class="section-head"><h2>Товары в корзине</h2><span class="status">${lines.length} поз.</span></div>${itemsView(lines,true)}<a class="cart-back" href="#catalog">← Продолжить выбор</a></section>
    <aside class="panel cart-total"><h2>Итого</h2><div class="summary-row"><span>Товары</span><strong>${money(total(lines))}</strong></div>${fee ? `<div class="summary-row"><span>Доставка ключей</span><strong>${money(fee)}</strong></div>` : '<p class="note">Электронное получение · бесплатно</p>'}<div class="summary-total"><span>Итого</span><strong>${money(total(lines)+fee)}</strong></div>
    ${ready ? `<a class="btn full" href="#checkout">Оформить заказ →</a>${sentNotice}` : `${sentNotice || `<a class="btn full" href="#prepare">Отправить заявку менеджеру →</a><p class="note">Без реквизитов компании. Менеджер свяжется с вами и поможет с покупкой.</p>`}<div class="cart-order-option"><strong>Хотите оформить заказ самостоятельно?</strong><p class="note">${state.company ? 'Для оформления дождитесь проверки компании и подтвердите контакты в профиле.' : 'Подключите компанию и подтвердите данные представителя.'}</p><a class="btn secondary full" href="#${state.company ? 'company/info' : 'company/connect'}">${state.company ? 'Проверить статус компании' : 'Подключить компанию'}</a></div>`}
    ${ready ? '' : '<p class="note">Предварительная сумма. Условия покупки уточнит менеджер.</p>'}</aside></div>`
}

function orderParties(company, author, saved = false, expanded = false) {
  return `<section class="panel order-parties"><h2>${saved ? 'Компания и автор на момент заказа' : 'Покупатель и автор заказа'}</h2><div class="party-summary"><div><span class="data-caption">Компания-покупатель</span><strong>${esc(company.name)}</strong><span class="note">ИНН ${esc(company.inn)}</span></div><div><span class="data-caption">Автор заказа</span><strong>${esc(author.person)}</strong><span class="note">${esc(author.email)}</span></div></div><details class="explanation" ${expanded ? 'open' : ''}><summary>Реквизиты и контакты полностью</summary>${companyRequisites(company)}<h3>Автор заказа</h3>${dataFields([['ФИО', author.person], ['Должность', author.position], ['Рабочий email', author.email], ['Телефон', author.phone]])}</details><p class="note">${saved ? 'Снимок на момент оформления. Последующие изменения профиля и компании не меняют этот заказ.' : state.companyChange?.status === 'pending' ? 'Изменение реквизитов на проверке: в заказ попадут действующие данные, показанные здесь.' : 'В заказ сохранятся действующие данные. Получателей ключей и кодов укажите на шаге «Получение».'}</p></section>`
}

const checkoutSteps = ['Состав и проект', 'Реквизиты', 'Получение', 'Проверка и отправка']

function checkoutReview(lines) {
  const user = currentUser(state), groups = receivingGroups(lines)
  const edit = step => btn('Изменить', 'checkout-step', `data-step="${step}" aria-label="Изменить: ${checkoutSteps[step - 1]}"`, 'link-btn')
  return `<section class="panel checkout-review"><div class="section-head"><h2>Проверьте заказ</h2></div>
    <div class="review-section"><div class="section-head"><h3>Состав и проект</h3>${edit(1)}</div>
    <ul class="receiving-items">${lines.map(line => `<li><span>${esc(line.name)} ${esc(line.edition)} · ${esc(line.sourceCatalog ? line.parameterText : line.version)}<small>${esc(line.protectionName)} · ${line.physical ? 'Ключ курьером в руки' : 'Код по email'}</small></span><strong>${line.quantity} шт. · ${money(line.total)}</strong></li>`).join('')}</ul>
    ${checkout.customer || checkout.project ? dataFields([['Конечный заказчик', checkout.customer || 'Не указан'], ['Проект', checkout.project || 'Не указан']]) : '<p class="note">Данные проекта не указаны · необязательно для этой суммы.</p>'}</div>
    <div class="review-section"><div class="section-head"><h3>Покупатель и автор</h3>${edit(2)}</div>
    ${dataFields([['Компания', state.company.name], ['ИНН', state.company.inn], ['Автор заказа', user.person], ['Email автора', user.email]])}
    ${state.companyChange?.status === 'pending' ? '<p class="notice">Изменение реквизитов на проверке. В заказ попадут действующие данные.</p>' : ''}</div>
    <div class="review-section"><div class="section-head"><h3>Получение</h3>${edit(3)}</div>
    ${groups.courier.length ? `<h4>Ключи курьером в руки</h4>${dataFields([['Получатель', checkout.recipient ?? user.person], ['Телефон', checkout.phone], ['Адрес доставки', checkout.address, true]])}` : ''}
    ${groups.email.length ? `<h4>Коды по email</h4>${dataFields([['Email получения кодов', checkout.email ?? user.email, true]])}` : ''}
    <p class="note">Способ получения каждой позиции указан в составе выше.</p></div>
    <p>Заказ поступит на ручную обработку. Онлайн-оплаты нет.</p>
    <label class="check"><input type="checkbox" name="consent" required ${checkout.consent ? 'checked' : ''}><span>Ознакомлен(а) с <button type="button" class="link-btn" data-action="terms">условиями заказа</button>.</span></label>
  </section>`
}

function checkoutPage() {
  if (!state.cart.length) return empty('Корзина пуста', 'Если заказ уже отправлен, он доступен в личном кабинете.', '<a href="#orders" class="btn">Заказы компании →</a>')
  const lines = cartLines(state), required = needsProject(total(lines)), step = checkout.step || 1
  const base = lines.reduce((sum, item) => sum + (item.pilot ? item.total : item.rrp * item.quantity), 0), fee = deliveryCost(chosenDelivery(lines))
  return `<form id="checkout-form" class="checkout-wizard" novalidate>
  <nav class="checkout-steps" aria-label="Шаги оформления"><ol>${checkoutSteps.map((title, index) => `<li><button type="button" data-action="checkout-step" data-step="${index + 1}" ${step === index + 1 ? 'aria-current="step"' : ''}><span>${index + 1}</span>${title}</button></li>`).join('')}</ol></nav>
  <div class="checkout-total"><span>${lines.length} поз. · ${lines.reduce((sum, line) => sum + line.quantity, 0)} шт.</span><div><span>Итого с получением</span><strong>${money(total(lines) + fee)}</strong></div></div>
  <h2 id="checkout-step-title" class="checkout-step-title" tabindex="-1">Шаг ${step} из 4 · ${checkoutSteps[step - 1]}</h2>
  <div data-checkout-step="1" ${step !== 1 ? 'hidden' : ''}>
    <section class="panel"><div class="section-head"><h2>Состав заказа</h2><a class="link-btn" href="#cart">Вернуться в корзину</a></div>${itemsView(lines, true)}
    <details class="explanation checkout-costs"><summary>Стоимость и скидка</summary>
    <div class="summary-row"><span>${lines.some(item => item.sourceCatalog) ? 'Товары по прайсу' : 'Товары по РРЦ'}</span><span>${money(base)}</span></div>
    ${base > total(lines) ? `<div class="summary-row"><span>Скидка на ПО</span><span>−${money(base - total(lines))}</span></div>` : ''}
    <div class="summary-row"><span>Стоимость товаров</span><span>${money(total(lines))}</span></div>
    <div class="summary-row"><span>${deliveryMethods[chosenDelivery(lines)]}</span><span>${money(fee)}</span></div>
    <div class="summary-row"><span>НДС</span><span>Не начислен</span></div>
    <p class="note">${pricingNote(lines)} Стоимость доставки уточняется при обработке заказа.</p></details></section>
    <details class="panel project-panel" ${required || checkout.customer || checkout.project ? 'open' : ''}><summary>Данные проекта <span class="status ${required ? 'yellow' : ''}">${required ? 'Обязательны от 800 000 ₽' : 'Необязательно'}</span></summary><div class="field-row"><label class="field">Конечный заказчик ${required ? '*' : ''}<input name="customer" value="${esc(checkout.customer)}" maxlength="150" ${required ? 'required' : ''} placeholder="Компания, для которой реализуется проект"><small>Может отличаться от компании-покупателя</small></label><label class="field">Наименование проекта ${required ? '*' : ''}<input name="project" value="${esc(checkout.project)}" maxlength="150" ${required ? 'required' : ''} placeholder="Например, автоматизация насосной станции"></label></div><p class="note">Порог рассчитывается по стоимости товаров без доставки.</p></details>
  </div>
  <div data-checkout-step="2" ${step !== 2 ? 'hidden' : ''}>${orderParties(state.company, currentUser(state), false, true)}</div>
  <div data-checkout-step="3" ${step !== 3 ? 'hidden' : ''}><section class="panel receiving-panel"><h2>Доставка и способ получения</h2><p class="note">Способ определён комплектацией. Получатели могут отличаться от автора и друг от друга.</p>${receivingPanel(lines)}</section></div>
  <div data-checkout-step="4" ${step !== 4 ? 'hidden' : ''}>${checkoutReview(lines)}</div>
  <div class="form-error" id="form-error" role="alert" tabindex="-1"></div>
  <div class="checkout-actions">${checkoutActions(step)}</div>
  <p class="note checkout-save-note">Черновик и шаг сохраняются в этом браузере. Заказ отправляется только на последнем шаге.</p>
  </form>`
}
function successPage() {
  const order = state.orders[0]
  if (!order) return empty('Пока нет отправленного заказа', 'Пройдите выбор товара и оформление.')
  return `<section class="panel success-panel"><div class="success-mark" aria-hidden="true">✓</div><span class="eyebrow">Заказ создан</span><h2>Заказ отправлен на обработку</h2><div class="order-number">${order.id} · ${date(order.date)}</div><p>Заказ ${esc(order.company.name)} на сумму <strong>${money(order.total)}</strong> принят в обработку.</p><div class="rule"></div><div class="info-grid"><div class="metric">Дальше<strong>Ручная обработка</strong><span>Счёт пока не опубликован, оплата не подтверждена.</span></div><div class="metric">Где следить<strong>Заказы и документы</strong><span>Состав, автор, оплата и опубликованные файлы.</span></div></div><div class="actions"><a class="btn" href="#order/${order.id}">Открыть заказ →</a><a class="btn secondary" href="#catalog">Вернуться в каталог</a></div></section>`
}

function paymentStatus(order) {
  return `<span class="status ${order.paid ? 'green' : ''}">${order.paid ? 'Подтверждена' : 'Не подтверждена'}</span>`
}

function documentLink(order, kind, label, cls = 'link-btn') {
  return btn(label, 'document', `data-id="${esc(order.id)}" data-kind="${kind}" aria-label="${label} · ${kind === 'invoice' ? 'счёт' : 'соглашение'} · заказ ${esc(order.id)}"`, cls)
}

function ordersPage() {
  const orders=visibleCompanyOrders()
  if (!orders.length) return empty('У компании пока нет заказов', 'Здесь будет история заказов компании с указанием автора. Начните с выбора ПО.')
  return `<section class="panel"><div class="section-head"><div><h2>Заказы компании</h2><p class="note">${esc(state.company.name)} · общая история компании</p></div><a href="#catalog" class="btn secondary small">Новый заказ</a></div><div class="orders-scroll" role="region" aria-label="Список заказов" tabindex="0"><table class="orders-table"><thead><tr><th scope="col">Заказ / дата</th><th scope="col">Автор</th><th scope="col">Сумма</th><th scope="col">Оплата</th><th scope="col">Документы</th></tr></thead><tbody>${orders.map(order => `<tr><th scope="row"><a href="#order/${esc(order.id)}">${esc(order.id)}</a><small>${date(order.date)}</small>${order.demoSample ? '' : ''}</th><td>${esc(order.author.person)}</td><td class="order-table-amount">${money(order.total)}</td><td>${paymentStatus(order)}${!order.invoice && !order.paid ? '<small>Ручная обработка</small>' : ''}</td><td><div class="order-doc-links">${order.invoice ? documentLink(order, 'invoice', 'Счёт') : '<span class="muted">Счёт не опубликован</span>'}${order.agreement ? documentLink(order, 'agreement', 'Соглашение') : ''}</div></td></tr>`).join('')}</tbody></table></div><p class="note">Оплата и публикация документов — разные этапы.</p></section>`
}

function purchaseHistoryPage(tab, id) {
  if (state.stage === 'guest') return purchaseInquiriesPage(id)
  let ordersCount, inquiriesCount
  try { ordersCount = companyPurchaseOrders(window.localStorage,state).length } catch {}
  try { inquiriesCount = ownPurchaseInquiries(window.localStorage,state).length } catch {}
  const badge = count => count === undefined ? '' : `<span class="purchase-tab-count">${count}</span>`
  const current = `aria-current="${id ? 'location' : 'page'}"`
  const tabs = `<nav class="team-tabs purchase-tabs" aria-label="Заказы и заявки"><a href="#orders" ${tab === 'orders' ? current : ''}>Заказы${badge(ordersCount)}</a><a href="#inquiries" ${tab === 'inquiries' ? current : ''}>Заявки${badge(inquiriesCount)}</a></nav>`
  const detailNav = id ? `<nav class="purchase-detail-nav" aria-label="Навигация по покупкам"><a class="btn secondary small" href="#${tab}">← Все ${tab === 'orders' ? 'заказы' : 'заявки'}</a><span aria-current="page">Детали ${tab === 'orders' ? 'заказа' : 'заявки'}</span></nav>` : ''
  const content = tab === 'inquiries' ? purchaseInquiriesPage(id) : canPurchase(state) ? id ? orderPage(id) : ordersPage() : empty('Заказы пока недоступны', 'Оформить заказ можно после подтверждения доступа к компании. Если хотите связаться с менеджером сейчас, отправьте заявку.', '<a class="btn" href="#inquiries">Перейти к заявкам →</a>')
  return tabs + detailNav + content
}

function deliveryView(order) {
  const delivery = order.delivery, groups = receivingGroups(order.lines)
  if (!delivery) return '<p class="note">Данные получателя для этого заказа не указаны.</p>'
  const physical = delivery.method === 'pickup' ? 'Самовывоз' : 'Ключи курьером в руки'
  return `
    ${groups.courier.length ? `<section class="receiving-group" aria-label="${physical}"><h3>${physical}</h3>${receivingList(groups.courier)}<p>Стоимость: ${money(delivery.cost)}</p>${dataFields([['Получатель', delivery.recipient], ['Телефон', delivery.phone], ...(delivery.method === 'courier' ? [['Адрес доставки', delivery.address, true]] : [])])}</section>` : ''}
    ${groups.email.length ? `<section class="receiving-group" aria-label="Коды по email"><h3>Коды по email</h3>${receivingList(groups.email)}<p>Стоимость: 0 ₽</p>${delivery.email ? dataFields([['Email получения кодов', delivery.email, true]]) : '<p>Email получения кодов в старом заказе не был сохранён. Требуется уточнение; адрес компании не подставлен.</p>'}</section>` : ''}
    <p class="note">Сведения о получении на момент оформления заказа.</p>`
}

function orderPage(id) {
  const order = visibleCompanyOrders().find(item => item.id === id)
  if (!order) return empty('Заказ не найден', 'Возможно, данные были сброшены или заказ недоступен в этом браузере.', '<a class="btn" href="#orders">К списку заказов →</a>')
  const sourceInquiry=ownPurchaseInquiries(window.localStorage,state).find(item=>item.orders?.some(entry=>entry.id === id))
  const publicEvents=(order.orderEvents || []).filter(event => ['invoice', 'paid', 'agreement'].includes(event.type))
  const next = !order.invoice ? 'Заказ передан на ручную обработку. Счёт ещё не опубликован.' : !order.paid ? 'Счёт опубликован. Подтверждение оплаты пока не поступило.' : !order.agreement ? 'Оплата подтверждена. Лицензионное соглашение ещё не опубликовано.' : 'Оплата подтверждена. Лицензионное соглашение доступно в документах.'
  const doc = (title, available, type, subtitle) => `<div class="document"><div><strong>${title}</strong><small>${subtitle}</small></div>${available ? documentLink(order, type, 'Открыть образец', 'secondary small') : '<span class="small muted">Не опубликован</span>'}</div>`
  return `${sourceInquiry ? `<p><a class="btn secondary small" href="#inquiry/${esc(sourceInquiry.id)}">Исходная заявка ${esc(sourceInquiry.id)} →</a></p>` : ''}<section class="panel order-overview"><div class="section-head"><div><h2>Заказ ${esc(order.id)}</h2><p class="note">${date(order.date)} · автор ${esc(order.author.person)}</p></div><div class="order-total"><span class="data-caption">Итого по заказу</span><strong>${money(order.total)}</strong></div></div><div class="order-payment"><span>Оплата</span>${paymentStatus(order)}</div><p class="order-next">${next}</p><div class="actions">${order.invoice ? documentLink(order, 'invoice', 'Открыть счёт', '') : '<a class="btn secondary" href="#orders">К списку заказов</a>'}${order.agreement ? documentLink(order, 'agreement', 'Соглашение', 'secondary') : ''}</div><p class="note">Публикация документов не означает выдачу ключей или кодов.</p></section>
  <section class="panel"><h2>Документы</h2>${doc('Счёт на оплату', order.invoice, 'invoice', 'Публикация счёта не подтверждает оплату')}${doc('Лицензионное соглашение', order.agreement, 'agreement', 'Публикуется отдельно после оплаты')}<p class="note">Документы доступны после публикации.</p></section>
  <section class="panel"><h2>Состав заказа</h2>${itemsView(order.lines)}<div class="summary-row"><span>Товары</span><span>${money(total(order.lines))}</span></div>${order.delivery ? `<div class="summary-row"><span>Получение · сохранённая стоимость</span><span>${money(order.delivery.cost)}</span></div>` : ''}<p class="note">Показаны суммы на момент оформления. Заказ не пересчитывается по текущим ценам.</p></section>
  <section class="panel receiving-panel"><h2>Получение</h2>${deliveryView(order)}</section>
  ${orderParties(order.company, order.author, true)}
  ${order.project || order.customer ? `<section class="panel"><h2>Данные проекта</h2>${dataFields([['Проект', order.project || 'Не указан'], ['Конечный заказчик', order.customer || 'Не указан']])}</section>` : ''}
  <details class="panel order-process"><summary>Обработка заказа</summary><ol class="timeline">${[['Заказ создан', true, 'Передан на обработку'], ['Счёт опубликован', order.invoice, 'Документ доступен компании'], ['Оплата подтверждена', order.paid, 'Не равна выдаче ПО или соглашения'], ['Соглашение опубликовано', order.agreement, 'Отдельное действие после оплаты']].map(([title, done, text], index) => `<li class="${done ? 'complete' : ''}"><i>${done ? '✓' : index + 1}</i><div><strong>${title}</strong>${text}</div></li>`).join('')}</ol>${publicEvents.length ? `<h3>История событий</h3><ul>${publicEvents.map(event => `<li>${esc({invoice:'Счёт опубликован',paid:'Оплата подтверждена',agreement:'Соглашение опубликовано'}[event.type])} · ${date(event.date)}</li>`).join('')}</ul>` : ''}</details>`
}


function preparationPage() {
  if (state.stage === 'guest') return empty('Войдите, чтобы отправить заявку', 'Заявки доступны после входа или регистрации через IEK ID. Используем ваш подтверждённый контакт для ответа.', btn('Войти или зарегистрироваться','login'))
  const sentNotice=cartInquiryNotice()
  if (sentNotice) return `<section class="panel">${sentNotice}<a class="cart-back" href="#cart">← В корзину</a></section>`
  const selection=selectedConfiguration(state)
  if (selection) return `<section class="panel"><h2>Ваш выбор сохранён</h2><p>${esc(product(selection.id).name)} · ${selection.quantity} шт.</p>${btn('Добавить в корзину →','continue-selection')}${btn('Изменить комплектацию','edit-selection','','secondary')}</section>`
  if (!state.cart.length) return empty('Добавьте товары в корзину', 'Выберите позиции, по которым хотите связаться с менеджером.')
  let contact
  try { contact=inquiryContact(state) } catch { return empty('Нужен контакт для ответа','Подтвердите почту или телефон в личном профиле. Достаточно одного контакта.','<a class="btn" href="#profile">Личный профиль →</a>') }
  const identity = JSON.stringify(contact)
  if (purchaseInquiryDraft?.identity !== identity) purchaseInquiryDraft = { identity, id: `PI-${crypto.randomUUID()}`, comment: '' }
  const lines=cartLines(state)
  return `<a class="cart-back" href="#cart">← В корзину</a><div class="cart-layout inquiry-layout"><section class="panel"><h2>Отправить заявку менеджеру</h2><p>Поможем с выбором и оформлением покупки. Реквизиты компании и ФИО сейчас не нужны.</p>
    <form id="purchase-inquiry-form"><input type="hidden" name="inquiryId" value="${purchaseInquiryDraft.id}"><div class="inquiry-contact"><span>${contact.kind === 'email' ? 'Почта для ответа' : 'Телефон для связи'}</span><strong>${esc(contact.value)}</strong><span class="status green">Подтверждён в IEK ID</span></div>
    <label class="field">Комментарий (необязательно)<textarea name="comment" rows="4" maxlength="2000" placeholder="Например, нужна помощь с выбором лицензии">${esc(purchaseInquiryDraft.comment)}</textarea></label><div class="form-error" id="form-error" role="alert"></div><button class="btn" type="submit">Отправить заявку →</button><p class="note">Передадим менеджеру контакт, комментарий и выбранные товары. Товары сохранятся в заявке, а корзина очистится после отправки.</p></form></section>
    <aside class="panel inquiry-composition"><h2>В заявке</h2>${inquiryLinesView(lines)}<div class="summary-total"><span>Товары</span><strong>${money(total(lines))}</strong></div><p class="note">Предварительно, без доставки. Итог уточнит менеджер.</p><a href="#cart">Изменить состав →</a></aside></div>`
}

function inquiryLinesView(lines) {
  return `<ul class="inquiry-lines">${lines.map(line=>`<li><strong>${esc(line.name)} ${esc(line.edition || '')}</strong><span>${esc(line.variant || line.parameterText || line.version || '')}</span><small>${[line.sku,line.keySku === 'AUTO' ? '' : line.keySku,line.protection || line.protectionName].filter((value,index,values)=>value && values.indexOf(value) === index).map(esc).join(' · ')}${line.keyQuantity ? ` · ${line.keyQuantity} ${keyWord(line.keyQuantity)}` : ''}</small><div>${line.quantity} лицензий <strong>${money(line.total)}</strong></div></li>`).join('')}</ul>`
}

function inquiryOrderSummary(item) {
  if (!item.hasLinkedOrders) return '<span class="muted">Пока нет</span>'
  if (item.orders.length) return item.orders.map(order=>`<a class="inquiry-order-link" href="#order/${esc(order.id)}" title="${esc(order.id)}" aria-label="Открыть заказ ${esc(order.id)}">${esc(order.id.length > 18 ? `${order.id.slice(0,18)}…` : order.id)}</a>`).join('')
  const connected = canViewAccount(state)
  return `<div class="inquiry-order-summary"><strong>Заказ создан</strong><span>Доступ после проверки компании</span><a class="btn secondary small" href="#${connected ? 'company/info' : 'company/connect'}">${connected ? 'Статус компании' : 'Подключить компанию'}</a></div>`
}

function purchaseInquiriesPage(id) {
  if (state.stage === 'guest') return empty('Войдите или зарегистрируйтесь через IEK ID','После входа будут доступны ваши заявки.',btn('Войти или зарегистрироваться','login'))
  let items
  try { items=ownPurchaseInquiries(window.localStorage,state) } catch { return empty('Не удалось загрузить заявки','Обновите страницу и попробуйте ещё раз.') }
  if (id) {
    const item=items.find(item=>item.id === id)
    if (!item) return empty('Заявка недоступна','Вернитесь к списку заявок.','<a class="btn" href="#inquiries">Мои заявки →</a>')
    return `<div class="inquiry-detail"><section class="panel inquiry-original"><div class="section-head"><h2>Заявка на покупку</h2><span class="status ${item.status === 'done' ? 'green' : ''}">${inquiryStatusLabels[item.status]}</span></div><p class="note">${esc(item.id)} · ${date(item.date)}</p><p class="note">Контакт для связи · ${item.contact.kind === 'email' ? 'почта' : 'телефон'}: <strong>${esc(item.contact.value)}</strong></p>${item.comment ? `<p class="inquiry-comment">${esc(item.comment)}</p>` : ''}<h3>Что вы запросили</h3>${inquiryLinesView(item.lines)}<div class="summary-total"><span>Сумма товаров в заявке</span><strong>${money(item.total)}</strong></div></section>${inquiryOrdersPanel(item)}<div class="actions"><a class="btn secondary" href="#catalog">Перейти в каталог →</a><a class="btn secondary" href="#inquiries">Все мои заявки</a></div></div>`
  }
  const companyHint = canPurchase(state) ? '' : `<div class="inquiry-company-hint"><div><strong>${canViewAccount(state) ? 'Компания на проверке' : 'Покупки и документы — в кабинете компании'}</strong><p>После проверки компании и представителя откроются заказы, лицензии и документы.</p></div><a class="btn secondary small" href="#${canViewAccount(state) ? 'company/info' : 'company/connect'}">${canViewAccount(state) ? 'Статус компании' : 'Подключить компанию'} →</a></div>`
  const rows=[...items].reverse().map(item=>`<tr><th scope="row"><span title="${esc(item.id)}">№ ${esc(item.id.slice(0,11))}…</span><small>${date(item.date)}</small></th><td class="inquiry-table-product">${esc(item.lines[0].name)}${item.lines.length > 1 ? `<small>Ещё ${item.lines.length - 1} поз.</small>` : ''}</td><td class="order-table-amount">${money(item.total)}</td><td><span class="status ${item.status === 'done' ? 'green' : ''}">${inquiryStatusLabels[item.status]}</span></td><td class="inquiry-table-order">${inquiryOrderSummary(item)}</td><td class="inquiry-table-action"><a class="btn secondary small" href="#inquiry/${esc(item.id)}" aria-label="Открыть заявку ${esc(item.id)}">Открыть заявку</a></td></tr>`).join('')
  return `<section class="panel inquiry-list"><div class="section-head"><h2>Мои заявки на покупку</h2><a class="btn secondary small" href="#catalog">В каталог →</a></div>${companyHint}${items.length ? `<div class="orders-scroll" role="region" aria-label="Список заявок" tabindex="0"><table class="orders-table inquiry-table"><thead><tr><th scope="col">Заявка / дата</th><th scope="col">Товары</th><th scope="col">Сумма</th><th scope="col">Статус</th><th scope="col">Заказ</th><th scope="col">Действие</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p>Вы ещё не отправляли заявки менеджеру.</p>'}</section>`
}

function renderDemo(servicePanels = []) {
  const active = document.activeElement
  const hadFocus = demoPanel.contains(active)
  const focusId = demoPanel.contains(active) ? active.id : ''
  const scrollTop = demoPanel.querySelector('.demo-body')?.scrollTop || 0
  const sections = { person: 'Персонаж', data: 'Сценарии и данные' }
  const applicants = [{ role: 'admin', person: administrator(state).person, request: linkedRequest }, { role: 'employee', person: state.employee.person, request: employeeLinkedRequest }].sort((a, b) => a.person.localeCompare(b.person, 'ru'))
  const savedScenarios = state.archivedScenarios.map((entry, index) => ({ ...entry, index })).filter(entry => !entry.signedOut)
  demoPanel.innerHTML = `<div class="demo-head"><div><span class="eyebrow">Управление демонстрацией</span><h2 id="demo-title" tabindex="-1">Пульт демо</h2></div>${btn('×', 'close-demo', 'aria-label="Закрыть пульт демо"', 'secondary small')}</div>
    <nav class="demo-nav" aria-label="Разделы пульта">${Object.entries(sections).map(([key, title]) => btn(title, 'demo-section', `id="demo-tab-${key}" data-section="${key}" aria-pressed="${demoSection === key}"`, 'secondary small')).join('')}</nav>
    <div class="demo-operator-links">${operatorDemoLinks()}</div><div class="demo-body">
    <section id="demo-person" aria-labelledby="demo-tab-person" ${demoSection !== 'person' ? 'hidden' : ''}>
      <section class="demo-card"><h3>Две заявки на одну компанию</h3><p>Анна Смирнова и Иван Петров уже авторизованы через IEK ID. Создадим для них отдельные заявки на ООО «Демо Инжиниринг». Кто станет администратором, определит первое одобрение оператора.</p>${btn(state.verificationRequestId && state.employeeVerificationRequestId ? 'Создать две новые заявки' : 'Загрузить сценарий', 'demo-two-applicants', '', 'full')}</section>
      ${state.stage === 'guest' ? '<p class="note">Сейчас открыт гостевой каталог. Загрузите сценарий или войдите через IEK ID.</p>' : `<label class="field">Активный пользователь в ЛК<select id="role">${applicants.map(({ role, person }) => `<option value="${role}" ${state.role === role ? 'selected' : ''}>${esc(person)}</option>`).join('')}</select></label><p class="note">Переключение меняет только пользователя в этой сессии. Решение оператора и заявки сохраняются.</p>${state.verificationRequestId && state.employeeVerificationRequestId ? `<dl class="demo-facts">${applicants.map(({ role, person, request }) => `<dt>${esc(person)}</dt><dd>${esc(applicantDemoStatus(request, role))}</dd>`).join('')}</dl>` : ''}`}
      <dl class="demo-facts"><dt>Компания</dt><dd>${canViewAccount(state) ? esc(state.company.name) : 'Не привязана к пользователю'}</dd><dt>Доступ к покупкам</dt><dd>${canPurchase(state) ? 'Открыт' : 'Закрыт'}</dd></dl>
      ${state.stage === 'guest' ? btn('Вход / регистрация через IEK ID', 'demo-login', '', 'full') : ''}
    </section>
    <section id="demo-data" aria-labelledby="demo-tab-data" ${demoSection !== 'data' ? 'hidden' : ''}>
      ${state.stage === 'guest' ? '<p class="note">Войдите или зарегистрируйтесь через IEK ID, чтобы начать сценарий компании.</p>' : state.role === 'admin' ? `<section class="demo-card"><h3>Начальная точка</h3><p>Новый сценарий сохранит текущую компанию и её заказы отдельно. Выход не удаляет данные.</p><div class="actions">${btn('Без компании', 'demo-stage', 'data-stage="identified"', 'secondary small')}${btn('Выйти', 'demo-stage', 'data-stage="guest"', 'secondary small')}</div></section>` : '<p class="note">Начальные сценарии переключаются от персонажа администратора.</p>'}
      <div id="demo-data-tools"></div>
      <details id="demo-checks" class="demo-card"><summary>Тестовые проверки</summary><p class="note">Только локальная имитация; внешние запросы не отправляются.</p><div id="demo-reviews"></div></details>
      ${savedScenarios.length ? `<details aria-label="Сохранённые сценарии" class="demo-card"><summary>Сохранённые компании · ${savedScenarios.length}</summary><p>Возврат сохранит текущий сценарий. Заказы разных компаний не объединяются.</p>${savedScenarios.map(entry => `<div class="demo-saved"><strong>${esc(entry.state.company?.name || 'Без компании · незавершённый сценарий')}</strong><p>${eventDate(entry.date)} · Заказов: ${entry.state.orders.length} · Сотрудников: ${entry.state.members.length}</p>${btn('Вернуться к сценарию', 'restore-scenario', `data-index="${entry.index}"`, 'secondary small')}</div>`).join('')}</details>` : ''}
      <section class="demo-reset"><h3>Полный сброс</h3><p>Удалит все сохранённые сценарии, заказы и черновики этого демо. Потребуется подтверждение.</p>${btn('Начать заново', 'reset', '', 'secondary danger small')}</section>
    </section></div>`
  const reviews = demoPanel.querySelector('#demo-reviews')
  if (state.stage !== 'guest') {
    const template = document.createElement('template')
    template.innerHTML = verificationPanel(undefined, true)
    for (const card of template.content.querySelectorAll('.lab-card')) {
      const status = card.parentElement.querySelector('.section-head .status')
      card.querySelector('.eyebrow')?.remove()
      card.querySelector('p')?.remove()
      if (status) card.querySelector('h3').after(status)
      reviews.append(card)
    }
    if (canViewAccount(state)) {
      template.innerHTML = companyDetailsPanel(false, true)
      const card = template.content.querySelector('.lab-card')
      if (card) reviews.append(card)
    }
  }
  for (const panel of servicePanels) {
    const isData = panel.matches('[data-action="preview-invitation"]')
    demoPanel.querySelector(isData ? '#demo-data-tools' : '#demo-reviews').append(panel)
  }
  if (!reviews.children.length) demoPanel.querySelector('#demo-checks').remove()
  demoPanel.querySelector('.demo-body').scrollTop = scrollTop
  if (demoOpen && !demoPanel.open) demoPanel.showModal()
  if (!demoOpen && demoPanel.open) demoPanel.close()
  if (demoOpen && hadFocus) (focusId && demoPanel.querySelector(`#${focusId}`) || demoPanel.querySelector(`#demo-tab-${demoSection}`)).focus()
}

function render(focus = false) {
  clearTimeout(companySearchTimer)
  checkout = checkoutDraft(state)
  let [page = 'catalog', id] = route()
  if (page === 'company' && id === 'access') { history.replaceState(null, '', '#company/info'); id = 'info' }
  const checkDetailsOpen = Boolean(app.querySelector('#company-check-details')?.open)
  if (page === 'checkout' && !canPurchase(state) || page === 'cart' && !canUseCart(state)) {
    history.replaceState(null, '', '#prepare')
    page = 'prepare'; id = undefined
  }
  const titles = { profile: ['ЛИЧНЫЙ КАБИНЕТ', 'Ваш профиль и личные сервисы.', '01'], helpdesk: ['HELPDESK', 'Личная поддержка · скоро в кабинете.', '01'], prepare: ['ЗАЯВКА НА ПОКУПКУ', 'Поможем с выбором и оформлением.', '03'], inquiries: ['ЗАКАЗЫ И ЗАЯВКИ', 'Заказы компании и ваши обращения к менеджеру.', '03'], inquiry: ['ЗАЯВКА НА ПОКУПКУ', 'Состав заявки и статус обработки.', '03'], catalog: ['ПРОГРАММНЫЕ ПРОДУКТЫ', 'Решения для автоматизации. Выберите ПО и отправьте заказ на обработку.', '01'], product: ['ВЫБОР КОМПЛЕКТАЦИИ', 'Проверьте характеристики и количество перед добавлением в заказ.', '02'], company: ['ЛИЧНЫЙ КАБИНЕТ', 'Компания, пользователь и право действовать от её имени.', '01'], cart: ['КОРЗИНА', 'Проверьте товары и выберите, как продолжить покупку.', '03'], checkout: ['ОФОРМЛЕНИЕ ЗАКАЗА', 'Проверьте компанию, состав и условия перед отправкой.', '04'], success: ['ЗАКАЗ ПЕРЕДАН', 'Покупка начинается с ручной обработки вашего заказа.', '05'], orders: ['ЗАКАЗЫ И ЗАЯВКИ', 'Заказы компании и ваши обращения к менеджеру.', '05'], order: ['ДЕТАЛИ ЗАКАЗА', 'Состав заказа, ход обработки и опубликованные документы.', '05'] }
  const view = Object.hasOwn(titles, page) ? page : 'catalog'
  const companyTitles = {
    connect: ['ПОДКЛЮЧЕНИЕ КОМПАНИИ', 'Три шага для работы от имени организации.'],
    info: ['КОМПАНИЯ', 'Реквизиты и подтверждение связи с компанией.'],
    team: ['СОТРУДНИКИ', 'Участники компании, заявки и приглашения.'],
    documents: ['ДОКУМЕНТЫ', 'Опубликованные документы по заказам компании.'],
    licenses: ['ЛИЦЕНЗИИ', 'Заказанное ПО и опубликованные соглашения.']
  }
  const [title, subtitle] = view === 'company' ? companyTitles[Object.hasOwn(companyTitles, id) ? id : 'info'] : titles[view]
  let content
  const protectedPage = ['checkout', 'success', 'order'].includes(view)
  if (state.stage === 'guest' && ['company', 'orders', 'order'].includes(view)) content = companyPage()
  else if (state.stage === 'identified' && protectedPage) content = `${empty('Для оформления нужна привязка компании', 'Личный профиль и просмотр РРЦ доступны без компании. Заказы, документы и оформление — только после подтверждения связи с компанией и проверки пользователя.', '<a class="btn" href="#company/connect">Подключить компанию →</a><a class="btn secondary" href="#profile">Личный профиль →</a>')}`
  else if (protectedPage && !canPurchase(state)) content = `${empty('Нужно подтверждение доступа', 'Отправка заказа и документы компании доступны после проверки пользователя и его связи с компанией. Корзину можно наполнять по базовой цене и без входа.', gateAction())}`
  else content = ({ profile: profilePage, helpdesk: helpdeskPage, prepare: preparationPage, inquiries: () => purchaseHistoryPage('inquiries'), inquiry: () => purchaseHistoryPage('inquiries', id), catalog: catalogPage, product: () => productPage(id), company: () => accountPage(id), cart: cartPage, checkout: checkoutPage, success: successPage, orders: () => purchaseHistoryPage('orders'), order: () => purchaseHistoryPage('orders', id) })[view]()
  if (state.stage !== 'guest' && !['cart','prepare'].includes(view)) content = accountLayout(content, view === 'company' ? `company/${['info', 'connect', 'team', 'access', 'documents', 'licenses'].includes(id) ? id : 'info'}` : ['catalog', 'product'].includes(view) ? 'catalog' : ['cart', 'checkout'].includes(view) ? 'cart' : ['profile', 'helpdesk'].includes(view) ? view : ['orders', 'inquiries', 'order', 'inquiry'].includes(view) ? canPurchase(state) ? 'orders' : 'inquiries' : '')
  app.innerHTML = `<div class="demo-launcher">${btn('Пульт демо', 'open-demo', 'id="demo-launcher" aria-haspopup="dialog"', 'secondary small')}</div><div id="storage-status" class="storage-status ${storageWarning ? 'storage-warning' : ''}" role="status">${esc(storageWarning || 'Тестовые данные сохраняются в этом браузере.')}</div><header class="site-header"><div class="wrap header-row"><a class="brand" href="#catalog" aria-label="IEK Digital — каталог"><strong>IEK</strong><span>DIGITAL</span></a><nav class="site-nav" aria-label="Главная навигация">${state.stage !== 'guest' ? `<a href="#profile" class="${view === 'profile' ? 'active' : ''}">Личный кабинет</a>${canViewAccount(state) ? '<a href="#company/info">Компания</a>' : ''}` : ''}<a href="#catalog" class="${['catalog', 'product'].includes(view) ? 'active' : ''}">Каталог</a></nav><div class="header-actions"><a class="cart-link" href="#cart">Корзина <span class="count">${state.cart.reduce((n, line) => n + line.quantity, 0)}</span></a>${state.stage === 'guest' ? '<button data-action="login">Вход / регистрация ↗</button>' : `<button data-action="profile"><span class="avatar">${esc(currentUser(state).person.trim() ? currentUser(state).person.split(/\s+/).slice(0, 2).map(part => part[0]).join('') : 'ID')}</span>${esc(currentUser(state).person || 'Личный профиль')}</button><button type="button" class="header-logout" data-action="logout">Выйти</button>`}</div></div></header><section class="hero compact-hero"><div class="wrap"><div class="breadcrumb"><a href="#catalog">IEK Digital</a><span>/</span><span>B2B-магазин</span></div><div class="hero-title"><div><div class="eyebrow">Инструменты цифровой промышленности</div><h1>${title}</h1><p>${subtitle}</p></div></div></div></section><main id="main" class="wrap view-${view}" tabindex="-1">${content}</main><footer><div class="wrap"><div><strong>IEK DIGITAL</strong> / B2B-магазин</div><span>Только тестовые данные. Обновление страницы сохраняет сценарий.</span><button data-action="guide">Как пройти сценарий ↗</button></div></footer>`
  if (checkDetailsOpen && app.querySelector('#company-check-details')) app.querySelector('#company-check-details').open = true
  const servicePanels = [...app.querySelectorAll('[data-action="preview-invitation"]')]
  renderDemo(servicePanels)
  document.title = `${title.charAt(0)}${title.slice(1).toLowerCase()} — IEK Digital`
  if (focus && !demoOpen) { window.scrollTo(0, 0); document.querySelector('#main').focus({ preventScroll: true }) }
}

function showError(error) {
  const target = [...(dialog.open ? dialog : app).querySelectorAll('#form-error')].find(element => !element.closest('[hidden]'))
  if (target) { target.textContent = error.message; if (target.closest('#checkout-form')) target.focus(); target.scrollIntoView({ block: 'center', behavior: 'smooth' }) }
  else notify(error.message)
}

function clearCheckoutError(field) {
  field.removeAttribute('aria-invalid')
  const describedBy = (field.getAttribute('aria-describedby') || '').split(' ').filter(id => id && id !== `checkout-error-${field.name}`).join(' ')
  if (describedBy) field.setAttribute('aria-describedby', describedBy)
  else field.removeAttribute('aria-describedby')
  document.getElementById(`checkout-error-${field.name}`)?.remove()
}

function validateCheckout(form, throughStep = 4) {
  let first
  for (const field of form.querySelectorAll('input[name]:not([type="hidden"])')) {
    if (Number(field.closest('[data-checkout-step]')?.dataset.checkoutStep || 1) > throughStep) continue
    clearCheckoutError(field)
    const message = checkoutFieldError(field)
    if (!message) continue
    const error = document.createElement('span')
    error.id = `checkout-error-${field.name}`; error.className = 'field-error'; error.textContent = message
    field.closest('label').append(error)
    field.setAttribute('aria-invalid', 'true'); field.setAttribute('aria-describedby', `${field.getAttribute('aria-describedby') || ''} ${error.id}`.trim())
    first ??= field
  }
  form.querySelector('#form-error').textContent = first ? 'Проверьте отмеченные поля. Заказ ещё не отправлен.' : ''
  if (first) {
    const panel = first.closest('[data-checkout-step]')
    if (panel && Number(panel.dataset.checkoutStep) !== (checkout.step || 1)) {
      checkout.step = Number(panel.dataset.checkoutStep)
      form.querySelectorAll('[data-checkout-step]').forEach(item => { item.hidden = item !== panel })
      form.querySelectorAll('[data-action="checkout-step"]').forEach(button => {
        if (button.closest('.checkout-steps')) {
          if (Number(button.dataset.step) === checkout.step) button.setAttribute('aria-current', 'step')
          else button.removeAttribute('aria-current')
        }
      })
      form.querySelector('#checkout-step-title').textContent = `Шаг ${checkout.step} из 4 · ${checkoutSteps[checkout.step - 1]}`
      form.querySelector('.checkout-actions').innerHTML = checkoutActions(checkout.step)
      persist()
    }
    const details = first.closest('details')
    if (details) details.open = true
    first.focus(); first.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }
  return !first
}

function checkoutActions(step) {
  return `${step === 1 ? '<a class="link-btn" href="#cart">← В корзину</a>' : btn('← Назад', 'checkout-step', `data-step="${step - 1}"`, 'secondary')}
    <button class="btn" type="submit">${step === 4 ? 'Отправить заказ на обработку →' : `Далее: ${checkoutSteps[step].toLowerCase()} →`}</button>`
}

function goCheckoutStep(step) {
  if (!Number.isInteger(step) || step < 1 || step > 4) throw new Error('Шаг оформления недоступен')
  const form = document.querySelector('#checkout-form')
  if (!form || !canPurchase(state)) throw new Error('Откройте оформление заказа')
  if (step > (checkout.step || 1) && !validateCheckout(form, step - 1)) return
  for (const field of form.querySelectorAll('input[name]:not([type="hidden"]):not([type="checkbox"])')) checkout[field.name] = field.value
  checkout.step = step
  render()
  const title = document.querySelector('#checkout-step-title')
  title.focus(); title.scrollIntoView({ block: 'start', behavior: 'smooth' })
}

document.addEventListener('click', event => {
  if (event.target.closest('a[href="#main"]')) {
    event.preventDefault()
    document.querySelector('#main').focus()
    return
  }
  const target = event.target.closest('[data-action]')
  if (!target || target.disabled) return
  const { action, id } = target.dataset
  try {
    if (action === 'close') dialog.close()
    else if (action === 'checkout-step') goCheckoutStep(Number(target.dataset.step))
    else if (action === 'team-tab') selectTeamTab(target.dataset.tab)
    else if (action === 'verification-details') showVerification(target.dataset.kind)
    else if (action === 'open-demo') { dialog.close(); demoOpen = true; demoPanel.showModal() }
    else if (action === 'close-demo') demoPanel.close()
    else if (action === 'demo-section') {
      demoSection = target.dataset.section
      demoPanel.querySelectorAll('.demo-nav button').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.section === demoSection)))
      demoPanel.querySelectorAll('.demo-body > section').forEach(section => { section.hidden = section.id !== `demo-${demoSection}` })
      demoPanel.querySelector('.demo-body').scrollTop = 0
    }
    else if (action === 'demo-two-applicants') {
      const prepared = buildTwoApplicantDemo(window.localStorage, state)
      const previous = window.localStorage.getItem(verificationBridgeKey)
      try {
        window.localStorage.setItem(verificationBridgeKey, JSON.stringify({ version: 1, requests: prepared.requests }))
        saveState(window.localStorage, prepared.state)
      } catch (error) {
        if (previous === null) window.localStorage.removeItem(verificationBridgeKey)
        else window.localStorage.setItem(verificationBridgeKey, previous)
        throw error
      }
      state = prepared.state; lastSaved = JSON.stringify(state); storageBlocked = false; storageWarning = ''
      linkedRequest = prepared.applicants[0]; employeeLinkedRequest = prepared.applicants[1]
      profileNameDraft = null; profileContactDraft = {}; profileEditing = {}; checkout = checkoutDraft(state)
      search = ''; staffFilters = { action: '', email: '' }; teamTab = 'members'; selectedQuantity = 1
      catalogFamily = ''; catalogKind = ''; catalogAttributes = {}; catalogPageIndex = 1; catalogNotice = ''
      demoSection = 'person'; navigate('company/info'); notify('Две заявки созданы. Выберите пользователя в пульте или откройте заявки у оператора.')
    }
    else if (action === 'profile-edit') {
      const kind = target.dataset.kind
      if (!['person', 'email', 'phone'].includes(kind)) return
      profileEditing[kind] = target.getAttribute('aria-expanded') !== 'true'
      if (kind === 'person' && !profileEditing.person) profileNameDraft = null
      render(true)
      document.querySelector(profileEditing[kind] ? (kind === 'person' ? '#profile-name' : `#identity-${kind}`) : `[data-action="profile-edit"][data-kind="${kind}"]`)?.focus()
    }
    else if (action === 'request-contact-code') {
      const kind = target.dataset.kind
      requestContactCode(state, kind, document.querySelector(`#identity-${kind}`).value); render(true)
      document.querySelector(`#identity-${kind}-code`).focus()
    }
    else if (action === 'confirm-contact') {
      const kind = target.dataset.kind, candidate = structuredClone(state)
      confirmContactCode(candidate, kind, document.querySelector(`#identity-${kind}`).value, document.querySelector(`#identity-${kind}-code`).value)
      if (linkedRequest && linkedRequest[kind] === currentUser(candidate)[kind]) updateLinkedRequest(window.localStorage, { ...linkedRequest, [`${kind}Verified`]: true })
      state = candidate; render(true); notify(`${kind === 'phone' ? 'Телефон подтверждён' : 'Почта подтверждена'}`)
    }
    else if (action === 'demo-stage') {
      if (target.dataset.stage === 'guest') logout()
      else {
        profileNameDraft = null; profileContactDraft = {}; profileEditing = {}; setStage(state, target.dataset.stage); checkout = checkoutDraft(state); checkout.consent = false; staffFilters = { action: '', email: '' }; demoSection = 'person'; navigate('profile'); render()
        notify('Сценарий без компании. Прежняя компания и её заказы сохранены отдельно.')
      }
    }
    else if (action === 'prepare-selection') {
      selectConfiguration(state, id, document.querySelector('#product-quantity').value)
      checkout.consent = false; demoOpen = false; navigate('prepare')
    }
    else if (action === 'edit-selection') { const choice = selectedConfiguration(state); if (!choice) throw new Error('Нет сохранённого выбора'); selectedQuantity = choice.quantity; navigate(`product/${choice.id}`) }
    else if (action === 'clear-selection') { state[`${state.role}Selection`] = null; render(); notify('Сохранённый выбор отменён. Корзина и заказы не изменены.') }
    else if (action === 'continue-selection') { continueSelectedOrder(state); checkout.consent = false; checkout.step = 1; demoOpen = false; navigate(canPurchase(state) ? 'checkout' : 'cart') }
    else if (action === 'access-start') {
      const fromDialog = dialog.contains(target)
      startAccessReview(state, target.dataset.kind); checkout.consent = false; render(true)
      if (fromDialog) showVerification(target.dataset.kind)
      notify(state.stage === 'identified' ? 'Заявка на проверку отправлена. Выбранная комплектация сохранена.' : 'Начата тестовая проверка выбранного пункта. Действующий доступ не отзывается.')
    }
    else if (action === 'access-result') {
      const kind = target.dataset.kind, result = target.dataset.result
      if (!canReviewAccess(state, kind) || verificationReviews(state)[kind].status !== 'pending') throw new Error('Нет ожидающей проверки')
      if (result === 'confirmed') {
        simulateAccessReview(state, kind, result); checkout.consent = false; render(true)
        notify('Имитировано подтверждение только выбранной проверки.')
      } else {
        modal(result === 'returned' ? 'Вернуть на исправление · пульт демо' : 'Отказать · пульт демо', `<form id="access-result-form" data-kind="${kind}" data-result="${result}"><p>${verificationTitles[kind]}. Причина будет видна пользователю. Только тестовые данные.</p><label class="field">Причина решения<textarea name="reason" required maxlength="500" rows="4"></textarea></label><div id="form-error" class="form-error" role="alert"></div><div class="actions"><button class="btn" type="submit">Применить тестовый результат</button>${btn('Отмена', 'close', '', 'secondary')}</div></form>`)
      }
    }
    else if (action === 'access-resubmit') {
      const kind = target.dataset.kind
      if (!canReviewAccess(state, kind) || !['returned', 'rejected'].includes(verificationReviews(state)[kind].status)) throw new Error('Повторная подача сейчас недоступна')
      const check = verificationReviews(state)[kind], submission = reviewSubmission(state, kind)
      modal('Исправление заявки', `<form id="access-resubmit-form" data-kind="${kind}"><h3>${verificationTitles[kind]}</h3><p class="form-error"><strong>Причина:</strong> ${esc(check.reason)}</p><h3>${check.submission ? 'Данные отправленной заявки' : 'Текущие данные'}</h3>${reviewValuesView(submission)}<div class="rule"></div><h3>Исправленные данные</h3>${reviewCorrectionFields(submission)}<label class="field">Пояснение проверяющему<textarea name="response" required maxlength="1000" rows="3">${esc(check.response)}</textarea></label><p>Отправка не изменяет действующие данные. После подтверждения применим проверенные значения только в магазине. Старые заказы и получатели черновика останутся без изменений.</p><div id="form-error" class="form-error" role="alert"></div><div class="actions"><button class="btn" type="submit">Отправить повторно на проверку</button>${btn('Отмена', 'close', '', 'secondary')}</div></form>`)
    }
    else if (action === 'edit-company') {
      if (!canRequestCompanyChange(state) || state.companyChange?.status === 'pending') throw new Error('Изменение реквизитов сейчас недоступно')
      const change = state.companyChange, values = change && ['returned', 'rejected'].includes(change.status) ? change.proposed : state.company
      modal('Заявка на изменение реквизитов', `<form id="company-change-form">${change && ['returned', 'rejected'].includes(change.status) ? `<p class="form-error">Причина: ${esc(change.reason || 'Не сохранена')}</p><h3>Отправленные данные</h3>${reviewValuesView({ values: change.proposed })}<h3>Исправленные данные</h3>` : ''}<p>После отправки действующие реквизиты не изменятся до внешнего подтверждения.</p><p>ИНН: ${esc(state.company.inn)}  · не меняется в этой заявке</p><label class="field">Название компании<input name="name" required maxlength="120" value="${esc(values.name)}"></label><label class="field">КПП<input name="kpp" pattern="[0-9]{9}" maxlength="9" inputmode="numeric" value="${esc(values.kpp)}"><small>Если КПП отсутствует, оставьте пустым.</small></label><label class="field">Юридический адрес<input name="legalAddress" maxlength="250" value="${esc(values.legalAddress)}"></label><p class="note">Меняются только реквизиты компании, не профиль IEK ID и не контакты получателей. Банковские реквизиты в этой заявке не меняются.</p><div id="form-error" class="form-error" role="alert"></div><div class="actions"><button class="btn" type="submit">Отправить на проверку</button>${btn('Отмена', 'close', '', 'secondary')}</div></form>`)
    }
    else if (action === 'company-review') {
      if (target.dataset.result === 'confirmed') { simulateCompanyReview(state, 'confirmed'); checkout.consent = false; render(true); notify('Проверенные реквизиты применены в магазине. Старые заказы не изменены.') }
      else modal('Решение по реквизитам', `<form id="company-result-form" data-result="${target.dataset.result}"><p>Причина будет видна автору заявки.</p><label class="field">Причина решения<textarea name="reason" required maxlength="500" rows="3"></textarea></label><div id="form-error" class="form-error" role="alert"></div><button class="btn" type="submit">Применить тестовый результат</button></form>`)
    }
    else if (['copy-author-contacts', 'copy-author-email', 'copy-legal-address'].includes(action)) {
      if (!canPurchase(state) || route()[0] !== 'checkout') throw new Error('Откройте оформление заказа')
      const user = currentUser(state)
      if (action === 'copy-author-contacts') { checkout.recipient = user.person; checkout.phone = user.phone || '' }
      else if (action === 'copy-author-email') checkout.email = user.email
      else checkout.address = state.company.legalAddress || ''
      checkout.consent = false
      render()
    }
    else if (action === 'reset-staff-filters') { staffFilters = { action: '', email: '' }; refreshStaffHistory() }
    else if (action === 'review-transfer-admin') {
      const member = state.members.find(item => item.email === target.dataset.email)
      if (!canManageStaff(state) || !member || member.email !== state.employee.email || !state.employeeVerified) throw new Error('Для передачи нужен подтверждённый администратор и верифицированный участник компании')
      modal('Передать права администратора?', `<p><strong>${esc(currentUser(state).person)}</strong> → <strong>${esc(member.person)}</strong><br>Получатель: ${esc(member.email)}</p><p>После подтверждения ${esc(member.person)} станет единственным администратором. Вы останетесь сотрудником компании и потеряете возможность управлять сотрудниками и передавать права.</p><p>Корзины останутся у своих владельцев, заказы и реквизиты компании сохранятся.</p><p>Права будут переданы сразу после подтверждения.</p><div class="actions">${btn('Не передавать', 'close', '', 'secondary')}${btn('Подтвердить передачу прав', 'transfer-admin', `data-email="${esc(member.email)}"`)}</div>`)
    }
    else if (action === 'transfer-admin') { transferAdministration(state, target.dataset.email); checkout.consent = false; dialog.close(); render(true); notify(`Права переданы: ${administrator(state).person}. Вы остались ${currentUser(state).person}, теперь в роли сотрудника.`) }
    else if (action === 'review-reject-membership' || action === 'review-cancel-invitation') {
      const rejecting = action === 'review-reject-membership'
      const entry = rejecting ? staffRequest(state) : staffInvitation(state)
      if (!canManageStaff(state) || !entry || entry.id !== id || entry.status !== 'pending' || entry.inn !== state.company?.inn) throw new Error('Нет ожидающей заявки или приглашения для этого действия')
      modal(rejecting ? 'Отклонить заявку сотрудника?' : 'Отменить приглашение?', `<p>${esc(entry.email)}</p><p>${rejecting ? 'Заявка будет отклонена, сотрудник не получит доступ к компании.' : 'Приглашение больше нельзя будет принять. Уже добавленных сотрудников это действие не затрагивает.'} Проверка представителя, заказы и корзины не меняются.</p><p>Результат будет виден в разделе «Компания». После отказа можно подать новую заявку.</p><div class="actions">${btn('Не менять', 'close', '', 'secondary')}${btn(rejecting ? 'Подтвердить отклонение' : 'Подтвердить отмену приглашения', rejecting ? 'reject-membership' : 'cancel-invitation', `data-id="${id}"`, 'secondary danger')}</div>`)
    }
    else if (action === 'reject-membership') { rejectMembership(state, id); dialog.close(); render(true); notify('Заявка отклонена. Доступ не предоставлен; письмо не отправлялось.') }
    else if (action === 'retry-membership') { if (state.role !== 'employee' || employeeLinkedRequest?.decision !== 'approved') throw new Error('Сначала дождитесь решения оператора'); findJoinCompany(state, state.company.inn); requestMembership(state, state.employee.email); render(true); notify('Повторная заявка отправлена администратору.') }
    else if (action === 'cancel-invitation') { cancelInvitation(state, id); dialog.close(); render(true); notify('Приглашение отменено. Принять его больше нельзя; письмо не отправлялось.') }
    else if (action === 'edit-employee' || action === 'review-remove-employee') {
      const member = state.members.find(item => item.email === target.dataset.email)
      if (!canManageStaff(state) || !member) throw new Error('Нет прав на управление этим сотрудником')
      if (action === 'edit-employee') modal('Редактировать сотрудника', `<form id="employee-form" data-email="${esc(member.email)}"><p>${esc(member.email)} · роль «Сотрудник»</p><p class="note">Можно изменить ФИО и должность. IEK ID, email и статус проверки не меняются.</p><label class="field">ФИО сотрудника<input name="person" required maxlength="100" value="${esc(member.person)}"></label><label class="field">Должность сотрудника<input name="position" required maxlength="100" value="${esc(member.position)}"></label><div id="form-error" class="form-error" role="alert"></div><div class="actions"><button class="btn" type="submit">Сохранить изменения</button>${btn('Отмена', 'close', '', 'secondary')}</div></form>`)
      else modal('Удалить сотрудника из компании?', `<p><strong>${esc(member.person)}</strong><br>${esc(member.email)}</p><p>Доступ к спецценам, заказам и документам компании будет закрыт. Базовые цены и корзина остаются доступны без компании. Корзина и черновик оформления сотрудника очистятся. Его заказы, документы и авторство останутся у компании.</p><p>Учётная запись IEK ID не удаляется. Повторное присоединение потребует нового одобрения или принятия приглашения.</p><div class="actions">${btn('Отмена', 'close', '', 'secondary')}${btn('Подтвердить удаление', 'remove-employee', `data-email="${esc(member.email)}"`, 'secondary danger')}</div>`)
    }
    else if (action === 'remove-employee') { removeEmployee(state, target.dataset.email); dialog.close(); render(true); notify('Сотрудник удалён. Заказы и документы компании сохранены.') }
    else if (action === 'review-membership') {
      if (!canManageStaff(state) || staffRequest(state)?.status !== 'pending') throw new Error('Нет прав на рассмотрение заявки')
      modal('Подтвердить присоединение сотрудника?', `<p>${esc(staffRequest(state).person)} · ${esc(staffRequest(state).email)}</p><p>Сотрудник получит доступ к компании. Проверка пользователя останется без изменений.</p><div class="actions">${btn('Подтвердить присоединение', 'approve-membership', `data-id="${id}"`)}${btn('Отмена', 'close', '', 'secondary')}</div>`)
    }
    else if (action === 'preview-invitation') { previewInvitation(state); checkout = checkoutDraft(state); navigate('company/info'); notify('Демо: открыт получатель приглашения. Настоящего входа и отправки письма нет.') }
    else if (action === 'accept-invitation') { acceptInvitation(state); render(true); notify('Приглашение принято. Проверка представителя не изменилась.') }
    else if (action === 'approve-membership') { approveMembership(state, id); dialog.close(); render(true); notify('Заявка одобрена. Верификация сотрудника не изменилась.') }
    else if (action === 'guide') modal('Как пройти сценарий', '<h3>Покупка</h3><p>Товары и РРЦ доступны без входа. Добавьте позиции в корзину, затем войдите или зарегистрируйтесь через IEK ID — корзина сохранится. Авторизованный пользователь может отправить заявку менеджеру без компании. Для заказа подключите компанию, дождитесь проверки и оформите покупку.</p><p>Заявки и заказы обрабатываются в кабинете оператора. Ссылки на него, тестовые ИНН, переключение персонажа и сохранённые сценарии находятся в «Пульте демо».</p><h3>Сотрудник</h3><p>Администратор компании приглашает сотрудника или одобряет его заявку в разделе «Сотрудники». Переключение тестового персонажа в пульте не передаёт ему права автоматически.</p><a class="btn full" href="#catalog" data-action="close">Перейти в каталог →</a>')
    else if (action === 'login') identityModal()
    else if (action === 'logout') logout()
    else if (action === 'identity-edit') identityModal()
    else if (action === 'demo-login') { demoPanel.close(); identityModal() }
    else if (action === 'restore-scenario') { profileNameDraft = null; profileContactDraft = {}; profileEditing = {}; restoreScenario(state, Number(target.dataset.index)); checkout = checkoutDraft(state); staffFilters = { action: '', email: '' }; selectedQuantity = 1; navigate('company/info'); notify('Сценарий восстановлен. Заказы компаний не объединялись.') }
    else if (action === 'select-company') {
      const selected = searchCompanyDirectory(state.companyDraft.inn).find(company => company.id === id)
      const correcting = state.verificationRequestId && !bridgeWarning && (!linkedRequest || ['returned', 'rejected'].includes(linkedRequest.decision)) && selected?.inn === state.company?.inn
      if (state.role !== 'admin' || (state.stage !== 'identified' && !correcting) || !selected) throw new Error('Компания недоступна для выбора')
      state.companyDraft.selectedCompanyId = id
      state.companyDraft.inn = selected.inn
      document.querySelector('#company-form [name="inn"]').value = selected.inn
      document.querySelector('#company-lookup-body').innerHTML = companyLookupBody()
      document.querySelector('#company-form button[type="submit"]').focus()
    }
    else if (action === 'linked-edit') {
      state.companyDraft = { ...(linkedRequest ? {inn:linkedRequest.inn,name:linkedRequest.company,kpp:linkedRequest.kpp,legalAddress:linkedRequest.address,person:linkedRequest.person,position:linkedRequest.position,email:linkedRequest.email,phone:linkedRequest.phone} : {...state.company,...currentUser(state)}), step:target.dataset.step === '1' ? 1 : 2, authority:false }
      state.companyDraft.selectedCompanyId = searchCompanyDirectory(state.companyDraft.inn).find(company => company.inn === state.companyDraft.inn)?.id
      dialog.close(); navigate('company/connect')
    }
    else if (action === 'connection-back') { state.companyDraft.step = Math.max(1, (state.companyDraft.step || 1) - 1); render(true) }
    else if (action === 'profile') navigate('profile')
    else if (action === 'verify') navigate('company/info')
    else if (action === 'clear-search') { search = ''; catalogFamily = ''; catalogKind = ''; catalogAttributes = {}; catalogPageIndex = 1; catalogNotice = ''; render() }
    else if (action === 'catalog-page') { const page = Number(target.dataset.page); const pages = Math.ceil(catalogGroups({ search, family: catalogFamily, kind: catalogKind, attributes: catalogAttributes }).length / catalogPageSize); if (Number.isSafeInteger(page) && page >= 1 && page <= pages) { catalogPageIndex = page; render(); document.querySelector('.catalog-count').focus(); document.querySelector('.catalog-count').scrollIntoView({ block: 'start' }) } }
    else if (action === 'product-minus' || action === 'product-plus') { selectedQuantity = Math.max(1, Math.min(99, selectedQuantity + (action === 'product-plus' ? 1 : -1))); render() }
    else if (action === 'add') { const count = document.querySelector('#product-quantity').value; addItem(state, id, count); if (selectedConfiguration(state)?.id === id) state[`${state.role}Selection`] = null; selectedQuantity = Number(count); checkout.consent = false; checkout.step = 1; render(); notify('Позиция добавлена. Перейдите в корзину, чтобы проверить заказ.') }
    else if (action === 'qty-minus' || action === 'qty-plus') { const line = state.cart.find(item => item.id === id); changeQuantity(state, id, line.quantity + (action === 'qty-plus' ? 1 : -1)); checkout.consent = false; checkout.step = 1; render() }
    else if (action === 'remove') { if (!canUseCart(state)) throw new Error('Сначала войдите через IEK ID'); state.cart = state.cart.filter(item => item.id !== id); checkout.consent = false; checkout.step = 1; render(); notify('Позиция удалена из корзины') }
    else if (action === 'terms') modal('Демонстрационные условия', '<p>Здесь будут доступны условия заказа. В демонстрации они не являются офертой или договором.</p><p>Нажатие кнопки создаёт только тестовый заказ в этом браузере. Данные не отправляются, денежные обязательства не возникают.</p>')
    else if (action === 'document') {
      const order = visibleCompanyOrders().find(item => item.id === id)
      const kind = target.dataset.kind
      if (!canPurchase(state) || !order || !['invoice','agreement'].includes(kind) || !order[kind]) throw new Error('Документ недоступен')
      const title = kind === 'invoice' ? 'Образец счёта' : 'Образец лицензионного соглашения'
      modal(title, `<span data-order-document class="status yellow">ДЕМОНСТРАЦИЯ · НЕ ДОКУМЕНТ</span><p>Заказ ${order.id}<br>${esc(order.company.name)}<br>Тестовая сумма: ${money(order.total)}</p><p>Здесь в реальном магазине будет опубликованный файл. Образец не содержит платёжных реквизитов, прав на ПО или ключей активации.</p>`)
    }
    else if (action === 'reset') modal('Начать сценарий заново?', `<p>Будут удалены заявки на покупку и связанные заявки у оператора и все сохранённые данные этого демо в браузере: все сохранённые сценарии, компания, обе корзины и черновики оформления, заказы и документы, заявки, приглашение, участники, журнал действий, роли и проверки, фильтры и поиск каталога. Исходные документы проекта и другие данные браузера не затрагиваются.</p><div class="actions">${btn('Сбросить данные', 'confirm-reset')}${btn('Продолжить работу', 'close', '', 'secondary')}</div>`)
    else if (action === 'confirm-reset') { clearPurchaseInquiries(window.localStorage); purchaseInquiryDraft = null; clearLinkedRequests(window.localStorage); clearOrderProgress(window.localStorage); clearState(window.localStorage); storageBlocked = false; storageWarning = ''; state = initialState(); profileNameDraft = null; profileContactDraft = {}; profileEditing = {}; lastSaved = JSON.stringify(state); checkout = checkoutDraft(state); search = ''; staffFilters = { action: '', email: '' }; teamTab = 'members'; selectedQuantity = 1; catalogFamily = ''; catalogKind = ''; catalogAttributes = {}; catalogPageIndex = 1; catalogNotice = ''; dialog.close(); navigate('catalog'); notify('Данные сброшены. Начните со входа.'); return }
  } catch (error) { showError(error) }
  persist()
})

app.addEventListener('keydown', event => {
  const target = event.target.closest('[data-action="team-tab"]')
  if (!target || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  const buttons = [...app.querySelectorAll('[data-action="team-tab"]:not(:disabled)')]
  const index = buttons.indexOf(target)
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length
  selectTeamTab(buttons[next].dataset.tab)
  buttons[next].focus()
})

document.addEventListener('change', event => {
  const target = event.target
  try {
    if (target.id === 'staff-action' || target.id === 'staff-person') {
      staffFilters[target.id === 'staff-action' ? 'action' : 'email'] = target.value
      refreshStaffHistory(target.id)
      return
    }
    if (target.id === 'role') { profileNameDraft = null; profileContactDraft = {}; profileEditing = {}; switchRole(state, target.value); checkout = checkoutDraft(state); navigate(selectedConfiguration(state) ? 'prepare' : 'company/info'); notify(`Активный пользователь: ${currentUser(state).person}. Заявки и заказы сохранены.`) }
    else if (target.id === 'catalog-family' || target.dataset.catalogFilter) {
      catalogPageIndex = 1
      if (target.id === 'catalog-family') changeCatalogFamily(target.value)
      else {
        catalogNotice = ''
        if (target.dataset.catalogFilter === 'kind') catalogKind = target.value
        else catalogAttributes[target.dataset.catalogFilter] = target.value
      }
      render()
      document.getElementById(target.id).focus()
    }
    else if (target.id === 'real-category') {
      const source = catalogItems.find(item => item.id === target.dataset.source)
      const next = catalogPeers(source).find(item => `${item.kind}:${item.edition || ''}` === target.value)
      selectedQuantity = 1; navigate(`product/source:${next.id}`, target.id)
    }
    else if (target.id === 'real-variant') { selectedQuantity = 1; navigate(`product/source:${target.value}`, target.id) }
    else if (['pilot-edition', 'pilot-sku', 'pilot-key', 'pilot-virtual'].includes(target.id)) {
      const current = pilotConfigurations.find(item => item.id === route()[1]) ||
        pilotConfigurations.find(item => `source:${catalogItems.find(source => source.sku === item.sku)?.id}` === route()[1] && item.keySku === 'AUTO' && !item.virtualized)
      const edition = target.id === 'pilot-edition' ? target.value : current.edition
      const sku = target.id === 'pilot-sku' ? target.value : target.id === 'pilot-edition'
        ? pilotConfigurations.find(item => item.edition === edition)?.sku : current.sku
      const virtualized = target.id === 'pilot-virtual' ? target.value === 'yes' : current.virtualized
      const keySku = target.id === 'pilot-virtual' ? 'AUTO'
        : target.id === 'pilot-key' ? target.value : current.keySku
      const next = pilotConfigurations.find(item => item.sku === sku && item.keySku === keySku && item.virtualized === virtualized)
      if (!next) throw new Error('Эта комплектация недоступна')
      navigate(`product/${next.id}`, target.id === 'pilot-edition' ? 'pilot-edition' : target.id === 'pilot-sku' ? 'pilot-sku' : target.id === 'pilot-key' ? 'pilot-key' : 'pilot-virtual')
    }
    else if (target.id === 'product-version') { selectedQuantity = 1; navigate(`product/${nomenclatures.find(item => item.versionId === target.value).id}`, target.id) }
    else if (target.id === 'variant') { selectedQuantity = 1; navigate(`product/${target.value}`, target.id) }
    else if (target.id === 'protection') { const item = product(route()[1]); navigate(`product/${item.nomenclatureId}${target.value === 'code' ? '' : `--${target.value}`}`, target.id) }
    else if (target.id === 'product-quantity') {
      if (!target.value || !target.checkValidity()) { target.value = selectedQuantity; notify('Укажите целое количество от 1 до 99'); return }
      selectedQuantity = Number(target.value)
      render()
      app.querySelector('#product-quantity')?.focus()
    }
    else if (target.dataset.quantity) { changeQuantity(state, target.dataset.quantity, target.value); checkout.consent = false; checkout.step = 1; render() }
    else if (target.name === 'consent') checkout.consent = target.checked
  } catch (error) { render(); showError(error) }
  persist()
})

app.addEventListener('input', event => {
  if (event.target.id === 'product-quantity' && event.target.value && event.target.checkValidity()) {
    selectedQuantity = Number(event.target.value)
    const item = pilotConfigurations.find(option => option.id === app.querySelector('[data-pilot-id]')?.dataset.pilotId)
    if (item) {
      app.querySelector('#pilot-software-label').textContent = `${selectedQuantity} лиц. × ${money(item.softwareRrp)}`
      app.querySelector('#pilot-software-total').textContent = money(selectedQuantity * item.softwareRrp)
      app.querySelector('#pilot-key-label').textContent = pilotKeySummary(item, selectedQuantity)
      app.querySelector('#pilot-key-total').textContent = money(pilotKeyCost(item, selectedQuantity))
      app.querySelector('#pilot-total').textContent = money(pilotTotal(item, selectedQuantity))
    }
    app.querySelector('[data-action="product-minus"]').disabled = selectedQuantity <= 1
    app.querySelector('[data-action="product-plus"]').disabled = selectedQuantity >= 99
  }
  if (event.target.closest('#purchase-inquiry-form') && event.target.name === 'comment') purchaseInquiryDraft.comment = event.target.value
  if (event.target.closest('#profile-name-form')) profileNameDraft = event.target.value
  if (event.target.closest('.profile-contacts') && ['email', 'phone'].includes(event.target.name)) profileContactDraft[event.target.name] = event.target.value
  if (event.target.closest('#checkout-form')) clearCheckoutError(event.target)
  if (event.target.closest('#company-form') && ['name', 'inn', 'kpp', 'legalAddress', 'person', 'position', 'email', 'phone', 'authority'].includes(event.target.name)) {
    state.companyDraft[event.target.name] = event.target.name === 'authority' ? event.target.checked : event.target.value
    if (event.target.name === 'inn') {
      clearTimeout(companySearchTimer)
      delete state.companyDraft.selectedCompanyId
      state.companyDraft.authority = false
      const body = document.querySelector('#company-lookup-body')
      body.innerHTML = /^\d{3,12}$/.test(event.target.value) ? '<p role="status">Ищем компанию…</p>' : companyLookupBody()
      companySearchTimer = setTimeout(() => { if (body.isConnected) body.innerHTML = companyLookupBody() }, 300)
      document.querySelector('#company-form #form-error').textContent = ''
    }
    persist()
  }
  if (event.target.id === 'search') {
    search = event.target.value
    catalogPageIndex = 1
    catalogNotice = ''
    document.querySelector('#catalog-filter-notice').textContent = ''
    document.querySelector('#catalog-facets').innerHTML = catalogFacetControls()
    document.querySelector('#cards').innerHTML = productCards()
    persist()
  }
  if (event.target.closest('#checkout-form') && ['customer', 'project', 'email', 'recipient', 'phone', 'address'].includes(event.target.name)) {
    checkout[event.target.name] = event.target.value
    checkout.consent = false
    app.querySelector('[name="consent"]').checked = false
    persist()
  }
})

document.addEventListener('submit', event => {
  event.preventDefault()
  try {
    const values = Object.fromEntries(new FormData(event.target))
    if (event.target.id === 'identity-contact-form') { identityModal(demoIdentityContact(values.contact).value); return }
    else if (event.target.id === 'identity-code-form') { if (storageBlocked) throw new Error('Не удалось сохранить данные. Вход не выполнен.'); const existing = completeDemoIdentity(state, values.contact, values.code); persist(); dialog.close(); demoOpen = false; checkout = checkoutDraft(state); navigate(state.cart.length ? 'cart' : 'profile'); notify(existing ? 'Вход через IEK ID выполнен. Контакт подтверждён.' : 'Регистрация через IEK ID выполнена. Контакт подтверждён.'); return }
    else if (event.target.id === 'purchase-inquiry-form') { if (storageBlocked) throw new Error('Сохранение недоступно. Заявка не отправлена; корзина сохранена.'); const item=submitPurchaseInquiryAndClearCart(window.localStorage,state,values.comment,values.inquiryId); checkout=checkoutDraft(state); purchaseInquiryDraft = null; navigate(`inquiry/${item.id}`); notify('Заявка отправлена менеджеру. Корзина очищена.'); return }
    else if (event.target.id === 'access-result-form') { simulateAccessReview(state, event.target.dataset.kind, event.target.dataset.result, values.reason); checkout.consent = false; dialog.close(); render(true); notify('Результат и причина сохранены. Вторая проверка не изменена.') }
    else if (event.target.id === 'access-resubmit-form') { const kind = event.target.dataset.kind; resubmitAccessReview(state, kind, values.response, values); checkout.consent = false; render(true); showVerification(kind); notify('Повторная попытка на проверке. Доступ автоматически не подтверждён.') }
    else if (event.target.id === 'company-result-form') { simulateCompanyReview(state, event.target.dataset.result, values.reason); dialog.close(); render(true); notify('Реквизиты не изменены. Причина сохранена для исправления заявки.') }
    else if (event.target.id === 'company-change-form') { requestCompanyChange(state, values); dialog.close(); render(true); notify('Заявка отправлена на проверку. Действующие реквизиты пока не изменены.') }
    else if (event.target.id === 'employee-form') { updateEmployee(state, event.target.dataset.email, values); dialog.close(); render(true); notify('Данные сотрудника сохранены. Авторство старых заказов не изменено.') }
    else if (event.target.id === 'profile-name-form') { saveProfileName(state, values.person); profileNameDraft = null; profileEditing.person = false; render(true); document.querySelector('[data-action="profile-edit"][data-kind="person"]')?.focus(); notify('ФИО сохранено в личном профиле') }
    else if (event.target.id === 'company-form') {
      const step = state.companyDraft.step || 1
      Object.assign(state.companyDraft, values)
      if (step === 2) state.companyDraft.authority = values.authority === 'on'
      validateCompanyConnection(state.verificationRequestId ? {...state,stage:'identified'} : state, step)
      if (step < 3) { state.companyDraft.step = step + 1; render(true); document.querySelector('#connection-title').focus() }
      else { submitLinkedCompany(window.localStorage, state); navigate('company/info'); notify('Заявка на подключение отправлена. Раздел компании открыт; покупки ожидают проверки компании и представителя.') }
    }
    else if (event.target.id === 'invite-form') { inviteEmployee(state, values.email, values.hasIekId === 'on'); render(true); notify('Приглашение создано. Письмо не отправлено.') }
    else if (event.target.id === 'join-find-form') { findJoinCompany(state, values.inn); render(); document.querySelector('#join-request-form button')?.focus() }
    else if (event.target.id === 'join-request-form') { if (storageBlocked) throw new Error('Сохранение недоступно. Заявка не отправлена.'); const applicant = structuredClone(state); applicant.employee.position = values.position.trim(); employeeLinkedRequest = submitLinkedEmployee(window.localStorage, applicant); Object.assign(state, applicant); render(true); notify('Заявка отправлена оператору. Решение о роли появится после проверки.') }
    else if (event.target.id === 'checkout-form') {
      if ((checkout.step || 1) < 4) {
        goCheckoutStep((checkout.step || 1) + 1)
        persist()
        return
      }
      if (!validateCheckout(event.target)) return
      if (storageBlocked) throw new Error('Сохранение недоступно. Заказ не создан; корзина сохранена.')
      submitSavedOrder(window.localStorage,state, { ...values, consent: values.consent === 'on' })
      checkout = checkoutDraft(state)
      navigate('success')
    }
  } catch (error) { showError(error) }
  persist()
})

demoPanel.addEventListener('close', () => { demoOpen = false; document.querySelector('#demo-launcher')?.focus() })
dialog.addEventListener('close', () => {
  if (dialogOpener?.isConnected) dialogOpener.focus()
  else if (dialogOpener?.dataset.action === 'verification-details') document.querySelector(`[data-action="verification-details"][data-kind="${dialogOpener.dataset.kind}"]`)?.focus()
})
window.addEventListener('hashchange', () => { refreshVerification(); refreshPaidInquiryAccess(); render(true) })
window.addEventListener('storage', event => { if ([storageKey, verificationBridgeKey, purchaseInquiryKey, orderProgressKey, null].includes(event.key)) { refreshSavedState(); refreshVerification(); persist(); render(); if (dialog.open && dialog.querySelector('[data-order-document]')) dialog.close(); if (dialog.open && dialog.querySelector('[data-linked-verification]')) modal('Проверка компании и представителя', linkedVerificationPanel()) } })
window.addEventListener('focus', () => { refreshSavedState(); refreshVerification(); persist(); render() })
render()
