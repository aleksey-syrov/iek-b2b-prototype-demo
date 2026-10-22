import { catalogItems, catalogSource, catalogIssues } from './catalog-data.mjs'
export { catalogItems, catalogSource }

export const kindLabels = {
  software_license: 'Лицензии ПО', runtime_license: 'Исполнительные системы',
  redundancy_option: 'Резервирование', customization: 'Доработки',
  protection_key: 'Ключи защиты', client_package: 'Клиенты визуализации',
  protocol_option: 'Протокольные опции', protocol_bundle: 'Пакеты протоколов',
  device_option: 'Опции устройств', device_bundle: 'Пакеты устройств',
  device_license: 'Серверы устройств', protocol_license: 'Серверы протоколов',
  converter: 'Конвертеры', update: 'Обновления', subscription: 'Подписки',
  commissioning: 'Пусконаладка', training: 'Обучение', consultation: 'Консультации', support: 'Поддержка'
}
export const catalogFamilies = [...new Set(catalogItems.map(item => item.family))]
export const catalogPageSize = 12
export const realKeys = ['GSP3', 'OS_Sign'].map(sku => catalogItems.find(item => item.sku === sku))
export const pilotSkus = new Set(['MPS-MSRT4D-100-L', 'MPS-MSRT4D-500-L', 'MPS-MSRT4D-1K-L',
  'MPS-MSRT4D-100-ST', 'MPS-MSRT4D-500-ST', 'MPS-MSRT4D-1K-ST', 'MPS-MSRT4D-2K5-ST'])
export const pilotKeys = [
  ['OS_Sign', 1], ['OS_SignNet_10', 10], ['OS_SignNet_50', 50]
].map(([sku, capacity]) => ({ ...catalogItems.find(item => item.sku === sku), capacity }))
export const pilotDocuments = [
  ['Функциональные возможности', 'https://iek-digital.ru/getfile/3108/?show=y'],
  ['Свидетельство о регистрации', 'https://nas-mps-artifacts.storage.yandexcloud.net/iblock/06a/06aaa3bb92c9a6c47d233db763ed88ad/Svidetelstvo-o-gosudarstvennoy-registratsii-programm-dlya-EVM-MasterSCADA-4D-2020615823.pdf'],
  ['Руководство пользователя', 'https://nas-mps-artifacts.storage.yandexcloud.net/iblock/4e0/4e07d8a68c5bdfe107e7ed130fd5160c/Rukovodstvo-polzovatelya-dlya-ekspluatatsii-programmnogo-obespecheniya-MasterSCADA-4D.pdf']
]
const pilotDrivers = ['Modbus Universal MasterOPC server', 'SPODES MasterOPC Server', 'NZIF (SET, PSCH) MasterOPC Server']

export function canConfigure(item) {
  return pilotSkus.has(item.sku)
}

export function catalogLimit(item) {
  const questions = item.issues.map(id => ` ${id}: ${catalogIssues[id]}.`).join('')
  if (item.price.kind === 'on_request') return `Цена по запросу. Отправка позиций без согласованной цены в этой итерации не моделируется.${questions}`
  if (item.price.kind === 'free') return `Бесплатно по прайсу. Условия получения и ограничения требуют уточнения; в корзину пока не добавляем.${questions}`
  if (item.issues.length) return `Пока только просмотр. Требует уточнения:${questions}`
  return 'Позиция включена в справочник. Её комплектация и сценарий продажи пока не моделируются.'
}

function capacityText(item) {
  const a = item.attributes
  return [
    a.external_points != null ? `${a.external_points.toLocaleString('ru-RU')} внешних точек` : '',
    a.tag_capacity_text, a.package_capacity != null ? `${a.package_capacity} ${a.package_unit || 'устройств'}` : '',
    a.device_capacity_text, a.address_capacity_text, a.client_seats != null ? `${a.client_seats === 'unlimited' ? 'Без ограничения' : a.client_seats} клиентов` : ''
  ].filter(Boolean).join(' · ')
}

