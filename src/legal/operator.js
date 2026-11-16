// Реквизиты владельца сайта (оператора персональных данных).
// Пока поле пустое, в документах на его месте стоит заметная пометка «укажите…»,
// а сверху каждой страницы висит предупреждение, что это черновик.
export const OPERATOR = {
  name: '', // ФИО ИП, самозанятого или название организации
  inn: '', // ИНН
  address: '', // адрес регистрации или местонахождения
  email: '', // почта для обращений по персональным данным
  serverLocation: '', // где стоит сервер сайта: страна и город или название хостинга

  revision: '13 ноября 2026 г.', // дата редакции документов; меняйте при каждой правке текста

  // Поставьте true, когда юрист проверит тексты, реквизиты заполнены,
  // а уведомление в Роскомнадзор подано. Тогда предупреждение о черновике исчезнет.
  reviewed: false,
}

// Важно: документы обещают, что текст ТЗ не уходит третьим лицам. Это верно, пока модель
// работает на том же сервере (OLLAMA_URL по умолчанию). Если подключите облачную модель,
// перепишите разделы о передаче данных в src/pages/Legal.jsx.
// Раздел «Экспертиза» уже работает через Google Gemini: браузер пользователя отправляет документы
// в Google напрямую, по ключу пользователя. В документах это описано как исключение.

export const LEGAL_DOCS = [
  { id: 'agent', short: 'Агент и ваши данные' },
  { id: 'privacy', short: 'Обработка данных' },
  { id: 'consent', short: 'Согласие' },
  { id: 'terms', short: 'Соглашение' },
]

export const isDraft = !OPERATOR.reviewed || !OPERATOR.name || !OPERATOR.inn || !OPERATOR.address || !OPERATOR.email

// Согласие на обработку данных: дата, когда его дали в этом браузере
const CONSENT = 'ae.consent'

export function getConsent() {
  try {
    return localStorage.getItem(CONSENT)
  } catch {
    return null
  }
}

export function saveConsent() {
  localStorage.setItem(CONSENT, new Date().toISOString())
}

// Удаляет всё, что сайт сохранил в этом браузере: сессию, историю, настройки, согласие
export function eraseLocalData() {
  for (const key of Object.keys(localStorage)) if (key.startsWith('ae.')) localStorage.removeItem(key)
}
