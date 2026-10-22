import { realConfigurations, pilotKeyMix, pilotKeyQuantity, pilotKeySummary, pilotTotal } from './catalog.mjs'
// Данные и переходы только для прототипа, не контракты 1С/МДМ.
export const stages = {
  guest: 'Гость',
  identified: 'IEK ID · без компании',
  pending: 'Компания на проверке',
  member: 'Пользователь проверен · связь ещё нет',
  verified: 'Доступ подтверждён'
}

export const demoCompany = {
  name: 'ООО «Демо Инжиниринг»', inn: '0000000000',
  kpp: '000000000', legalAddress: 'Демо-город, Тестовая улица, дом 1',
  person: 'Анна Смирнова', position: 'Инженер проектов', email: 'anna@example.test', phone: '+7 000 000-00-01'
}

export const demoEmployee = { person: 'Иван Петров', position: 'Инженер', email: 'ivan@contractor.test', phone: '+7 000 000-00-02' }

// shortcut: только справочник реквизитов, не поиск существующих ЛК; объединение учётных записей требует отдельного сценария.
export const demoCompanyDirectory = [
  { id: 'demo-engineering', inn: '1111111111', name: 'ООО «Тест Инжиниринг»', kpp: '111111111', legalAddress: 'Демо-город, улица Инженерная, дом 1' },
  { id: 'demo-systems', inn: '1112223334', name: 'ООО «Тест Системы»', kpp: '111222333', legalAddress: 'Демо-город, улица Системная, дом 3' },
  { id: 'demo-automation', inn: '2222222222', name: 'ООО «Тест Автоматика»', kpp: '222222222', legalAddress: 'Демо-город, улица Автоматики, дом 2' },
  { id: 'demo-existing-1c', inn: '2223334444', name: 'ООО «Тест Партнёр»', kpp: '222333444', legalAddress: 'Демо-город, улица Партнёрская, дом 4', companyExists: true, code: 'ДЕМО-1С-0001' }
]

export function searchCompanyDirectory(inn) {
  const prefix = String(inn).trim()
  if (!/^\d{3,12}$/.test(prefix)) return []
  return demoCompanyDirectory.filter(company => company.inn.startsWith(prefix)).map(company => ({ ...company }))
}

export function registerCompanyFromSearch(state, values) {
  if (!/^(\d{10}|\d{12})$/.test(String(values.inn).trim())) throw new Error('Укажите полный ИНН: 10 или 12 цифр')
  if (state.verificationRequestId) {
    if (values.inn !== state.company?.inn) throw new Error('Для исправления заявки сохраните исходный ИНН компании')
    registerCompany(state, values)
    return
  }
  const matches = searchCompanyDirectory(values.inn)
  const selected = matches.find(company => company.id === state.companyDraft.selectedCompanyId)
  if (matches.length && !selected) throw new Error('Выберите компанию из найденных')
  if (!matches.length && state.companyDraft.selectedCompanyId) throw new Error('ИНН изменился. Выберите компанию заново')
  registerCompany(state, { ...values, ...selected })
}

export function companyConnectionValues(state) {
  const draft = { ...currentUser(state), inn: '', name: '', kpp: '', legalAddress: '', ...state.companyDraft }
  if (state.verificationRequestId) return draft
  const selected = searchCompanyDirectory(draft.inn).find(company => company.id === draft.selectedCompanyId && company.inn === draft.inn)
  return { ...draft, ...selected }
}

export function validateCompanyConnection(state, step) {
  if (state.stage !== 'identified' || state.role !== 'admin') throw new Error('Подключение компании сейчас недоступно')
  if (![1, 2, 3].includes(step)) throw new Error('Неизвестный шаг подключения')
  const values = companyConnectionValues(state)
  // Validate against a copy: moving between wizard steps must never submit a request.
  const candidate = structuredClone(state)
  registerCompanyFromSearch(candidate, step === 1 ? { ...values, ...userContact(demoCompany) } : values)
  if (step > 1 && values.authority !== true) throw new Error('Подтвердите, что представляете компанию и запрашиваете полномочия администратора')
  if (step > 1) {
    const user = currentUser(state)
    if (values.email !== user.email || values.phone !== user.phone) throw new Error('Почта и телефон берутся из IEK ID. Их нельзя менять в заявке')
    if (!emailVerified(state)) throw new Error('Сначала подтвердите почту через IEK ID')
    if (!contactVerified(state, 'phone')) throw new Error('Сначала подтвердите телефон через IEK ID')
  }
  return values
}

export const catalogProducts = [{ id: 'ms4d', name: 'MasterSCADA 4D' }]
export const productVersions = [
  { id: 'demo-v1', productId: 'ms4d', name: 'Демо-версия 1' },
  { id: 'demo-v2', productId: 'ms4d', name: 'Демо-версия 2' }
]
export const protectionOptions = [
  { id: 'code', name: 'Программная активация кодом', sku: '', rrp: 0, physical: false },
  { id: 'sign', name: 'Sign · физический ключ для ПК', sku: 'DEMO-SIGN', rrp: 800000, physical: true },
  { id: 'net10', name: 'Sign-net · 10 подключений', sku: 'DEMO-SIGN-NET10', rrp: 1800000, physical: true },
  { id: 'net50', name: 'Sign-net · 50 подключений', sku: 'DEMO-SIGN-NET50', rrp: 3500000, physical: true }
]
export const nomenclatures = [
  { id: 'lite', name: 'MasterSCADA 4D', edition: 'Lite', capacity: 512,
    productId: 'ms4d', versionId: 'demo-v1',
    sku: 'DEMO-MS4D-L512', rrp: 15000000, description: 'Для локальных систем управления и небольших объектов автоматизации.' },
  { id: 'standard', name: 'MasterSCADA 4D', edition: 'Standard', capacity: 1500,
    productId: 'ms4d', versionId: 'demo-v1',
    sku: 'DEMO-MS4D-S1500', rrp: 32000000, description: 'Для распределённых систем мониторинга и комплексных инженерных проектов.' },
  { id: 'lite-v2', name: 'MasterSCADA 4D', edition: 'Lite', capacity: 1024,
    productId: 'ms4d', versionId: 'demo-v2', sku: 'DEMO-MS4D-V2-L1024', rrp: 22000000,
    description: 'Условная позиция второй демо-версии для проверки навигации, не реальный релиз.' }
]
// shortcut: H19 — один ключ на единицу ПО; заменить после согласования совместимости и количества ключей. Это не артикул МДМ.
export const products = nomenclatures.flatMap(item => protectionOptions.map(key => ({ ...item,
  id: key.id === 'code' ? item.id : `${item.id}--${key.id}`, nomenclatureId: item.id,
  version: productVersions.find(version => version.id === item.versionId).name,
  protection: key.id, protectionName: key.name, keySku: key.sku, physical: key.physical,
  softwareRrp: item.rrp, keyRrp: key.rrp, rrp: item.rrp + key.rrp
}))).concat(realConfigurations)
export const deliveryMethods = { email: 'Электронно, по email', courier: 'Курьером в руки' }
export function deliveryCost(method) { return method === 'courier' ? 150000 : 0 }
export function allowedDelivery(lines) {
  return lines.some(line => line.physical) ? ['courier'] : ['email']
}

export function receivingGroups(lines) {
  return { courier: lines.filter(line => line.physical), email: lines.filter(line => !line.physical) }
}

export function orderDelivery(lines, values, companyEmail) {
  const allowed = allowedDelivery(lines)
  const hasCodes = receivingGroups(lines).email.length > 0
  const method = values.delivery || (allowed.includes('email') ? 'email' : '')
  if (!allowed.includes(method)) throw new Error('Выберите допустимый способ получения для состава заказа')
  const fields = Object.fromEntries(['recipient', 'phone', 'address', 'email'].map(key => [key, String(values[key] ?? '').trim()]))
  if (Object.values(fields).some(value => value.length > 250)) throw new Error('Поля получения: не более 250 символов')
  if (hasCodes) {
    if (values.email === undefined) fields.email = companyEmail
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email)) throw new Error('Укажите email получателя')
  }
  if (method === 'courier' && (!fields.recipient || !/^[+\d()\s-]{7,30}$/.test(fields.phone))) throw new Error('Укажите получателя и телефон для физического получения')
  if (method === 'courier' && !fields.address) throw new Error('Укажите адрес доставки')
  return { format: 2, method, cost: deliveryCost(method), email: hasCodes ? fields.email : '',
    recipient: method === 'email' ? '' : fields.recipient, phone: method === 'email' ? '' : fields.phone,
    address: method === 'courier' ? fields.address : '' }
}

