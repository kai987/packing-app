export const supportedLocales = ['ja', 'zh', 'en'] as const

export type SupportedLocale = (typeof supportedLocales)[number]

export const localeNames: Record<SupportedLocale, string> = {
  ja: '日本語',
  zh: '中文',
  en: 'English',
}

const localeCycleMap: Record<SupportedLocale, SupportedLocale> = {
  ja: 'zh',
  zh: 'en',
  en: 'ja',
}

const documentLangMap: Record<SupportedLocale, string> = {
  ja: 'ja',
  zh: 'zh-CN',
  en: 'en',
}

const intlLocaleMap: Record<SupportedLocale, string> = {
  ja: 'ja-JP',
  zh: 'zh-CN',
  en: 'en-US',
}

export function cycleLocale(locale: SupportedLocale): SupportedLocale {
  return localeCycleMap[locale]
}

export function getDocumentLang(locale: SupportedLocale): string {
  return documentLangMap[locale]
}

export function getIntlLocale(locale: SupportedLocale): string {
  return intlLocaleMap[locale]
}

export function formatCurrencyYen(
  amount: number,
  locale: SupportedLocale,
): string {
  return new Intl.NumberFormat(getIntlLocale(locale), {
    style: 'currency',
    currency: 'JPY',
    currencyDisplay: 'narrowSymbol',
    maximumFractionDigits: 0,
  }).format(amount)
}
