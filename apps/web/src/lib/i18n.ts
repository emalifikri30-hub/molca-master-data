import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import { en } from "@/locales/en";
import { id } from "@/locales/id";

// Bilingual ID/EN like every MolcaDx app (and Product Foundation). Indonesian first: the plants we sell to work in
// Indonesian; English for regional and head-office users. The choice is remembered per browser.

const KEY = "molca-lang";

function initialLanguage(): "id" | "en" {
  try {
    const stored = localStorage.getItem(KEY);
    if (stored === "id" || stored === "en") return stored;
  } catch {
    // private mode
  }
  // Indonesian unless English was chosen, like Product Foundation
  return "id";
}

void i18n.use(initReactI18next).init({
  resources: { id: { translation: id }, en: { translation: en } },
  lng: initialLanguage(),
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

function setLanguage(lng: "id" | "en") {
  void i18n.changeLanguage(lng);
  document.documentElement.lang = lng;
  try {
    localStorage.setItem(KEY, lng);
  } catch {
    // not remembered, still switched
  }
}

document.documentElement.lang = i18n.language;

export { i18n, setLanguage };