export const hypotheses = [
  ['H28', 'Пилот каталога MasterSCADA 4D', 'Семь лицензий Lite и Standard, три физических ключа и правила их количества взяты из файла заказчика «Прототип для ДИТ каталог ИМ.xlsx». Без виртуализации доступны OS_Sign, OS_SignNet_10 и OS_SignNet_50, по умолчанию OS_Sign; с виртуализацией — только сетевые ключи, по умолчанию OS_SignNet_10. Количество ключей округляется вверх по ёмкости выбранного типа, без автоматической замены на другой тип. Все семь лицензий невозвратные. Цены без НДС взяты из файла и ещё не утверждены как действующая РРЦ. Другие позиции прайса пока только для просмотра; старые пробные конфигурации остаются в сохранённых корзинах и заказах. Реальные оплата, доставка и обмен с 1С не подключены.'],
  ['H25', 'Цельный путь к заказу', 'По запросу команды единый экран объединяет вход, компанию, верификацию пользователя и подтверждение связи. Гостевой выбор сохраняется отдельно от корзины; после входа его можно перенести в корзину и добавлять другие позиции по РРЦ. Отправка заказа закрыта до обеих проверок. Гипотезы демо: один незавершённый выбор на персонажа, новый выбор заменяет прежний; хранение локально без срока; гостевой выбор переходит к тестовому пользователю при имитации входа. Цена не фиксируется: после проверки показывается текущая спеццена, доставка рассчитывается при оформлении. Возврат к оформлению — по явной кнопке, без автоматической отправки: сохранённый выбор по явной кнопке один раз добавляется к текущей корзине, одинаковые комплектации суммируются с пределом 99. Отмена выбора не очищает корзину. Выбор следует за человеком при переключении/передаче ролей. Создание и присоединение используют существующие сценарии двух тестовых персонажей; выбор реального способа проверки, SSO-возврат и межустройственная синхронизация не реализованы. Пульт вынесен в отдельную боковую панель с разделами «Персонаж», «Решения проверяющего», «Сценарии и данные»: это имитации, не функции покупателя.'],
  ['H01', 'Проверка компании', 'Проверку пользователя и подтверждение связи с компанией имитирует панель прототипа. Исполнитель, порядок и сроки проверок не согласованы (Q01/Q02).'],
  ['H02', 'Корзина до проверки', 'Уточнение команды: базовые цены и корзина доступны гостю до входа через IEK ID. Спеццены и отправка заказа требуют подтверждённых пользователя и связи с компанией. Это заменяет прежнюю гипотезу запрета корзины (Q03).'],
  ['H03', 'Цены и НДС старого демо', 'Только для сохранённых DEMO-позиций цены и артикулы вымышлены, для СИ Silver показана скидка 12% от РРЦ. Ставка для MasterSCADA известна, но база скидки и округление не утверждены. Реальные SKU в новой витрине используют снимок прайса без скидки компании — H28. В демо НДС не начисляется; налоговый режим реального заказа требует согласования (Q04/Q05).'],
  ['H04', 'Комплектация и получение', 'Первоначальные два SKU с кодом сохранены для совместимости. Текущий демонстрационный каталог, комплектация и получение описаны в H18–H20. Реальный ассортимент, совместимость и условия электронной передачи требуют решения (Q04/Q08/Q09).'],
  ['H05', 'Порог проектных сведений', 'Для демо порог 800 000 ₽ считается после скидки, без НДС и доставки. База порога не согласована. Само требование двух полей от 800 000 ₽ включительно следует из ФЗ (Q05).'],
  ['H06', 'Заказ и документы', 'Начальный статус «На ручной обработке» — гипотеза. Кнопки публикации счёта, оплаты и соглашения имитируют разные события, не обещают реальной автоматизации. Сроки и действия менеджера не заданы (Q06–Q08).'],
  ['H07', 'Поведение прототипа', 'Одна активная тестовая компания в сценарии, объединение одинаковых комплектаций (SKU ПО и способ защиты), очистка корзины после отправки и предел 99 шт. выбраны для демо. Разные ключи одного SKU остаются отдельными строками. Сценарий сохраняется локально в этом браузере; «Начать заново» удаляет сохранение. При переключении «без компании» прежний сценарий сохраняется отдельно с возможностью возврата из пульта; новая компания не наследует его участников или заказы. Это не договорённости о поведении промышленного сервиса.'],
  ['H08', 'Результат одобрения заявки', 'Оператор проверяет каждого заявителя. Первый подтверждённый оператором становится администратором; последующие после проверки попадают в заявки на присоединение и не получают доступ без отдельного решения администратора. Одобрение администратором назначает роль сотрудника и подтверждает связь, но не заменяет проверку контактов и обмен с 1С.'],
  ['H09', 'Базовые цены без входа', 'Уточнение команды: базовые цены видны до входа через IEK ID, даже без компании или до одобрения присоединения. Можно запросить верификацию пользователя отдельно. Спеццены и оформление требуют подтверждённых пользователя и связи с компанией. Сразу доступны каталог, корзина, «Компания» для данных и проверки связи, «Мой доступ» для данных и верификации пользователя. Внутренние разделы компании, сотрудники, заказы, документы и лицензии до привязки закрыты, включая прямые ссылки. Наполнение корзины до подтверждения разрешено командой (H02).'],
  ['H10', 'Два персонажа в демо', 'Переключатель меняет тестового персонажа, а не выдаёт права реальному человеку. Корзины отдельные, история заказов общая для подтверждённых участников. Лимит трёх сотрудников проверяется при одобрении; применение лимита к этому пути требует согласования. Повторная активная заявка блокируется. Отклонение и новая попытка — H15. Отзыв заявки самим сотрудником, уведомления и реальная проверка IEK ID не реализованы.']
]
hypotheses.push(
  ['H27', 'Добавление компании по ИНН', 'Решение команды: начать с ИНН, искать во внутреннем справочнике, предложить выбор найденной компании либо ручной ввод при отсутствии совпадений. В демо поиск по началу ИНН от 3 цифр с задержкой 300 мс после последнего ввода; выбор подставляет полный ИНН. Ручная форма открывается только при полном ИНН из 10 или 12 цифр без совпадений; контрольная сумма не проверяется. Все записи вымышлены. Найденная запись содержит только реквизиты, а не существующий ЛК с сотрудниками и заказами; выбор не даёт доступа и не подтверждает связь. Два тестовых заявителя могут подать отдельные заявки на один ИНН; роль определяет порядок одобрения оператором, а не порядок подачи. Гипотезы интерфейса: найденные реквизиты здесь только для чтения; вручную название обязательно, КПП и юридический адрес пока необязательны; состав полей и разрешение дублей ещё нужно уточнить. Обмен с 1С и внешние реестры не подключены.'],
  ['H26', 'Исправление заявки в магазине', 'Решение команды: причина и отправленные сведения доступны в магазине; исправленная версия применяется только после подтверждения, старые заказы не меняются. Гипотезы: в заявке пользователя редактируются ФИО, должность, рабочий email и телефон; в проверке компании администратор/создатель исправляет название, КПП и юридический адрес, ИНН заблокирован. Сотрудник уточняет связь пояснением, без прав менять реквизиты. Пояснение при повторной проверке доступа пока обязательно. IEK ID используется для входа, а исправленный рабочий email — контакт магазина: реальная привязка к стабильному ID, владельцы полей и обратная синхронизация не согласованы. В демо смена email сохраняет членство того же человека; ссылки текущей заявки/приглашения обновляются, события журнала и заказы остаются историческими. Состав документов, критерии, уведомления и применение относительно подтверждения 1С ещё не согласованы. Пульт имитирует итоговое решение, без вызовов IEK ID, RabbitMQ и 1С. Получатели в черновике не подменяются новыми контактами автора. Старые сохранения без снимка показывают текущие значения с предупреждением, без вымышленной истории.'],
  ['H24', 'Вход до доступа к ЛК', 'Уточнение команды: гость не видит меню ЛК; сначала нужен вход через IEK ID на сайте iek-digital.ru. В демо скрыты навигация ЛК и ссылки на заказы; прямые ссылки на разделы ЛК и заказы показывают приглашение войти, без данных компании. Вход и регистрация показаны локальными модалками с кодом 123456: настоящий аккаунт не создаётся. Адрес авторизации, callback и восстановление исходного маршрута ещё не согласованы.'],
  ['H23', 'Отказ, исправление и повторная проверка', 'По запросу команды добавлены отдельные результаты проверки пользователя и связи с компанией: на проверке, подтверждено, нужно исправить, отказано. ФЗ не определяет проверяющего, причины, сроки и повторные попытки. Гипотезы демо: причина обязательна и видна самому пользователю; после возврата или отказа можно сразу подать пояснение/исправленные сведения, без лимита попыток. Исправление исходных полей в магазине и применение после подтверждения добавлены решением команды — H26. Внешний профиль IEK ID не обновляется; документы и синхронизация не согласованы. Повторная подача меняет только выбранную проверку на ожидание; предыдущее решение сохраняется для контекста, это не полный аудит. Спеццены и оформление доступны после обеих проверок. По уточнению команды базовые цены видны гостю, а запрос проверки пользователя доступен после входа, до компании (H09); список сотрудников требует членства. При создании компании результат проверки пользователя сохраняется, если его контактные данные не изменены; повторная проверка при изменении этих данных — гипотеза демо. Доступ к старым заказам временно закрыт прежним ограничением демо, но сами заказы, корзины, реквизиты и журнал сотрудников не меняются. Это не согласованная политика отзыва ранее выданных прав. Для сотрудника сначала нужно присоединение; одобрение заявки/принятие приглашения по H08/H11 подтверждает связь, не пользователя. Пульт позволяет начать тестовую проверку подтверждённого пункта; верхние переключатели остаются готовыми демо-сценариями и могут сбрасывать результат выбранной проверки. Решения в пульте — не самоодобрение в реальном ЛК. Никаких обращений к IEK ID, 1С или RabbitMQ. Сохранения без новых проверок читаются без вымышленных причин и дат.'],
  ['H21', 'Реквизиты: проверка перед применением', 'ФЗ §5.1–5.2: реквизиты видны пользователям компании, изменение доступно только администратору. Уточнение команды: сначала проверка и подтверждение, обмен с 1С через RabbitMQ. В демо администратор отправляет заявку; действующие данные меняются только при имитации внешнего подтверждения в пульте, не по самоодобрению в ЛК. Кто проверяет, порядок сообщений/подтверждений 1С, ошибки и повторные отправки не определены. H21: редактируем название, КПП и юридический адрес; ИНН заблокирован до согласования смены идентичности компании. Только подтверждённый администратор может отправить заявку. Одна ожидающая заявка, отклонение без изменения реквизитов и повторная подача — гипотезы. КПП и адрес допускаются пустыми; при их отсутствии оформление не блокируется — обязательность и автозаполнение требуют решения. Заказы до подтверждения используют прежние реквизиты; после — новые, старые снимки не переписываются. Верификация и журнал сотрудников не меняются. Просмотр предложенных изменений сотрудником выбран для демо и требует согласования. Храним только последнюю заявку, не аудит обмена.'],
  ['H22', 'Автор и получатели заказа', 'ФЗ §3.3 и §6.5.1 задаёт ФИО, рабочий email и телефон клиента; §5.1 — автора заказа. В демо автор — текущий пользователь IEK ID, его имя, должность, email и телефон сохраняются отдельно от реквизитов компании и получателей. Телефон из IEK ID имитируется; в старых данных отсутствующие поля не выдумываются. Получатель курьера и email кодов могут отличаться от автора. Кнопка копирования контактов автора — удобство интерфейса, не назначение его получателем автоматически. Адрес из действующих реквизитов можно скопировать по §6.5.1; обращения к реестру по ИНН нет. Снимки автора и получателей не меняются при обновлении профиля, реквизитов или передаче администрирования. Возможность изменить контакт автора в заказе и обязательность отсутствующего телефона требуют согласования.'],
  ['H18', 'Продукт, версия и номенклатура', 'ФЗ §4 и §9.2 описывает поиск версий и дерево семейство → тип лицензии → артикул. По запросу команды демо разделяет Product, ProductVersion и Nomenclature; редакция Lite/Standard не подменяет версию. Две демо-версии и их привязки к трём вымышленным SKU — гипотеза, не номера настоящих релизов. Связь версии с номенклатурой в диздоке не утверждена. Один продукт выбран для сквозного сценария, не как граница ассортимента.'],
  ['H19', 'ПО и ключ в комплекте', 'Варианты защиты взяты из ФЗ §4.2 и §9.3. В демо можно выбрать код, Sign или Sign-net 10/50 для каждого SKU; это не подтверждённая матрица совместимости. Ключ комплектуется один к одному с количеством ПО, имеет отдельный демонстрационный артикул и цену. Независимое количество и совместное использование сетевого ключа не моделируются. Скидка 12% применяется только к ПО, ключ показан без скидки; НДС не начислен исключительно в демо. Комплект — строка интерфейса, не новая номенклатура МДМ. Наличие аппаратного ключа обязательно только при выборе аппаратного варианта, не для всех покупок. Виртуализация и обязательность ключа требуют согласования.'],
  ['H20', 'Получение комплекта', 'Уточнение команды заменяет варианты из ФЗ §6.2 и §9.4: физические ключи — только курьером в руки, коды — по email. Самовывоза для новых заказов нет. По запросу команды смешанный заказ имеет два блока со списками позиций: ключи курьером (получатель, телефон, адрес) и коды по email (отдельный адрес). Один email для группы кодов предзаполнен email текущего автора и редактируется; может отличаться от получателя курьера. В старых смешанных заказах отсутствующий email не подставляется и помечается для уточнения. Гипотезами остаются тариф курьера 1500 ₽ за заказ и email 0 ₽, предзаполнение email и один адрес на группу кодов; это не утверждённые тарифы или налоговые правила. Получение сохраняется в заказе. Черновик оформления сохраняется отдельно для каждого персонажа и сценария компании, следует за человеком при передаче прав и очищается после успешной отправки заказа. Старый самовывоз остаётся только историческим значением прежних заказов, без изменения их сумм. Статусы доставки и подтверждение вручения не моделируются. Порог проектных полей считается по товарам с ключами после скидки, без доставки и НДС (H05).'],
  ['H17', 'Журнал действий сотрудников', 'По запросу команды добавлен локальный журнал успешных действий: приглашения (создание, принятие, отмена), заявки (подача, одобрение, отклонение), удаления и передача прав. Видимость только подтверждённому администратору — гипотеза Q02; после передачи журнал доступен новому администратору, прежнему — нет. Имя, email и роль автора, а также адресат сохраняются на момент действия. Фильтр человека сопоставляет email автора или адресата, включая удалённых и приглашённых; подпись берётся из последнего непустого имени в журнале. Оба фильтра применяются совместно и сбрасываются при обновлении страницы — гипотеза интерфейса. Дата берётся с устройства, показывается по Москве. Старые события не восстанавливаются из статусов; повторы сохраняются отдельными записями. Отмена диалога, ошибки, редактирование профиля и переключатели демо не журналируются. Срок хранения, набор полей, доступ сотрудников, причины решений, экспорт и защищённый серверный аудит не согласованы. Записи хранятся в браузере, могут быть изменены вне интерфейса; «Начать заново» очищает журнал.'],
  ['H16', 'Передача администрирования', 'ФЗ предусматривает передачу прав, но порядок и последствия — Q02. В демо действующий подтверждённый администратор передаёт права уже присоединённому и верифицированному сотруднику. После подтверждения получатель становится единственным администратором, прежний администратор остаётся сотрудником и текущим персонажем. Корзины, проверки и авторство привязаны к людям; реквизиты и контакт компании не изменяются. Передача немедленная, без согласия получателя, повторного входа, второго фактора и уведомлений — всё это требует согласования. Новый администратор может передать права обратно по тем же правилам. Демо поддерживает два персонажа и не моделирует конкурентные передачи/полный аудит.'],
  ['H15', 'Отклонение заявки и отмена приглашения', 'В прототип добавлены по решению команды, но детали процесса не согласованы (Q02). Только подтверждённый администратор отклоняет ожидающую заявку или отменяет ещё не принятое приглашение. Это не удаление участника и не изменение верификации. Результат показываем обеим сторонам; доступ не предоставляется. Причина решения пока не запрашивается, писем нет. Повторная заявка или новое приглашение допускаются без периода ожидания и требуют нового одобрения/принятия. Один тестовый персонаж: новая попытка заменяет предыдущую запись, новые действия сохраняются в локальном журнале H17. Реальные ссылки-токены не реализованы. Причина, её обязательность/видимость, уведомления, сроки повторов и аудит требуют согласования.'],
  ['H14', 'Управление сотрудниками', 'ФЗ §5.2 предусматривает изменение и удаление сотрудников. В демо редактируются только отображаемые ФИО и должность, без изменения IEK ID/email. Состав полей и последствия удаления — гипотеза Q02: связь отзывается, доступ к спецценам, заказам и документам компании закрывается, прежняя корзина сотрудника очищается. После входа можно снова наполнять корзину по РРЦ (H02). Заказы, документы и исходное авторство сохраняются у компании; верификация человека не сбрасывается. Повторное присоединение требует нового одобрения или принятия приглашения. Один персонаж: новая попытка заменяет прежнюю заявку/приглашение, новые действия сохраняются в локальном журнале H17. Передача администрирования — H16.'],
  ['H11', 'Приглашение по почте', 'Для прямого добавления ФЗ требует IEK ID и корпоративный домен, совпадающий с администратором. Письмо, принятие получателем и подтверждение связи при принятии — гипотеза. Создание приглашения не добавляет участника; принятие не верифицирует пользователя. Проверка IEK ID имитируется флажком. Один тестовый получатель; отмена ожидающего приглашения и новая попытка — H15. Срок действия и повторная отправка действующего письма не реализованы.'],
  ['H12', 'Разделы ЛК', 'Меню: информация, сотрудники, отдельный раздел «Мой доступ», заказы, документы, лицензии. Просмотр списка (имя, должность, email, роль) обеими ролями следует ФЗ §5.1; управление только администратором — §5.2. Отдельная верификация не требуется для просмотра списка уже присоединённым сотрудником. Компоновка меню остаётся рабочей структурой для проверки удобства. Общий список документов собирается из опубликованных образцов заказов. В разделе лицензий показаны ПО по заказам и соглашения, без реестра выданных ключей и активации.'],
  ['H13', 'ПО по заказам и соглашения', 'Группировка по заказам и один образец соглашения на заказ — гипотезы интерфейса, не утверждённая модель лицензирования. ФЗ §5.1 задаёт ручную публикацию файла после оплаты; §9.6 описывает продукт, ключ защиты и число точек, а §10 оставляет индивидуальное соглашение по лицензии на согласование. Привязка файла к заказу, позиции или экземпляру — Q08. Количество в заказе не означает количество выданных лицензий. Дата заказа не означает дату покупки или активации. Состояния относятся к оплате и документу, не к лицензии.']
)

