"use client";

import { useParams } from "next/navigation";
import { categories } from "../../data/Categories";
import { useTitle } from "../../context/title/TitleContext";
import { useLayoutEffect } from "react";

export function CategoryPdfsPage() {
  const { slug, subSlug } = useParams<{ slug: string; subSlug?: string }>();
  const fullSlug = subSlug ? `${slug}/${subSlug}` : slug;

  const category = categories.find((c) => c.slug === fullSlug);
  if (!category) return <h1>Kategorie nicht gefunden: {fullSlug}</h1>;

  const { setTitle } = useTitle();

  useLayoutEffect(() => {
    setTitle(`${category.title} — PDF`);
  }, [setTitle, category.title]);

  return (
    <div>
      <h1>{category.title} — PDFs</h1>
    </div>
  );
}
