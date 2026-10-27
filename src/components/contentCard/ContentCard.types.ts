import type { IconProps } from "../icons/Icon.types";
import { type ComponentType } from "react";
import type { StoredProduct } from "../../hooks/useExpenses/types";

type ContentCardVariant = "allPdf" | "category" | "document";

type ContentCardProps =
  | {
      variant: "allPdf";
      title: string;
      subtitle: string;
      link: string;
    }
  | {
      variant: "category";
      title: string;
      subtitle: string;
      profit: number;
      link: string;
    }
  | {
      variant: "document";
      title: string;
      date: string;
      profit: number;
      downloadLink: string;
      openLink: string;
    };

type CombinedContentCardProps = {
  variant: ContentCardProps["variant"];
  title: string;
  subtitle?: string;
  date?: string;
  profit?: number;
  link?: string;
  downloadLink?: string;
  openLink?: string;
  searchQuery?: string;
  id?: string;
  /** May return a promise; the delete dialog waits for it and reports failures. */
  onDelete?: (id: string) => void | Promise<unknown>;
  onEdit?: (id: string) => void;
  products?: StoredProduct[];
  vendorName?: string;
  activeCategory?: string;
  isSelecting?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (id: string) => void;
};

type SvgIcon = ComponentType<IconProps>;

type TitleSideProps = {
  title: string;
  subtitle?: string;
  date?: string;
  Icon: SvgIcon;
  searchQuery: string;
};

export type {
  ContentCardProps,
  CombinedContentCardProps,
  ContentCardVariant,
  SvgIcon,
  TitleSideProps,
};