export function initialState() {
  return { stage: 'guest', role: 'admin', adminStage: 'guest', adminUser: null, company: null, companyChange: null, cart: [],
    verifiedEmails: [demoCompany.email, demoEmployee.email], emailChallenge: null,
    verifiedPhones: [demoCompany.phone, demoEmployee.phone], phoneChallenge: null,
    adminCart: [], employeeCart: [], adminCheckout: {}, employeeCheckout: {}, companyDraft: {}, orders: [], staffEvents: [], employee: { ...demoEmployee },
    employeeVerified: false, adminReviews: null, employeeReviews: null, adminSelection: null, employeeSelection: null,
    joinRequest: null, invitation: null, members: [], companyFound: false, archivedScenarios: [] }
}

export function access(stage) {
  return {
    prices: Object.hasOwn(stages, stage),
    purchase: stage === 'verified'
  }
}

export function demoIdentityContact(value) {
  const contact = String(value ?? '').trim()
  const kind = contact.includes('@') ? 'email' : 'phone'
  if (kind === 'email' ? contact.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact) :
      contact.length > 30 || !/^[+\d()\s-]{7,30}$/.test(contact) || !/^\d{10,15}$/.test(normalizeContact('phone', contact)))
    throw new Error('Укажите корректную почту или телефон с кодом страны.')
  return { kind, value: contact }
}