export function parameterText(item) {
  const a = item.attributes
  return [capacityText(item), a.subscription_term_text, a.key_type, a.billing_unit].filter(Boolean).join(' · ')
}

const catalogFilterFields = [
  { id: 'kind', label: 'Тип позиции', value: item => item.kind },
  { id: 'product', label: 'Сервер / продукт', value: item => item.family === 'MasterOPC' ? item.product : '' },
  { id: 'edition', label: 'Редакция', value: item => item.edition || '' },
  { id: 'capacity', label: 'Объём лицензии', value: capacityText },
  { id: 'term', label: 'Срок подписки', value: item => item.attributes.subscription_term_text || '' },
  { id: 'key', label: 'Тип ключа', value: item => item.attributes.key_type || '' }
]

function matchesCatalog(item, { search = '', family = '', kind = '', attributes = {} }, except = '') {
  if (family && item.family !== family) return false
  if (kind && except !== 'kind' && item.kind !== kind) return false
  if (catalogFilterFields.some(field => field.id !== 'kind' && field.id !== except &&
    attributes[field.id] && field.value(item) !== attributes[field.id])) return false
  const words = search.trim().toLocaleLowerCase('ru-RU').split(/\s+/).filter(Boolean)
  const haystack = `${item.sku} ${item.name} ${item.family} ${item.product} ${item.edition || ''} ${kindLabels[item.kind]} ${parameterText(item)}`.toLocaleLowerCase('ru-RU')
  return words.every(word => haystack.includes(word))
}

export function catalogFacets(filters = {}) {
  // Набор значений задаётся семейством, а не текущей выдачей: нулевые варианты не исчезают.
  const scope = catalogItems.filter(item => !filters.family || item.family === filters.family)
  return catalogFilterFields.filter(field => filters.family || field.id === 'kind').flatMap(field => {
    const values = [...new Set(scope.map(field.value).filter(Boolean))]
    if (!values.length) return []
    const matches = scope.filter(item => matchesCatalog(item, filters, field.id))
    return [{
      id: field.id, label: field.label,
      partial: scope.some(item => !field.value(item)),
      options: values.map(value => ({
        value, label: field.id === 'kind' ? kindLabels[value] : value,
        count: matches.filter(item => field.value(item) === value).length
      }))
    }]
  })
}

export function normalizeCatalogFilters(saved) {
  const family = catalogFamilies.includes(saved?.family) ? saved.family : ''
  const filters = { family, search: typeof saved?.search === 'string' ? saved.search : '', kind: '', attributes: {}, page: 1 }
  for (const field of catalogFacets({ family })) {
    const value = field.id === 'kind' ? saved?.kind : saved?.attributes?.[field.id]
    if (field.options.length < 2 || !field.options.some(option => option.value === value)) continue
    if (field.id === 'kind') filters.kind = value
    else filters.attributes[field.id] = value
  }
  const pages = Math.max(1, Math.ceil(catalogGroups(filters).length / catalogPageSize))
  if (Number.isSafeInteger(saved?.page) && saved.page > 0) filters.page = Math.min(saved.page, pages)
  return filters
}

export function catalogGroups(filters = {}) {
  const groups = new Map()
  for (const item of catalogItems) {
    if (!matchesCatalog(item, filters)) continue
    const id = `${item.family} / ${item.product}`
    if (!groups.has(id)) groups.set(id, { name: item.product, family: item.family, items: [] })
    groups.get(id).items.push(item)
  }
  return [...groups.values()].sort((a, b) => Number(b.items.some(canConfigure)) - Number(a.items.some(canConfigure)))
}

export function catalogPeers(item) {
  return catalogItems.filter(other => other.family === item.family && other.product === item.product)
}

