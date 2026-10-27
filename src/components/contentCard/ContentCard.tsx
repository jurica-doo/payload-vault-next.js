"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { ActionMenu } from "../actionMenu/ActionMenu";
import { IconButton } from "../iconButton/IconButton";
import { cardIcon } from "./ContentCard.const";
import type { CombinedContentCardProps } from "./ContentCard.types";
import Link from "next/link";
import { TitleSide } from "./TitleSide";
import { normalizeProfit } from "./ContentCard.utils";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  DeleteIcon,
  DownloadIcon,
  EditIcon,
  OpenIcon,
} from "../icons";
import { useModal } from "../../context/modal/ModalContext";
import { DeleteConfirmationForm } from "../modal/DeleteConfirmationForm";

export const ContentCard = (props: CombinedContentCardProps) => {
  const { openModal, closeModal } = useModal();
  const [isExpanded, setIsExpanded] = useState(false);
  const expandRef = useRef<HTMLDivElement>(null);

  const {
    variant,
    title,
    subtitle,
    link,
    date,
    profit,
    downloadLink,
    openLink,
    searchQuery,
    id,
    onDelete,
    onEdit,
    products,
    vendorName,
    activeCategory,
    isSelecting,
    isSelected,
    onToggleSelect,
  } = props;

  const Icon = cardIcon[props.variant];
  const hasProducts = products && products.length > 0;
  const isExpandable = variant === "document" && hasProducts;

  // Animate expand height
  useEffect(() => {
    const el = expandRef.current;
    if (!el) return;

    if (isExpanded) {
      el.style.height = el.scrollHeight + "px";
      const onEnd = () => {
        el.style.height = "auto";
      };
      el.addEventListener("transitionend", onEnd, { once: true });
    } else {
      // Snap to current height, then collapse
      el.style.height = el.scrollHeight + "px";
      requestAnimationFrame(() => {
        el.style.height = "0px";
      });
    }
  }, [isExpanded]);

  // Category/allPdf cards render as real links (see bottom) so navigation
  // supports middle-click, cmd-click and prefetch. Links must be absolute:
  // relative hrefs resolve browser-style against the current URL and land on
  // the wrong page (e.g. "bestandsprovision" from /kategorie/adcuri).
  const isNavLink = variant !== "document" && !!link;

  if (process.env.NODE_ENV !== "production" && link && !link.startsWith("/")) {
    console.warn(
      `ContentCard: expected absolute link starting with "/", got "${link}".`,
    );
  }

  const handleCardClick = () => {
    if (isSelecting && id && onToggleSelect) {
      onToggleSelect(id);
      return;
    }
    if (isExpandable) {
      setIsExpanded((prev) => !prev);
    }
  };

  const handleDownload = useCallback(
    async (e?: React.MouseEvent) => {
      e?.stopPropagation();
      if (!downloadLink) return;
      try {
        const response = await fetch(downloadLink);
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = title || "document.pdf";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      } catch {
        window.open(downloadLink, "_blank", "noopener,noreferrer");
      }
    },
    [downloadLink, title],
  );

  const handleOpen = useCallback(
    (e?: React.MouseEvent) => {
      e?.stopPropagation();
      if (!openLink) return;
      window.open(openLink, "_blank", "noopener,noreferrer");
    },
    [openLink],
  );

  const handleEdit = useCallback(
    (e?: React.MouseEvent) => {
      e?.stopPropagation();
      if (!id || !onEdit) return;
      onEdit(id);
    },
    [id, onEdit],
  );

  const handleDelete = useCallback(
    (e?: React.MouseEvent) => {
      e?.stopPropagation();
      if (!id || !onDelete) return;
      openModal({
        title: "Dokument löschen",
        children: (
          <DeleteConfirmationForm
            fileName={title}
            onConfirm={async () => {
              onDelete(id);
              closeModal();
            }}
            onCancel={closeModal}
          />
        ),
      });
    },
    [id, onDelete, title, openModal, closeModal],
  );

  const handleExpand = useCallback(
    (e?: React.MouseEvent) => {
      e?.stopPropagation();
      if (isExpandable) {
        setIsExpanded((prev) => !prev);
      }
    },
    [isExpandable],
  );

  const isClickable = isSelecting || variant !== "document" || isExpandable;
  const cardClassName = `ui-card group relative flex w-full flex-col justify-center text-color-text-main no-underline hover:no-underline ${
    isClickable ? "interactive-card cursor-pointer" : ""
  } ${
    isSelecting && isSelected
      ? "ring-2! ring-color-primary! bg-color-bg-accent-subtle!"
      : ""
  }`;

  const cardContent = (
    <>
      <div className="px-4 py-3.5 sm:px-5">
        <div className="flex items-center justify-between gap-3">
          {isSelecting && variant === "document" && (
            <div className="flex items-center sm:mr-1 shrink-0">
              <div
                role="checkbox"
                aria-checked={!!isSelected}
                aria-label={`${title} auswählen`}
                className={`flex h-5 w-5 items-center justify-center rounded-[5px] border-2 transition-all duration-150 ${
                  isSelected
                    ? "scale-105 border-color-primary bg-color-primary text-color-on-primary"
                    : "border-color-border-strong bg-color-bg-card"
                }`}
              >
                {isSelected && (
                  <svg
                    className="h-3 w-3 animate-pop-in"
                    viewBox="0 0 12 12"
                    fill="none"
                  >
                    <path
                      d="M10 3L4.5 8.5L2 6"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </div>
            </div>
          )}
          <TitleSide
            title={title}
            subtitle={subtitle}
            date={date}
            Icon={Icon}
            searchQuery={searchQuery || ""}
          />

          <div className="flex shrink-0 items-center justify-end gap-2 sm:gap-4">
            {(profit || profit === 0) && (
              <span className="tabular whitespace-nowrap text-[0.9375rem] font-semibold text-color-text-main">
                {normalizeProfit(profit)} €
              </span>
            )}

            {variant === "document" ? (
              <>
                {!isSelecting && (
                  <div
                    className="flex items-center gap-0.5"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span className="hidden sm:inline-flex">
                      <IconButton
                        icon={DownloadIcon}
                        label="Herunterladen"
                        onClick={(e) => handleDownload(e)}
                      />
                    </span>
                    <ActionMenu
                      label={`Aktionen für ${title}`}
                      items={[
                        {
                          label: "Herunterladen",
                          icon: DownloadIcon,
                          onClick: () => handleDownload(),
                        },
                        {
                          label: "In neuem Tab öffnen",
                          icon: OpenIcon,
                          onClick: () => handleOpen(),
                        },
                        {
                          label: "Bearbeiten",
                          icon: EditIcon,
                          onClick: () => handleEdit(),
                          hidden: !onEdit,
                        },
                        {
                          label: isExpanded ? "Details ausblenden" : "Details anzeigen",
                          icon: ChevronDownIcon,
                          onClick: () => handleExpand(),
                          hidden: !isExpandable,
                        },
                        {
                          label: "Löschen",
                          icon: DeleteIcon,
                          onClick: () => handleDelete(),
                          danger: true,
                        },
                      ]}
                    />
                    {isExpandable && (
                      <ChevronDownIcon
                        size={18}
                        className={`ml-1 hidden shrink-0 text-color-text-subtle transition-transform duration-300 sm:block ${
                          isExpanded ? "rotate-180" : ""
                        }`}
                      />
                    )}
                  </div>
                )}
              </>
            ) : (
              <ChevronRightIcon
                size={18}
                className="shrink-0 text-color-text-subtle transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-color-primary"
              />
            )}
          </div>
        </div>
      </div>

      {/* Animated expandable products section */}
      {isExpandable && (
        <div
          ref={expandRef}
          className="overflow-hidden transition-[height] duration-300 ease-in-out"
          style={{ height: 0 }}
        >
          <div className="border-t border-color-border-light px-4 pb-4 pt-3 sm:px-5">
            {vendorName && (
              <p className="text-sm text-color-text-secondary mb-3">
                Anbieter:{" "}
                <span className="font-medium text-color-text-main">
                  {vendorName}
                </span>
              </p>
            )}
            <div className="flex flex-col gap-2">
              {products.map((product, index) => {
                const isDimmed =
                  !!activeCategory && product.category !== activeCategory;
                return (
                  <div
                    key={index}
                    className={`flex items-center justify-between rounded-radius-md px-3 py-2 ${
                      isDimmed
                        ? "bg-color-bg-alt/50 opacity-40"
                        : "bg-color-bg-alt"
                    }`}
                  >
                    <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                      <span
                        className={`text-sm truncate ${
                          isDimmed
                            ? "font-normal text-color-text-secondary line-through"
                            : "font-medium text-color-text-main"
                        }`}
                      >
                        {product.product_name}
                      </span>
                      <span className="text-xs text-color-text-secondary">
                        {product.category}
                      </span>
                    </div>
                    <span
                      className={`text-sm whitespace-nowrap ml-4 ${
                        isDimmed
                          ? "font-normal text-color-text-secondary"
                          : "tabular font-semibold text-color-text-main"
                      }`}
                    >
                      {normalizeProfit(product.amount)} €
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );

  if (isNavLink && link) {
    return (
      <Link href={link} className={cardClassName}>
        {cardContent}
      </Link>
    );
  }

  return (
    <div className={cardClassName} onClick={handleCardClick}>
      {cardContent}
    </div>
  );
};