export function completeDemoIdentity(state, contact, code) {
  if (state.stage !== 'guest' || state.role !== 'admin') throw new Error('Вход уже выполнен или сценарий недоступен.')
  const { kind, value } = demoIdentityContact(contact)
  if (String(code).trim() !== '123456') throw new Error('Неверный демо-код. Введите 123456.')
  const key = kind === 'email' ? 'verifiedEmails' : 'verifiedPhones'
  const existing = (state[key] || []).some(proof => normalizeContact(kind, proof) === normalizeContact(kind, value))
  const savedIndex = state.archivedScenarios.findLastIndex(entry => entry.signedOut &&
    normalizeContact(kind, currentUser(entry.state)[kind]) === normalizeContact(kind, value))
  if (savedIndex !== -1) {
    const saved = state.archivedScenarios[savedIndex].state
    const archivedScenarios = state.archivedScenarios.filter((_, index) => index !== savedIndex)
    const cart = state.cart
    Object.assign(state, initialState(), structuredClone(saved), { archivedScenarios, cart })
    state[`${state.role}Cart`] = cart
    state[key] = [...new Set([...(state[key] || []), value])]
    return true
  }
  setStage(state, 'identified')
  state.adminUser = { person: '', position: '', email: '', phone: '', [kind]: value }
  state[key] = [...new Set([...(state[key] || []), value])]
  return existing
}

function normalizeContact(kind, value) {
  if (!['email', 'phone'].includes(kind)) throw new Error('Неизвестный контакт IEK ID')
  return kind === 'email' ? String(value || '').trim().toLowerCase() : String(value || '').replace(/[^0-9]/g, '')
}

export function contactVerified(state, kind) {
  const value = normalizeContact(kind, currentUser(state)[kind])
  const proofs = state[kind === 'email' ? 'verifiedEmails' : 'verifiedPhones'] || []
  return !!value && proofs.some(proof => normalizeContact(kind, proof) === value)
}

export function emailVerified(state) { return contactVerified(state, 'email') }
export function contactsVerified(state) { return ['email', 'phone'].every(kind => contactVerified(state, kind)) }

export function saveProfileName(state, value) {
  if (state.stage === 'guest') throw new Error('Сначала войдите через IEK ID')
  const person = String(value ?? '').trim()
  if (!person || person.length > 100) throw new Error('Укажите ФИО: от 1 до 100 символов')
  state[state.role === 'admin' ? 'adminUser' : 'employee'] = { ...userContact(currentUser(state)), person }
  if (state.role === 'admin' && Object.hasOwn(state.companyDraft, 'person')) state.companyDraft.person = person
}

export function canPurchase(state) {
  return access(state.stage).purchase && contactsVerified(state) && !!currentUser(state).person.trim()
}

// shortcut: mock IEK ID response only; replace with the documented API before production.
export function requestContactCode(state, kind, value, now = Date.now()) {
  if (state.stage === 'guest') throw new Error('Сначала войдите через IEK ID')
  const contact = normalizeContact(kind, value), user = currentUser(state)
  if (kind === 'email' ? !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact) || contact.length > 120 :
      !/^[+\d()\s-]{7,30}$/.test(String(value)) || !/^\d{10,15}$/.test(contact)) throw new Error(kind === 'email' ? 'Укажите корректную почту' : 'Укажите телефон с кодом страны: от 10 до 15 цифр')
  if (user[kind] && normalizeContact(kind, user[kind]) !== contact) throw new Error(kind === 'email' ? 'Почта из IEK ID недоступна для изменения здесь' : 'Телефон из IEK ID недоступен для изменения здесь')
  if (contactVerified(state, kind)) throw new Error('Контакт уже подтверждён')
  if ([state.role === 'admin' ? state.employee : administrator(state), ...state.members].some(person => normalizeContact(kind, person[kind]) === contact && normalizeContact(kind, user[kind]) !== contact)) throw new Error('Этот контакт принадлежит другому участнику демо')
  state[`${kind}Challenge`] = { [kind]: String(value).trim(), role: state.role, expiresAt: now + 10 * 60 * 1000 }
}

export function confirmContactCode(state, kind, value, code, now = Date.now()) {
  const contact = normalizeContact(kind, value), challenge = state[`${kind}Challenge`], user = currentUser(state)
  if (state.stage === 'guest' || !challenge || challenge.role !== state.role || normalizeContact(kind, challenge[kind]) !== contact || (user[kind] && normalizeContact(kind, user[kind]) !== contact)) throw new Error('Запросите код для указанного контакта')
  if (challenge.expiresAt <= now) throw new Error('Срок действия кода истёк. Запросите новый')
  if (String(code).trim() !== '123456') throw new Error('Неверный код. Попробуйте ещё раз')
  const confirmed = user[kind] || (kind === 'email' ? contact : String(value).trim())
  const proofKey = kind === 'email' ? 'verifiedEmails' : 'verifiedPhones'
  state[proofKey] = [...new Set([...(state[proofKey] || []), confirmed])]
  state[state.role === 'admin' ? 'adminUser' : 'employee'] = { ...userContact(user), [kind]: confirmed }
  if (state.role === 'admin') state.companyDraft[kind] = confirmed
  state[`${kind}Challenge`] = null
}

export function requestEmailCode(state, value, now) { return requestContactCode(state, 'email', value, now) }
export function confirmEmailCode(state, value, code, now) { return confirmContactCode(state, 'email', value, code, now) }

export function checkoutDraft(state) {
  return state[`${state.role}Checkout`] ??= {}
}

