export const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

export function dataFields(fields) {
  return `<dl class="data-fields">${fields.map(([label, value, wide]) => `<div${wide ? ' class="wide"' : ''}><dt>${esc(label)}</dt><dd>${esc(value === '' || value == null ? 'Не указан' : value)}</dd></div>`).join('')}</dl>`
}
import { contactVerified, canReviewAccess, verificationReviews, reviewLabels } from './model.mjs?v=order-flow-24'

export function verificationStatus(state, kind) {
  let status = verificationReviews(state)[kind].status
  if (state.stage === 'guest') status = 'guest'
  else if (!canReviewAccess(state, kind)) status = 'unlinked'
  else if (state.stage === 'identified' && kind === 'user' && !state[`${state.role}Reviews`]) status = 'unrequested'
  const labels = { guest: 'Сначала войдите', unlinked: 'Связь не установлена', unrequested: 'Не запрошена', ...reviewLabels }
  const symbols = { confirmed: '✓', pending: '◷', returned: '!', rejected: '×' }
  return { status, label: labels[status], icon: symbols[status] || '–',
    tone: status === 'confirmed' ? 'success' : ['returned', 'rejected'].includes(status) ? 'attention' : status === 'pending' ? 'waiting' : 'neutral',
    needsAction: ['returned', 'rejected'].includes(status) }
}

export function checkoutFieldError(field) {
  if (field.name === 'consent') return field.checked ? '' : 'Подтвердите ознакомление с условиями заказа'
  const value = String(field.value || '').trim()
  if (field.required && !value) return 'Заполните это поле'
  if (value && field.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'Укажите email в формате name@example.ru'
  if (value && field.name === 'phone' && !/^[+\d()\s-]{7,30}$/.test(value)) return 'Укажите телефон: 7–30 символов, цифры, +, скобки и дефисы'
  if (field.maxLength > 0 && value.length > field.maxLength) return `Не более ${field.maxLength} символов`
  if (field.validity && !field.validity.valid) return 'Проверьте формат значения'
  return ''
}
export function checkoutBlockers(state) {
  if (state.stage === 'guest') return ['Войдите через IEK ID']
  const user = verificationStatus(state, 'user'), company = verificationStatus(state, 'company')
  return [...['email', 'phone'].filter(kind => !contactVerified(state, kind)).map(kind => `Подтвердите ${kind === 'email' ? 'почту' : 'телефон'} через IEK ID в личном профиле`), company.status === 'unlinked' ? (state.role === 'admin' ? 'Добавьте компанию и отправьте данные на проверку' : 'Завершите присоединение к компании') : company.status !== 'confirmed' ? `Связь с компанией: ${company.label.toLowerCase()}` : '',
    user.status !== 'confirmed' ? `Верификация пользователя: ${user.label.toLowerCase()}` : ''].filter(Boolean)
}
