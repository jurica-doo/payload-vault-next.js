"use client";

import { useParams, usePathname } from "next/navigation";
import { categories } from "../../data/Categories";
import { useTitle } from "../../context/title/TitleContext";
import { useLayoutEffect } from "react";
import { AdcuriPage } from "./AdcuriPage";
import { OtherPages } from "./OtherPages";
import { OtherExpensesPages } from "./OtherExpensesPages";

export function CategoryPage() {
  const { slug, subSlug } = useParams<{ slug: string; subSlug?: string }>();
  const fullSlug = subSlug ? `${slug}/${subSlug}` : slug;
  const category = categories.find((c) => c.slug === fullSlug);
  const pathname = usePathname();
  const isSales = pathname.includes("/einnahmen/");

  const { setTitle } = useTitle();

  useLayoutEffect(() => {
    setTitle(category?.title || "Kategorie");
  }, [setTitle, category?.title]);

  if (!category) return <h1>Kategorie nicht gefunden: {fullSlug}</h1>;

  return (
    <div>
      {category.title === "Adcuri" ? (
        <AdcuriPage />
      ) : isSales ? (
        <OtherPages title={category.title} />
      ) : (
        <OtherExpensesPages title={category.title} />
      )}
    </div>
  );
}