export function setStage(state, stage) {
  if (state.role === 'employee') throw new Error('У сотрудника верификация и одобрение заявки проверяются отдельно')
  if (!Object.hasOwn(stages, stage)) throw new Error('Неизвестное состояние пользователя')
  if (state.stage === 'guest' && stage !== 'guest' && selectedConfiguration(state)) {
    const selection = selectedConfiguration(state)
    addItem(state, selection.id, selection.quantity)
    state[`${state.role}Selection`] = null
  }
  if (stage === 'identified' && state.company) {
    const archivedScenarios = [...(state.archivedScenarios || []), scenarioSnapshot(state)]
    const adminUser = userContact(currentUser(state)), employee = userContact(state.employee), cart = state.cart, adminSelection = state.adminSelection
    Object.assign(state, initialState(), { archivedScenarios, adminUser, employee, cart, adminCart: cart, adminSelection, verifiedEmails: state.verifiedEmails || [], emailChallenge: state.emailChallenge || null, verifiedPhones: state.verifiedPhones || [], phoneChallenge: state.phoneChallenge || null })
  }
  state.stage = stage
  if (stage === 'identified') delete state.verificationRequestId
  state.adminStage = stage
  state.adminReviews = null // Пульт выбирает готовый сценарий, а не решение реального проверяющего.
  if (['pending', 'member', 'verified'].includes(stage) && !state.company) state.company = { ...demoCompany }
}

// Снимки разделяют тестовые сценарии, а не моделируют доступ к нескольким компаниям.
export function scenarioSnapshot(state) {
  const { archivedScenarios, ...snapshot } = structuredClone(state)
  // Старое сохранение могло скрывать существующую компанию статусом «без компании».
  if (snapshot.stage === 'identified' && snapshot.company && snapshot.role === 'admin') {
    snapshot.stage = 'pending'
    snapshot.stage = reviewedStage(snapshot)
    snapshot.adminStage = snapshot.stage
  }
  return { date: new Date().toISOString(), state: snapshot }
}

export function signOut(state) {
  if (state.stage === 'guest') return
  const archivedScenarios = [...state.archivedScenarios, { ...scenarioSnapshot(state), signedOut: true }]
  const { cart, verifiedEmails, verifiedPhones, catalogFilters } = state
  Object.assign(state, initialState(), { archivedScenarios, cart, adminCart: cart, verifiedEmails, verifiedPhones, catalogFilters })
}

export function restoreScenario(state, index) {
  if (!Number.isInteger(index) || index < 0 || !state.archivedScenarios?.[index]) throw new Error('Сохранённый сценарий не найден')
  if (state.archivedScenarios[index].signedOut) throw new Error('Войдите через IEK ID, чтобы вернуться в этот профиль')
  const restored = structuredClone(state.archivedScenarios[index].state)
  const archivedScenarios = state.archivedScenarios.filter((_, i) => i !== index)
  archivedScenarios.push(scenarioSnapshot(state))
  delete state.verificationRequestId
  Object.assign(state, initialState(), restored, { archivedScenarios, verifiedEmails: restored.verifiedEmails || [], verifiedPhones: restored.verifiedPhones || [] })
  state[`${state.role}Cart`] = state.cart
}

export function canViewAccount(state) { return !!state.company && !['guest', 'identified'].includes(state.stage) }
export function canUseCart(state) { return Object.hasOwn(stages, state.stage) }

export function selectedConfiguration(state) { return state[`${state.role}Selection`] ?? null }

export function selectConfiguration(state, id, value) {
  const item = product(id), count = quantity(value)
  state[`${state.role}Selection`] = { id: item.id, quantity: count }
}

export function continueSelectedOrder(state) {
  if (!canUseCart(state)) throw new Error('Сначала войдите через IEK ID')
  const selection = selectedConfiguration(state)
  if (!selection) throw new Error('Сначала выберите комплектацию')
  addItem(state, selection.id, selection.quantity)
  state[`${state.role}Selection`] = null
}

export function administrator(state) { return state.adminUser || state.company || demoCompany }
export function currentUser(state) { return state.role === 'employee' ? state.employee : administrator(state) }
export const reviewLabels = { pending: 'На проверке', confirmed: 'Подтверждено', returned: 'Нужно исправить', rejected: 'Отказано' }
const newReview = status => ({ status, reason: '', response: '', attempt: 1, date: null, previousDecision: null })

function currentReviewSubmission(state, kind) {
  if (kind === 'user') return { type: 'user', values: userContact(currentUser(state)) }
  return state.role === 'admin'
    ? { type: 'company', values: { inn: state.company.inn, ...companyDetails(state.company) } }
    : { type: 'membership', values: { inn: state.company.inn, name: state.company.name } }
}

export function reviewSubmission(state, kind) {
  return structuredClone(verificationReviews(state)[kind].submission ?? currentReviewSubmission(state, kind))
}

function correctedSubmission(state, kind, values) {
  const submitted = currentReviewSubmission(state, kind)
  if (submitted.type === 'user') {
    const contact = Object.fromEntries(Object.keys(submitted.values).map(key => [key, String(values[key] ?? '').trim()]))
    contact.email = contact.email.toLowerCase()
    if (!contact.person || contact.person.length > 100 || !contact.position || contact.position.length > 100 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email) || contact.email.length > 120 ||
        !/^[+\d()\s-]{7,30}$/.test(contact.phone)) throw new Error('Проверьте ФИО, должность, рабочий email и телефон')
    submitted.values = contact
  } else {
    if (values.inn !== undefined && values.inn !== state.company.inn) throw new Error('Изменение ИНН не согласовано')
    if (submitted.type === 'company') submitted.values = { inn: state.company.inn, ...companyDetails(values) }
    else if (['name', 'kpp', 'legalAddress'].some(key => values[key] !== undefined)) throw new Error('Сотрудник не может менять реквизиты компании')
  }
  return submitted
}

function applyReviewSubmission(state, submission) {
  if (submission.type === 'user') {
    const previousEmail = currentUser(state).email, contact = submission.values
    const other = state.role === 'admin' ? state.employee : administrator(state)
    if (other.email.toLowerCase() === contact.email.toLowerCase() || state.members.some(member =>
      member.email !== previousEmail && member.email.toLowerCase() === contact.email.toLowerCase())) throw new Error('Этот email уже принадлежит другому участнику демо')
    // Email пока служит идентификатором демо: сохраняем связь того же человека, не создаём новое членство.
    if (state.role === 'admin') state.adminUser = { ...contact }
    else state.employee = { ...contact }
    for (const member of state.members) if (member.email === previousEmail) Object.assign(member, contact)
    for (const request of [state.joinRequest, state.invitation]) if (request?.email === previousEmail) request.email = contact.email
  } else if (submission.type === 'company') {
    if (state.role !== 'admin' || submission.values.inn !== state.company?.inn) throw new Error('Заявка не относится к текущей компании администратора')
    state.adminUser ??= userContact(administrator(state))
    Object.assign(state.company, companyDetails(submission.values))
  }
}

export function verificationReviews(state, role = state.role) {
  if (state[`${role}Reviews`]) return state[`${role}Reviews`]
  const stage = state.role === 'admin' ? state.stage : state.adminStage
  return {
    user: newReview((role === 'employee' ? state.employeeVerified : ['member', 'verified'].includes(stage)) ? 'confirmed' : 'pending'),
    company: newReview((role === 'employee' ? employeeMember(state) : stage === 'verified') ? 'confirmed' : 'pending')
  }
}

export function canReviewAccess(state, kind) {
  return state.stage !== 'guest' && (kind === 'user' ||
    (kind === 'company' && !!state.company && (state.role === 'employee' ? employeeMember(state) : state.stage !== 'identified')))
}

export function reviewedStage(state, role = state.role) {
  if (role === 'admin' && (state.role === 'admin' ? state.stage : state.adminStage) === 'identified') return 'identified'
  if (role === 'employee' && !employeeMember(state)) return 'identified'
  const checks = verificationReviews(state, role)
  if (checks.user.status === 'confirmed' && checks.company.status === 'confirmed') return 'verified'
  return role === 'admin' && checks.user.status === 'confirmed' ? 'member' : 'pending'
}

function storeReviews(state, checks) {
  state[`${state.role}Reviews`] = checks
  if (state.role === 'employee') state.employeeVerified = checks.user.status === 'confirmed'
  state.stage = reviewedStage(state)
  if (state.role === 'admin') state.adminStage = state.stage
}

function accessReview(state, kind) {
  if (!canReviewAccess(state, kind)) throw new Error('Проверка недоступна: нужны вход, компания и для проверки связи сотрудника — присоединение')
  return structuredClone(verificationReviews(state))
}

// shortcut: только сценарий в пульте демо, не процесс отзыва ранее выданных прав.
export function startAccessReview(state, kind) {
  const checks = accessReview(state, kind)
  if (checks[kind].status !== 'confirmed' && !(state.stage === 'identified' && kind === 'user' && !state[`${state.role}Reviews`])) throw new Error('Проверка уже начата; используйте текущую попытку')
  checks[kind] = newReview('pending')
  checks[kind].date = new Date().toISOString()
  if (kind === 'company' && state.companyChange?.status === 'pending') throw new Error('Сначала завершите текущую заявку на изменение реквизитов')
  checks[kind].submission = currentReviewSubmission(state, kind)
  storeReviews(state, checks)
}

