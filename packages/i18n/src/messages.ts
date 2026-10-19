/** Stable keys for shared UI; source-text catalogs also cover application copy. */
export const messages = {
  chooseLanguage: 'Choose a language',
  languageChanged: 'Language changed',
  loadingLanguage: 'Loading language…',
  languageLoadFailed: 'Could not load this language. Please try again.',
  retry: 'Try again',
  copyCode: 'Copy code',
  copied: 'Copied',
  copyPage: 'Copy page',
} as const;
export type MessageKey = keyof typeof messages;
