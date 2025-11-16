import { defineConfig } from 'i18next-cli';

export default defineConfig({
  locales: ['ar', 'de', 'en', 'es', 'fr', 'hi', 'it', 'ja', 'ma', 'pt', 'pl', 'ru', 'zh'],
  extract: {
    primaryLanguage: 'ru',
    input: ["./App.tsx","src/**/*.{js,jsx,ts,tsx}"],
    output: "src/i18n/{{language}}.json"
  }
});