export function simulateAccessReview(state, kind, result, reason = '') {
  if (state.stage === 'identified' && kind === 'user' && !state[`${state.role}Reviews`]) throw new Error('Сначала запросите верификацию')
  const checks = accessReview(state, kind)
  if (checks[kind].status !== 'pending') throw new Error('Сначала отправьте сведения на проверку')
  if (!['confirmed', 'returned', 'rejected'].includes(result)) throw new Error('Неизвестный результат проверки')
  const explanation = String(reason).trim()
  if (result !== 'confirmed' && (!explanation || explanation.length > 500)) throw new Error('Укажите понятную пользователю причину: от 1 до 500 символов')
  if (result === 'confirmed' && checks[kind].submission && checks[kind].attempt > 1) applyReviewSubmission(state, checks[kind].submission)
  Object.assign(checks[kind], { status: result, reason: result === 'confirmed' ? '' : explanation, date: new Date().toISOString() })
  storeReviews(state, checks)
}

export function resubmitAccessReview(state, kind, response, values) {
  const checks = accessReview(state, kind), check = checks[kind]
  if (!['returned', 'rejected'].includes(check.status)) throw new Error('Повторная подача доступна только после возврата или отказа')
  const explanation = String(response ?? '').trim()
  if (!explanation || explanation.length > 1000) throw new Error('Укажите исправленные сведения или пояснение: от 1 до 1000 символов')
  const submission = values === undefined ? reviewSubmission(state, kind) : correctedSubmission(state, kind, values)
  checks[kind] = { ...check, status: 'pending', reason: '', response: explanation,
    submission, previousDecision: { status: check.status, reason: check.reason, ...(check.submission ? { submission: structuredClone(check.submission) } : {}) }, attempt: check.attempt + 1, date: new Date().toISOString() }
  storeReviews(state, checks)
}
export function userContact(user) {
  return Object.fromEntries(['person', 'position', 'email', 'phone'].map(key => [key, user[key] ?? '']))
}
export function canRequestCompanyChange(state) {
  return !!state.company && state.role === 'admin' && canPurchase(state)
}

export function companyDetails(values) {
  const details = Object.fromEntries(['name', 'kpp', 'legalAddress'].map(key => [key, String(values[key] ?? '').trim()]))
  if (!details.name || details.name.length > 120) throw new Error('Название компании: от 1 до 120 символов')
  if (details.kpp && !/^\d{9}$/.test(details.kpp)) throw new Error('КПП: 9 цифр или пустое поле, если не указан')
  if (details.legalAddress.length > 250) throw new Error('Юридический адрес: не более 250 символов')
  return details
}

export function requestCompanyChange(state, values) {
  if (!canRequestCompanyChange(state)) throw new Error('Заявку может отправить только подтверждённый администратор')
  if (state.companyChange?.status === 'pending') throw new Error('Дождитесь результата проверки текущей заявки')
  if (values.inn !== undefined && values.inn !== state.company.inn) throw new Error('Изменение ИНН в демо не согласовано')
  const proposed = companyDetails(values)
  if (Object.keys(proposed).every(key => proposed[key] === (state.company[key] ?? ''))) throw new Error('Реквизиты не изменены')
  const previous = state.companyChange
  state.companyChange = { status: 'pending', date: new Date().toISOString(), inn: state.company.inn,
    ...(previous && ['returned', 'rejected'].includes(previous.status) ? { previousReason: previous.reason || 'Причина в старом демо не сохранена' } : {}),
    author: userContact(currentUser(state)), proposed }
}

// shortcut: только пульт демо; в сервисе результат приходит от процесса проверки/обмена, не из клиентского запроса.
export function simulateCompanyReview(state, result, reason = '') {
  if (!canRequestCompanyChange(state)) throw new Error('Для пульта демо выберите подтверждённого администратора')
  const change = state.companyChange
  if (!change || change.status !== 'pending' || change.inn !== state.company.inn) throw new Error('Нет ожидающей заявки для этой компании')
  if (!['confirmed', 'returned', 'rejected'].includes(result)) throw new Error('Неизвестный результат проверки')
  const explanation = String(reason).trim()
  if (explanation.length > 500 || (result === 'returned' && !explanation)) throw new Error('Укажите причину: от 1 до 500 символов')
  if (result === 'confirmed') {
    const details = companyDetails(change.proposed)
    // Не превращаем изменение компании в изменение личности администратора старого сохранения.
    state.adminUser ??= userContact(administrator(state))
    Object.assign(state.company, details)
  }
  change.status = result
  if (result !== 'confirmed' && explanation) change.reason = explanation
  change.resolvedAt = new Date().toISOString()
}
export function employeeMember(state) { return state.members.some(member => member.email === state.employee.email) }
export function canViewStaff(state) {
  return !!state.company && !['guest', 'identified'].includes(state.stage) &&
    (state.role === 'admin' || (state.role === 'employee' && employeeMember(state)))
}

export function canManageStaff(state) {
  return state.role === 'admin' && (canPurchase(state) || !!state.claimWinnerId && state.claimWinnerId === state.verificationRequestId)
}

export function staffDirectory(state) {
  if (!canViewStaff(state)) throw new Error('Список доступен только пользователям компании')
  return [{ ...administrator(state), role: 'admin' }, ...state.members].map(({ person, position, email, role }) =>
    ({ person, position, email, role }))
}
// После передачи прежняя заявка нового администратора остаётся снимком, не заявкой другого человека.
export function staffRequest(state) { return state.joinRequest?.email === administrator(state).email ? null : state.joinRequest }
export function staffInvitation(state) { return state.invitation?.email === administrator(state).email ? null : state.invitation }

export const staffEventLabels = {
  'request-created': 'Подана заявка на присоединение',
  'request-approved': 'Заявка одобрена',
  'request-rejected': 'Заявка отклонена',
  'invitation-created': 'Создано демо-приглашение',
  'invitation-accepted': 'Приглашение принято',
  'invitation-cancelled': 'Приглашение отменено',
  'employee-removed': 'Сотрудник удалён из компании',
  'administration-transferred': 'Переданы права администратора'
}

function recordStaffEvent(state, action, subject) {
  const actor = currentUser(state)
  state.staffEvents.push({ id: state.staffEvents.length + 1, date: new Date().toISOString(), action,
    actor: { person: actor.person, email: actor.email, role: state.role },
    subject: { person: subject.person || '', email: subject.email } })
}

export function staffHistory(state, { action = '', email = '' } = {}) {
  if (!canManageStaff(state)) throw new Error('Журнал доступен только подтверждённому администратору')
  return state.staffEvents.filter(event => (!action || event.action === action) &&
    (!email || event.actor.email === email || event.subject.email === email)).reverse()
}

function employeeStage(state) {
  if (state.employeeReviews) return reviewedStage(state, 'employee')
  const joined = employeeMember(state)
  return joined ? (state.employeeVerified ? 'verified' : 'pending') : 'identified'
}

export function switchRole(state, role) {
  if (!['admin', 'employee'].includes(role)) throw new Error('Неизвестная роль')
  if (state.role === role) return
  if (state.role === 'admin') state.adminStage = state.stage
  state[`${state.role}Cart`] = state.cart
  state.role = role
  state.cart = state[`${role}Cart`]
  if (!state.company) state.company = { ...demoCompany }
  state.stage = role === 'admin' ? state.adminStage : employeeStage(state)
}

// The two demo personas are slots: move the first operator-approved applicant into the admin slot.
export function promoteEmployeeApplicant(state) {
  if (!state.employeeVerificationRequestId || state.claimWinnerId) throw new Error('Администратор компании уже определён')
  state[`${state.role}Cart`] = state.cart
  const previousAdmin = userContact(administrator(state))
  state.adminUser = userContact(state.employee)
  state.employee = previousAdmin
  for (const [adminKey, employeeKey] of [
    ['verificationRequestId', 'employeeVerificationRequestId'], ['adminReviews', 'employeeReviews'],
    ['adminCart', 'employeeCart'], ['adminCheckout', 'employeeCheckout'], ['adminSelection', 'employeeSelection']
  ]) [state[adminKey], state[employeeKey]] = [state[employeeKey], state[adminKey]]
  state.role = state.role === 'admin' ? 'employee' : 'admin'
  state.cart = state[`${state.role}Cart`]
  state.employeeVerified = state.employeeReviews?.user.status === 'confirmed'
  state.adminStage = 'pending'
  state.stage = state.role === 'admin' ? state.adminStage : employeeStage(state)
  state.companyFound = false
  state.companyDraft = {}
}

