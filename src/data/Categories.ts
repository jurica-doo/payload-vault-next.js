import type {
  ExpenseCategory,
  Category as TitleCategory,
} from "../hooks/usePdf/types";

export type SlugCategory =
  | "strom-gas"
  | "barmenia-abrechnung"
  | "ikk-abrechnung"
  | "adcuri"
  | "adcuri/abschlussprovision"
  | "adcuri/bestandsprovision"
  | "mobilitaet"
  | "geschaeftsessen"
  | "buero-arbeitsmittel"
  | "kommunikation"
  | "weiterbildung"
  | "reisen"
  | "versicherungen"
  | "bank-gebuehren"
  | "marketing"
  | "sonstiges";

export type Category = {
  slug: SlugCategory;
  title: TitleCategory | ExpenseCategory | "Adcuri";
};

export const categories: Category[] = [
  { slug: "strom-gas", title: "Strom & Gas" },
  { slug: "barmenia-abrechnung", title: "Barmenia Abrechnung" },
  { slug: "ikk-abrechnung", title: "IKK Abrechnung" },
  { slug: "adcuri", title: "Adcuri" },
  { slug: "adcuri/abschlussprovision", title: "Adcuri Abschlussprovision" },
  { slug: "adcuri/bestandsprovision", title: "Adcuri Bestandsprovision" },
  { slug: "mobilitaet", title: "Mobilität" },
  { slug: "geschaeftsessen", title: "Geschäftsessen" },
  { slug: "buero-arbeitsmittel", title: "Büro & Arbeitsmittel" },
  { slug: "kommunikation", title: "Kommunikation" },
  { slug: "weiterbildung", title: "Weiterbildung" },
  { slug: "reisen", title: "Reisen" },
  { slug: "versicherungen", title: "Versicherungen" },
  { slug: "bank-gebuehren", title: "Bank & Gebühren" },
  { slug: "marketing", title: "Marketing" },
  { slug: "sonstiges", title: "Sonstiges" },
];
