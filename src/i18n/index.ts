/**
 * i18next 国际化配置
 */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import type { Language } from '@/types';
import { getInitialLanguage } from '@/utils/language';
import zhCN from './locales/zh-CN.json';

type TranslationResource = Record<string, unknown>;

const FALLBACK_LANGUAGE: Language = 'zh-CN';
const fallbackResource = zhCN as TranslationResource;

const localeLoaders: Record<Language, () => Promise<{ default: TranslationResource }>> = {
  'zh-CN': () => Promise.resolve({ default: fallbackResource }),
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
    const languagesToLoad = Array.from(new Set([initialLanguage, FALLBACK_LANGUAGE]));
    const resourceEntries = await Promise.all(
      languagesToLoad.map(async (language) => {
        const resource = await loadLocaleResource(language);
        loadedLanguages.add(language);
        return [language, { translation: resource }] as const;
      })
    );

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
