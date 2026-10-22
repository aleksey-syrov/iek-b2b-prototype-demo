export const currentOperator = 'Елена Крылова'

// shortcut: assignment is local to the demo; use an atomic server claim when connecting multiple operators.
export function takeOwnership(item) {
  if (item.assignee && item.assignee !== currentOperator) throw new Error('Уже в работе у другого оператора.')
  return { ...item, assignee: currentOperator }
}

export function addInternalNote(item, value, now = new Date().toISOString()) {
  const text = value.trim()
  if (!text) throw new Error('Введите заметку.')
  if (text.length > 1000) throw new Error('Заметка должна быть не длиннее 1000 символов.')
  return { ...item, notes: [...(item.notes || []), { text, author: currentOperator, date: now }] }
}

export function workQueue(items, owner = 'all', sort = 'newest') {
  return items.filter(item => owner === 'all' || (owner === 'mine' ? item.assignee === currentOperator : !item.assignee))
    .sort((a, b) => (Date.parse(a.date) - Date.parse(b.date)) * (sort === 'oldest' ? 1 : -1))
}

export function ageLabel(date, now = Date.now()) {
  const minutes = Math.max(0, Math.floor((now - Date.parse(date)) / 60000))
  if (minutes < 1) return 'менее минуты'
  if (minutes < 60) return `${minutes} мин.`
  const hours = Math.floor(minutes / 60)
  return hours < 24 ? `${hours} ч. ${minutes % 60} мин.` : `${Math.floor(hours / 24)} дн. ${hours % 24} ч.`
}

export function nextRequestId(sequence, currentId, eligible) {
  const index = sequence.indexOf(currentId)
  if (index < 0) return null
  return sequence.slice(index + 1).find(id => eligible.some(item => item.id === id)) || null
}

export const commentTemplates = [
  ['Уточнить полномочия', 'Уточните вашу должность и основание полномочий действовать от имени компании.'],
  ['Уточнить реквизиты', 'Проверьте название, КПП и юридический адрес компании и отправьте исправленные сведения.'],
  ['Уточнить рабочий контакт', 'Укажите рабочий email или контакт компании для подтверждения вашей связи с ней.'],
  ['Отказ: связь не подтверждена', 'Связь представителя с указанной компанией не подтверждена.']
]

export function appendTemplate(comment, index) {
  if (!commentTemplates[index]) throw new Error('Выберите шаблон.')
  const result = [comment.trim(), commentTemplates[index][1]].filter(Boolean).join('\n\n')
  if (result.length > 1000) throw new Error('С шаблоном комментарий превысит 1000 символов. Сократите текст.')
  return result
}