// Сохраняем прежние ID для корзин и заказов, созданных до пилота из нового файла.
const legacyConfigurations = catalogItems.filter(item => item.price.kind === 'fixed' && item.issues.length === 0 &&
  (item.kind === 'runtime_license' || (item.family === 'MasterOPC' && pilotDrivers.includes(item.product)))).flatMap(item => realKeys.map(key => ({
  id: `price2026:${item.sku}:${key.sku}`, sourceCatalog: true,
  name: item.product, edition: item.edition || '', description: item.name,
  sku: item.sku, nomenclatureId: item.sku, productId: `${item.family}/${item.product}`,
  capacity: item.attributes.external_points ?? null, parameterText: parameterText(item),
  versionId: null, version: '', sourcePage: item.page,
  protection: key.sku, protectionName: key.name, keySku: key.sku,
  physical: key.sku === 'OS_Sign', softwareRrp: item.price.amount_minor, keyRrp: key.price.amount_minor,
  rrp: item.price.amount_minor + key.price.amount_minor
})))

export const pilotConfigurations = catalogItems.filter(canConfigure).flatMap(item =>
  [...pilotKeys, { sku: 'AUTO', name: 'Автоподбор ключей', capacity: null, price: pilotKeys[0].price }]
    .flatMap(key => [false, true].filter(virtualized => !virtualized || key.capacity !== 1).map(virtualized => ({
    id: `pilot2026:${item.sku}:${key.sku}:${virtualized ? 'virtual' : 'local'}`,
    sourceCatalog: true, pilot: true, virtualized, keyCapacity: key.capacity,
    name: item.product, edition: item.edition || '', description: item.name,
    sku: item.sku, nomenclatureId: item.sku, productId: `${item.family}/${item.product}`,
    capacity: item.attributes.external_points ?? null, parameterText: parameterText(item),
    versionId: null, version: '', sourcePage: item.page,
    protection: key.sku, protectionName: key.name, keySku: key.sku,
    physical: true, softwareRrp: item.price.amount_minor,
    keyRrp: key.sku === 'AUTO' && virtualized ? pilotKeys[1].price.amount_minor : key.price.amount_minor,
    rrp: item.price.amount_minor + (key.sku === 'AUTO' && virtualized ? pilotKeys[1].price.amount_minor : key.price.amount_minor)
  }))))

export const realConfigurations = [...legacyConfigurations, ...pilotConfigurations]

export function pilotKeyMix(item, quantity) {
  if (item.keySku !== 'AUTO') return [{ sku: item.keySku, quantity: Math.ceil(quantity / item.keyCapacity) }]
  if (!item.virtualized && quantity === 1) return [{ sku: 'OS_Sign', quantity: 1 }]
  let best
  for (let net50 = 0; net50 <= Math.ceil(quantity / 50); net50++) {
    const net10 = Math.ceil(Math.max(0, quantity - net50 * 50) / 10)
    const count = net50 + net10
    const cost = net50 * pilotKeys[2].price.amount_minor + net10 * pilotKeys[1].price.amount_minor
    if (!best || count < best.count || (count === best.count && cost < best.cost)) best = { net50, net10, count, cost }
  }
  return [{ sku: 'OS_SignNet_50', quantity: best.net50 }, { sku: 'OS_SignNet_10', quantity: best.net10 }].filter(key => key.quantity)
}

export function pilotKeyQuantity(item, quantity) {
  return pilotKeyMix(item, quantity).reduce((count, key) => count + key.quantity, 0)
}

export function pilotKeyCost(item, quantity) {
  return pilotKeyMix(item, quantity).reduce((cost, key) => cost + key.quantity * pilotKeys.find(option => option.sku === key.sku).price.amount_minor, 0)
}

export function pilotKeySummary(item, quantity) {
  return pilotKeyMix(item, quantity).map(key => `${key.quantity} × ${key.sku}`).join(' + ')
}

export function pilotTotal(item, quantity) {
  return item.softwareRrp * quantity + pilotKeyCost(item, quantity)
}

export function lineVariant(item) {
  return item.sourceCatalog ? [item.parameterText, item.pilot && item.keySku === 'AUTO' && item.quantity ? pilotKeySummary(item, item.quantity) : item.protectionName].filter(Boolean).join(' · ')
    : `${item.version || 'Версия не указана'} · ${item.capacity} точек · ${item.protectionName || 'Программная активация кодом'}`
}