export function queueVerifiedMembership(state) {
  if (!(state.claimWinnerId || state.adminStage === 'verified') || !state.employeeVerificationRequestId || state.joinRequest || employeeMember(state)) return false
  const applicant = userContact(state.employee)
  state.joinRequest = { id: 'JOIN-001', ...applicant, inn: state.company.inn, status: 'pending', date: new Date().toISOString() }
  state.staffEvents.push({ id: state.staffEvents.length + 1, date: state.joinRequest.date, action: 'request-created',
    actor: { person: applicant.person, email: applicant.email, role: 'employee' }, subject: { person: applicant.person, email: applicant.email } })
  return true
}

export function setEmployeeVerified(state, verified) {
  if (state.role !== 'employee' || typeof verified !== 'boolean') throw new Error('Выберите персонажа сотрудника')
  state.employeeVerified = verified
  if (state.employeeReviews) state.employeeReviews.user = newReview(verified ? 'confirmed' : 'pending')
  state.stage = employeeStage(state)
}

export function findJoinCompany(state, inn) {
  if (state.role !== 'employee') throw new Error('Поиск доступен сотруднику')
  state.companyFound = false
  if (!/^(\d{10}|\d{12})$/.test(String(inn).trim())) throw new Error('Укажите ИНН: 10 или 12 цифр')
  if (String(inn).trim() !== state.company?.inn) throw new Error('Компания не найдена в тестовых данных. Используйте ИНН из подсказки.')
  state.companyFound = true
}

export function requestMembership(state, email) {
  if (state.role !== 'employee' || !state.companyFound) throw new Error('Сначала найдите компанию по ИНН')
  const request = staffRequest(state), invitation = staffInvitation(state)
  if (employeeMember(state) || (request && !['removed', 'rejected'].includes(request.status)) || (invitation && !['removed', 'cancelled'].includes(invitation.status))) throw new Error('Участие, заявка или приглашение уже существует; завершите текущий сценарий')
  const normalized = String(email).trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) || normalized.length > 120) throw new Error('Укажите корректный email')
  if (normalized === administrator(state).email.toLowerCase() || state.members.some(member => member.email === normalized)) throw new Error('Этот email уже принадлежит участнику компании')
  state.employee.email = normalized
  state.invitation = null
  state.joinRequest = { id: 'JOIN-001', ...state.employee, inn: state.company.inn, status: 'pending', date: new Date().toISOString() }
  recordStaffEvent(state, 'request-created', state.joinRequest)
}

function managedEmployee(state, email) {
  if (!canManageStaff(state)) throw new Error('Управлять сотрудниками может только подтверждённый администратор')
  const member = state.members.find(item => item.email === email)
  if (!member || email === administrator(state).email) throw new Error('Сотрудник не найден; администратор не изменяется здесь')
  return member
}

export function transferAdministration(state, email) {
  const recipient = managedEmployee(state, email)
  if (email !== state.employee.email || !state.employeeVerified) throw new Error('Для передачи нужен присоединённый и верифицированный сотрудник демо')
  if (verificationReviews(state, 'employee').company.status !== 'confirmed') throw new Error('Для передачи нужна подтверждённая связь сотрудника с компанией')
  if (staffRequest(state)?.status === 'pending' || staffInvitation(state)?.status === 'pending') throw new Error('Сначала завершите ожидающее присоединение')
  const previous = userContact(administrator(state))
  recordStaffEvent(state, 'administration-transferred', recipient)
  state.adminUser = userContact(recipient)
  state.members = state.members.map(member => member.email === email ? { ...previous, role: 'employee' } : member)
  // Слоты ролей меняются, но корзины и выбранный человек остаются у своих владельцев.
  state.adminCart = state.employeeCart
  state.employeeCart = state.cart
  state.employee = previous
  ;[state.adminReviews, state.employeeReviews] = [state.employeeReviews, state.adminReviews]
  ;[state.adminSelection, state.employeeSelection] = [state.employeeSelection, state.adminSelection]
  ;[state.adminCheckout, state.employeeCheckout] = [state.employeeCheckout ?? {}, state.adminCheckout ?? {}]
  state.employeeVerified = true
  state.adminStage = 'verified'
  state.role = 'employee'
  state.stage = employeeStage(state)
  state.companyFound = false
}

export function updateEmployee(state, email, values) {
  const member = managedEmployee(state, email)
  const details = Object.fromEntries(['person', 'position'].map(key => [key, String(values[key] ?? '').trim()]))
  if (Object.values(details).some(value => !value || value.length > 100)) throw new Error('Укажите ФИО и должность: от 1 до 100 символов')
  Object.assign(member, details)
  if (state.employee.email === email) Object.assign(state.employee, details)
  // Заказы и исходная заявка — снимки данных на момент создания, их не переписываем.
}

export function removeEmployee(state, email) {
  const member = managedEmployee(state, email)
  recordStaffEvent(state, 'employee-removed', member)
  state.members = state.members.filter(item => item.email !== email)
  if (state.joinRequest?.email === email) state.joinRequest.status = 'removed'
  if (state.invitation?.email === email) state.invitation.status = 'removed'
  if (state.employee.email === email) {
    if (state.employeeReviews) state.employeeReviews.company = newReview('pending')
    state.employeeCart = []
    state.employeeCheckout = {}
    state.companyFound = false
  }
}

export function approveMembership(state, id) {
  if (!canManageStaff(state)) throw new Error('Подтвердить заявку может только подтверждённый администратор')
  const request = state.joinRequest
  if (!request || request.id !== id || request.status !== 'pending' || request.inn !== state.company?.inn) throw new Error('Нет ожидающей заявки для этой компании')
  if (state.members.length >= 3) throw new Error('Лимит: три сотрудника помимо администратора')
  if (state.members.some(member => member.email === request.email)) throw new Error('Сотрудник уже добавлен')
  state.members.push({ ...userContact(request), role: 'employee' })
  if (state.employeeReviews) state.employeeReviews.company = newReview('confirmed')
  request.status = 'approved'
  recordStaffEvent(state, 'request-approved', request)
}

export function inviteEmployee(state, email, hasIekId) {
  if (!canManageStaff(state)) throw new Error('Приглашать может только подтверждённый администратор')
  const request = staffRequest(state), invitation = staffInvitation(state)
  if (employeeMember(state) || (invitation && !['removed', 'cancelled'].includes(invitation.status)) || (request && !['removed', 'rejected'].includes(request.status))) throw new Error('В демо один сотрудник. Завершите текущий сценарий; для другого пути используйте «Начать заново».')
  if (state.members.length >= 3) throw new Error('Лимит: три сотрудника помимо администратора')
  const normalized = String(email).trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) || normalized.length > 120) throw new Error('Укажите корректный email')
  if (normalized.split('@')[1] !== administrator(state).email.toLowerCase().split('@')[1]) throw new Error('При прямом добавлении домен почты должен совпадать с доменом администратора')
  if (normalized === administrator(state).email.toLowerCase() || state.members.some(member => member.email === normalized)) throw new Error('Этот email уже принадлежит участнику компании')
  if (hasIekId !== true) throw new Error('Для прямого добавления нужен существующий IEK ID. Проверка в демо имитируется отдельно.')
  state.joinRequest = null
  state.invitation = { id: 'INVITE-001', email: normalized, inn: state.company.inn, status: 'pending', date: new Date().toISOString() }
  recordStaffEvent(state, 'invitation-created', state.invitation)
}

export function previewInvitation(state) {
  const invitation = staffInvitation(state)
  if (!invitation || !['pending', 'accepted'].includes(invitation.status)) throw new Error('Действующее приглашение не найдено')
  // shortcut: один тестовый получатель; для нескольких людей нужен реальный вход и выбор идентичности.
  switchRole(state, 'employee')
  if (state.employee.email !== invitation.email) state.employeeCheckout = {}
  state.employee.email = invitation.email
}

export function acceptInvitation(state) {
  const invitation = state.invitation
  if (state.role !== 'employee' || !invitation || invitation.status !== 'pending' ||
      invitation.email !== state.employee.email || invitation.inn !== state.company?.inn) throw new Error('Войдите как получатель действующего приглашения')
  if (state.members.length >= 3) throw new Error('Лимит: три сотрудника помимо администратора')
  if (state.members.some(member => member.email === invitation.email)) throw new Error('Сотрудник уже добавлен')
  state.members.push({ ...state.employee, role: 'employee' })
  if (state.employeeReviews) state.employeeReviews.company = newReview('confirmed')
  invitation.status = 'accepted'
  state.stage = employeeStage(state)
  recordStaffEvent(state, 'invitation-accepted', state.employee)
}

