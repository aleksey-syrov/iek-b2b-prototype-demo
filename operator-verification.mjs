export const requestFieldLabels = { company:'Название компании', inn:'ИНН', kpp:'КПП', address:'Юридический адрес', person:'ФИО', position:'Должность', email:'Почта', phone:'Телефон' }

export function newRequest(companyExists = false) {
  return { companyExists, decision: 'pending', sync: { company: 'not_started', contact: 'not_started' }, comment: '', history: [] }
}

export function decide(request, decision, comment = '', authorityConfirmed = false) {
  if (request.decision !== 'pending') throw new Error('По этой заявке уже принято решение.')
  if (!['approved', 'returned', 'rejected'].includes(decision)) throw new Error('Неизвестное решение.')
  const note = comment.trim()
  if (note.length > 1000) throw new Error('Комментарий должен быть не длиннее 1000 символов.')
  if (decision !== 'approved' && !note) throw new Error('Укажите причину: её увидит заявитель.')
  if (decision === 'approved' && !authorityConfirmed) throw new Error('Подтвердите связь представителя с компанией и его полномочия.')
  const labels = { approved: 'Оператор подтвердил полномочия представителя', returned: 'Заявка возвращена на уточнение', rejected: 'Заявка отклонена' }
  return { ...request, decision, comment: note, sync: { company: decision === 'approved' ? 'pending' : 'not_started', contact: decision === 'approved' ? 'pending' : 'not_started' },
    history: [...request.history, { title: labels[decision], note, date: new Date().toISOString() }] }
}

const entityLabels = { company: 'Контрагент', contact: 'Контактное лицо' }
const entityStatusLabels = { not_started: 'Не запрошено', pending: 'Ожидаем подтверждение', ready: 'Подтверждено', error: 'Ошибка обмена' }

export function syncStatus(request) {
  const states = Object.values(request.sync)
  if (states.includes('error')) return 'error'
  if (states.every(state => state === 'ready')) return 'ready'
  return states.includes('pending') ? 'pending' : 'not_started'
}

export function requestCanPurchase(request) {
  return syncStatus(request) === 'ready' && ['emailVerified', 'phoneVerified'].every(key => request.id?.startsWith('VR-LK-') ? request[key] === true : request[key] !== false)
}

export function completeSync(request, entity, result) {
  if (!Object.hasOwn(entityLabels, entity)) throw new Error('Неизвестный объект обмена.')
  if (!['ready', 'error'].includes(result)) throw new Error('Неизвестный результат обмена.')
  if (request.decision !== 'approved' || request.sync[entity] !== 'pending') throw new Error('Нет ожидающего обмена с 1С.')
  const next = { ...request, sync: { ...request.sync, [entity]: result } }
  const subject = entity === 'company' ? request.automated ? 'связь с компанией' : 'контрагента' : 'контактное лицо'
  return { ...next, history: [...request.history, {
    title: result === 'ready' ? `1С подтвердила ${subject}` : `Ошибка обмена с 1С: ${subject}`,
    note: result === 'error' ? request.automated ? 'Автоматический обмен можно повторить.' : 'Решение оператора сохранено. Обмен можно повторить.' : syncStatus(next) === 'ready' ? request.automated ? 'Подтверждения получены. Доступ зависит от решения администратора компании.' : requestCanPurchase(next) ? 'Оба подтверждения получены. Доступ к оформлению заказов открыт.' : 'Оба подтверждения получены. Для покупок требуются подтверждённые почта и телефон IEK ID.' : 'Доступ остаётся закрытым до получения второго подтверждения.', date: new Date().toISOString()
  }] }
}

export function retrySync(request, entity) {
  if (!Object.hasOwn(entityLabels, entity)) throw new Error('Неизвестный объект обмена.')
  if (request.decision !== 'approved' || request.sync[entity] !== 'error') throw new Error('Повтор обмена сейчас недоступен.')
  return { ...request, sync: { ...request.sync, [entity]: 'pending' }, history: [...request.history, { title: `Обмен с 1С запущен повторно: ${entityLabels[entity].toLocaleLowerCase('ru-RU')}`, note: '', date: new Date().toISOString() }] }
}

