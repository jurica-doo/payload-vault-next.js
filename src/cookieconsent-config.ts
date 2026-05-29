import "vanilla-cookieconsent/dist/cookieconsent.css";
import * as CookieConsent from "vanilla-cookieconsent";

export function setupCookieConsent() {
  CookieConsent.run({
    guiOptions: {
      consentModal: {
        layout: "bar inline",
        position: "bottom",
        equalWeightButtons: true,
        flipButtons: false,
      },
      preferencesModal: {
        layout: "box",
        equalWeightButtons: true,
        flipButtons: false,
      },
    },

    categories: {
      necessary: {
        enabled: true,
        readOnly: true,
      },
    },

    language: {
      default: "de",
      translations: {
        de: {
          consentModal: {
            title: "Wir verwenden Cookies",
            description:
              "Diese Website verwendet ausschließlich technisch notwendige Cookies und lokale Speicherung (Local Storage), um die grundlegende Funktionalität sicherzustellen. Es werden keine Tracking-, Analyse- oder Marketing-Cookies eingesetzt.",
            acceptAllBtn: "Verstanden",
            showPreferencesBtn: "Details anzeigen",
            footer:
              '<a href="/datenschutz">Datenschutzerklärung</a> · <a href="/impressum">Impressum</a>',
          },
          preferencesModal: {
            title: "Cookie-Einstellungen",
            acceptAllBtn: "Verstanden",
            savePreferencesBtn: "Einstellungen speichern",
            closeIconLabel: "Schließen",
            sections: [
              {
                title: "Verwendung von Cookies und Local Storage",
                description:
                  "PayloadVault nutzt ausschließlich technisch notwendige Mechanismen, um Ihnen eine sichere und funktionale Anwendung bereitzustellen. Wir setzen keine Analyse- oder Werbe-Cookies ein.",
              },
              {
                title: "Technisch notwendig",
                description:
                  "Diese Speichermechanismen sind für den Betrieb der Website unerlässlich. Sie ermöglichen grundlegende Funktionen wie Authentifizierung, Theme-Einstellungen und Jahresauswahl. Ohne sie kann die Website nicht ordnungsgemäß funktionieren.",
                linkedCategory: "necessary",
                cookieTable: {
                  headers: {
                    name: "Name",
                    description: "Beschreibung",
                    duration: "Dauer",
                  },
                  body: [
                    {
                      name: "sb-*-auth-token",
                      description:
                        "Authentifizierungs-Token von Supabase – hält Sie angemeldet",
                      duration: "Sitzung",
                    },
                    {
                      name: "theme",
                      description:
                        "Speichert Ihre bevorzugte Darstellung (hell/dunkel)",
                      duration: "Dauerhaft",
                    },
                    {
                      name: "payloadvault_year",
                      description:
                        "Speichert das ausgewählte Geschäftsjahr",
                      duration: "Dauerhaft",
                    },
                    {
                      name: "cc_cookie",
                      description:
                        "Speichert Ihre Cookie-Einstellungen",
                      duration: "6 Monate",
                    },
                  ],
                },
              },
              {
                title: "Weitere Informationen",
                description:
                  'Für weitere Informationen zum Umgang mit Ihren Daten lesen Sie bitte unsere <a href="/datenschutz">Datenschutzerklärung</a>. Bei Fragen können Sie uns jederzeit über die im <a href="/impressum">Impressum</a> angegebenen Kontaktdaten erreichen.',
              },
            ],
          },
        },
      },
    },
  });
}

export { CookieConsent };