export function rejectMembership(state, id) {
  if (!canManageStaff(state)) throw new Error('Отклонить заявку может только подтверждённый администратор')
  const request = state.joinRequest
  if (!request || request.id !== id || request.status !== 'pending' || request.inn !== state.company?.inn) throw new Error('Нет ожидающей заявки для этой компании')
  request.status = 'rejected'
  recordStaffEvent(state, 'request-rejected', request)
}

export function cancelInvitation(state, id) {
  if (!canManageStaff(state)) throw new Error('Отменить приглашение может только подтверждённый администратор')
  const invitation = state.invitation
  if (!invitation || invitation.id !== id || invitation.status !== 'pending' || invitation.inn !== state.company?.inn) throw new Error('Нет ожидающего приглашения для этой компании')
  invitation.status = 'cancelled'
  recordStaffEvent(state, 'invitation-cancelled', invitation)
}

export function product(id) {
  const found = products.find(item => item.id === id)
  if (!found) throw new Error('Товар не найден')
  return found
}

export function quantity(value) {
  const number = Number(value)
  if (!Number.isInteger(number) || number < 1 || number > 99) throw new Error('Количество: целое число от 1 до 99')
  return number
}

export function unitPrice(item, stage) {
  if (item.pilot) return item.softwareRrp
  if (item.sourceCatalog) return item.rrp
  // H03: тестовая формула; суммы в копейках, скидка 12% только для демонстрационных SKU ПО.
  return stage === 'verified' ? Math.round((item.softwareRrp ?? item.rrp) * 88 / 100) + (item.keyRrp ?? 0) : item.rrp
}

export function cartLines(state) {
  return state.cart.map(line => {
    const item = product(line.id)
    const unit = unitPrice(item, state.stage)
    return { ...item, quantity: line.quantity, unit,
      ...(item.pilot && item.keySku === 'AUTO' ? { protectionName: pilotKeySummary(item, line.quantity) } : {}),
      ...(item.pilot ? { keyQuantity: pilotKeyQuantity(item, line.quantity) } : {}),
      ...(item.pilot && item.keySku === 'AUTO' ? { keyMix: pilotKeyMix(item, line.quantity) } : {}),
      total: item.pilot ? pilotTotal(item, line.quantity) : unit * line.quantity }
  })
}

export function total(lines) {
  return lines.reduce((sum, line) => sum + line.total, 0)
}

export function needsProject(amount) { return amount >= 80000000 }

export function addItem(state, id, value) {
  if (!canUseCart(state)) throw new Error('Сначала войдите через IEK ID')
  product(id)
  const line = state.cart.find(item => item.id === id)
  const next = quantity((line?.quantity ?? 0) + quantity(value))
  if (line) line.quantity = next
  else state.cart.push({ id, quantity: next })
}

export function changeQuantity(state, id, value) {
  if (!canUseCart(state)) throw new Error('Сначала войдите через IEK ID')
  const line = state.cart.find(item => item.id === id)
  if (!line) throw new Error('Позиция не найдена')
  line.quantity = quantity(value)
}

export function registerCompany(state, values) {
  if (state.role !== 'admin' || state.joinRequest || state.invitation) throw new Error('Создание компании недоступно в текущем сценарии присоединения')
  if (state.stage !== 'identified') throw new Error('Сначала войдите через демо IEK ID')
  const company = Object.fromEntries(['name', 'inn', 'person', 'position', 'email', 'phone'].map(key => [key, String(values[key] ?? '').trim()]))
  if (Object.values(company).some(value => !value)) throw new Error('Заполните все поля компании')
  if (!/^(\d{10}|\d{12})$/.test(company.inn)) throw new Error('ИНН должен содержать 10 или 12 цифр; в демо можно использовать нули')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(company.email)) throw new Error('Укажите email в формате name@example.test')
  if (!/^[+\d()\s-]{7,30}$/.test(company.phone)) throw new Error('Укажите телефон пользователя')
  if (company.name.length > 120 || company.person.length > 100 || company.position.length > 100 || company.email.length > 120) throw new Error('Проверьте длину полей компании и пользователя')
  Object.assign(company, companyDetails({ ...values, name: company.name }))
  if (state.adminReviews && ['person', 'email', 'position', 'phone'].some(key => company[key] !== currentUser(state)[key])) state.adminReviews.user = newReview('pending')
  state.company = company
  state.companyDraft = {}
  state.adminUser = userContact(company)
  state.companyChange = null
  if (state.adminReviews) state.adminReviews.company = newReview('pending')
  state.stage = 'pending'
  state.stage = reviewedStage(state)
  state.adminStage = state.stage
  const checks = structuredClone(verificationReviews(state))
  checks.user.submission ??= currentReviewSubmission(state, 'user')
  checks.company.submission = currentReviewSubmission(state, 'company')
  storeReviews(state, checks)
}

export function verifyCompanyFromPaidInquiry(state, billing) {
  if (state.role !== 'admin' || state.stage !== 'identified' || state.company || !contactsVerified(state) || !currentUser(state).person.trim())
    throw new Error('Для доступа подтвердите ФИО, почту и телефон через IEK ID.')
  const user = userContact(currentUser(state))
  registerCompany(state, { ...billing, ...user, position: user.position || 'Представитель компании' })
  for (const kind of ['user', 'company']) {
    state.adminReviews[kind].status = 'confirmed'
    state.adminReviews[kind].date = new Date().toISOString()
  }
  state.stage = reviewedStage(state)
  state.adminStage = state.stage
}

export function clearPurchasedCart(state) {
  state.cart=[]
  state[`${state.role}Cart`]=state.cart
  state[`${state.role}Checkout`]={}
  state[`${state.role}Selection`]=null
}

export function submitOrder(state, values) {
  if (!canPurchase(state) || !state.company) throw new Error('Нет подтверждённого доступа к компании')
  if (!state.cart.length) throw new Error('Корзина пуста')
  const lines = cartLines(state)
  const amount = total(lines)
  const customer = String(values.customer ?? '').trim()
  const project = String(values.project ?? '').trim()
  if (needsProject(amount) && (!customer || !project)) throw new Error('От 800 000 ₽ укажите конечного заказчика и наименование проекта')
  if (values.consent !== true) throw new Error('Подтвердите ознакомление с демонстрационными условиями')
  const delivery = orderDelivery(lines, values, state.company.email)
  const order = {
    id: `DEMO-${String(state.orders.length + 1).padStart(4, '0')}`,
    date: new Date().toISOString(), company: { ...state.company }, author: userContact(currentUser(state)),
    lines, total: amount + delivery.cost, delivery, customer, project,
    invoice: false, paid: false, agreement: false
  }
  state.orders.unshift(order)
  clearPurchasedCart(state)
  return order
}

export function advanceOrder(state, id, event) {
  if (!canPurchase(state)) throw new Error('Нет доступа к заказу')
  const order = state.orders.find(item => item.id === id)
  if (!order) throw new Error('Заказ не найден')
  if (event === 'invoice' && !order.invoice) order.invoice = true
  else if (event === 'paid' && order.invoice && !order.paid) order.paid = true
  else if (event === 'agreement' && order.paid && !order.agreement) order.agreement = true
  else throw new Error('Это событие сейчас недоступно')
}

export function softwareOrders(state) {
  if (!canPurchase(state)) throw new Error('Нет подтверждённого доступа к ПО и соглашениям компании')
  // shortcut: каждая строка демо содержит ПО, иногда с ключом; самостоятельное оборудование здесь не моделируется.
  return state.orders.map(order => ({ order, status: !order.paid ? 'unpaid' : order.agreement ? 'published' : 'unpublished' }))
}

export function loadDemoOrders(state) {
  if (state.role !== 'admin') throw new Error('Для загрузки примеров переключитесь на администратора. Доступ сотрудника открывается через заявку и верификацию.')
  if (!contactsVerified(state) || !currentUser(state).person.trim()) throw new Error('Для примеров заказов заполните ФИО и подтвердите почту и телефон IEK ID')
  setStage(state, 'verified')
  let added = 0
  for (let index = 0; index < 4; index++) {
    const id = `SAMPLE-0${index + 1}`
    if (state.orders.some(order => order.id === id)) continue
    const sample = { ...initialState(), stage: 'verified', company: { ...state.company }, adminUser: userContact(administrator(state)), verifiedEmails: [...state.verifiedEmails], verifiedPhones: [...state.verifiedPhones] }
    addItem(sample, index % 2 ? 'standard' : 'lite', 1)
    const order = submitOrder(sample, { consent: true })
    for (const event of ['invoice', 'paid', 'agreement'].slice(0, index)) advanceOrder(sample, order.id, event)
    order.id = id
    order.demoSample = true
    state.orders.push(order)
    added++
  }
  return added
}
