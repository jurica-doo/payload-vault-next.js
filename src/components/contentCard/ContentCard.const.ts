import { PdfIcon, FolderIcon } from "../icons";
import type { ContentCardVariant, SvgIcon } from "./ContentCard.types";

const cardIcon: Record<ContentCardVariant, SvgIcon> = {
  allPdf: PdfIcon,
  category: FolderIcon,
  document: PdfIcon,
};

export { cardIcon };
