/**
 * i18next 国际化配置
 */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import type { Language } from '@/types';
import { getInitialLanguage } from '@/utils/language';

type TranslationResource = Record<string, unknown>;

const FALLBACK_LANGUAGE: Language = 'zh-CN';

// 两份 locale 各约 105KB。zh-CN 曾是静态导入，会被打进入口 chunk，
// 且初始化时连同 fallback 一起解析 —— 对只用英文的用户等于白付 105KB
// 的阻塞 JSON.parse。改为全部动态导入，首屏只加载当前语言。
const localeLoaders: Record<Language, () => Promise<{ default: TranslationResource }>> = {
  'zh-CN': () => import('./locales/zh-CN.json'),
  en: () => import('./locales/en.json'),
};

const loadedLanguages = new Set<Language>();
let initializePromise: Promise<typeof i18n> | null = null;

const loadLocaleResource = async (language: Language): Promise<TranslationResource> => {
  const module = await localeLoaders[language]();
  return module.default;
};

export const ensureLanguageResource = async (language: Language) => {
  if (
    loadedLanguages.has(language) &&
    (!i18n.isInitialized || i18n.hasResourceBundle(language, 'translation'))
  ) {
    return;
  }

  const resource = await loadLocaleResource(language);
  if (i18n.isInitialized) {
    i18n.addResourceBundle(language, 'translation', resource, true, true);
  }
  loadedLanguages.add(language);
};

export const initializeI18n = () => {
  if (initializePromise) {
    return initializePromise;
  }

  initializePromise = (async () => {
    const initialLanguage = getInitialLanguage();
    // 关键路径上只加载当前语言；fallback 语言在切换语言时再加载，
    // 避免用户不切换语言也要额外请求并解析另一份约 105KB 的 JSON。
    const resource = await loadLocaleResource(initialLanguage);
    loadedLanguages.add(initialLanguage);
    const resourceEntries = [[initialLanguage, { translation: resource }]] as const;

    if (!i18n.isInitialized) {
      await i18n.use(initReactI18next).init({
        resources: Object.fromEntries(resourceEntries),
        lng: initialLanguage,
        fallbackLng: FALLBACK_LANGUAGE,
        interpolation: {
          escapeValue: false, // React 已经转义
        },
        react: {
          useSuspense: false,
        },
      });
      return i18n;
    }

    resourceEntries.forEach(([language, bundle]) => {
      i18n.addResourceBundle(language, 'translation', bundle.translation, true, true);
    });
    await i18n.changeLanguage(initialLanguage);
    return i18n;
  })();

  return initializePromise;
};

export const changeI18nLanguage = async (language: Language) => {
  if (!i18n.isInitialized) {
    await initializeI18n();
  }
  await ensureLanguageResource(language);
  await i18n.changeLanguage(language);
};

export default i18n;
