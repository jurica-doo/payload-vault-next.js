"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { cardIcon } from "./ContentCard.const";
import type { CombinedContentCardProps } from "./ContentCard.types";
import { useRouter } from "next/navigation";
import { TitleSide } from "./TitleSide";
import { normalizeProfit } from "./ContentCard.utils";
import {
  ArrowIcon,
  DeleteIcon,
  DownloadIcon,
  EditIcon,
  OpenIcon,
  MoreIcon,
} from "../icons";
import { useModal } from "../../context/modal/ModalContext";
import { DeleteConfirmationForm } from "../modal/DeleteConfirmationForm";

export const ContentCard = (props: CombinedContentCardProps) => {
  const router = useRouter();
  const { openModal, closeModal } = useModal();
  const [isExpanded, setIsExpanded] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const expandRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

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

  // Close mobile menu on outside click
  useEffect(() => {
    if (!mobileMenuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMobileMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [mobileMenuOpen]);

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

  const handleNavigate = () => {
    if (link && variant !== "document") {
      router.push(link);
    }
  };

  const handleCardClick = () => {
    if (isSelecting && id && onToggleSelect) {
      onToggleSelect(id);
      return;
    }
    if (isExpandable) {
      setIsExpanded((prev) => !prev);
    } else {
      handleNavigate();
    }
  };

  const handleDownload = useCallback(
    async (e?: React.MouseEvent) => {
      e?.stopPropagation();
      setMobileMenuOpen(false);
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
      setMobileMenuOpen(false);
      if (!openLink) return;
      window.open(openLink, "_blank", "noopener,noreferrer");
    },
    [openLink],
  );

  const handleEdit = useCallback(
    (e?: React.MouseEvent) => {
      e?.stopPropagation();
      setMobileMenuOpen(false);
      if (!id || !onEdit) return;
      onEdit(id);
    },
    [id, onEdit],
  );

  const handleDelete = useCallback(
    (e?: React.MouseEvent) => {
      e?.stopPropagation();
      setMobileMenuOpen(false);
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
      setMobileMenuOpen(false);
      if (isExpandable) {
        setIsExpanded((prev) => !prev);
      }
    },
    [isExpandable],
  );

  const handleMoreClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setMobileMenuOpen((prev) => !prev);
  };

  return (
    <div
      className={`relative w-full bg-color-bg-card border rounded-radius-md shadow-shadow-medium
        transition-all duration-200 ease-in-out
        ${
          isSelecting
            ? `cursor-pointer hover:-translate-y-0.5 hover:shadow-shadow-strong active:scale-[0.99] ${
                isSelected
                  ? "border-color-primary ring-2 ring-color-primary/30 bg-color-primary/5"
                  : "border-color-border-light hover:border-color-primary"
              }`
            : variant !== "document" || isExpandable
              ? "border-color-border-light cursor-pointer hover:border-color-primary hover:-translate-y-0.5 hover:shadow-shadow-strong active:scale-[0.99]"
              : "border-color-border-light"
        }`}
      onClick={handleCardClick}
    >
      <div className="p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {isSelecting && variant === "document" && (
            <div className="flex items-center sm:mr-1 shrink-0">
              <div
                className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all duration-150 ${
                  isSelected
                    ? "bg-color-primary border-color-primary"
                    : "border-color-border-light bg-color-bg-card"
                }`}
              >
                {isSelected && (
                  <svg
                    className="w-3 h-3 text-white"
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

          <div className="flex w-full items-center justify-end gap-3 sm:w-auto sm:justify-end sm:gap-5">
            {(profit || profit === 0) && (
              <h4 className="font-bold text-color-primary whitespace-nowrap">
                {normalizeProfit(profit)} €
              </h4>
            )}

            {variant === "document" ? (
              <>
                {!isSelecting && (
                  <>
                    {/* Desktop actions — hidden on mobile */}
                    <div className="hidden sm:flex items-center gap-5">
                      <button
                        type="button"
                        className="cursor-pointer p-1 items-center justify-center flex
                          hover:text-color-primary rounded-radius-sm hover:bg-color-primary/10
                          transition-all duration-200 ease-in-out active:scale-90"
                        onClick={(e) => handleDownload(e)}
                        aria-label="Herunterladen"
                      >
                        <DownloadIcon className="w-6 h-6 text-color-icon shrink-0" />
                      </button>

                      <button
                        type="button"
                        className="cursor-pointer p-1 items-center justify-center flex
                          hover:text-color-primary rounded-radius-sm hover:bg-color-primary/10
                          transition-all duration-200 ease-in-out active:scale-90"
                        onClick={(e) => handleOpen(e)}
                        aria-label="Öffnen"
                      >
                        <OpenIcon className="w-6 h-6 text-color-icon shrink-0" />
                      </button>

                      {onEdit && (
                        <button
                          type="button"
                          className="cursor-pointer p-1 items-center justify-center flex
                            hover:text-color-primary rounded-radius-sm hover:bg-color-primary/10
                            transition-all duration-200 ease-in-out active:scale-90"
                          onClick={(e) => handleEdit(e)}
                          aria-label="Bearbeiten"
                        >
                          <EditIcon className="w-6 h-6 text-color-icon shrink-0" />
                        </button>
                      )}

                      <button
                        type="button"
                        className="cursor-pointer p-1 items-center justify-center flex
                          hover:text-color-error-text rounded-radius-sm hover:bg-color-error/20
                          transition-all duration-200 ease-in-out active:scale-90"
                        onClick={(e) => handleDelete(e)}
                        aria-label="Löschen"
                      >
                        <DeleteIcon className="w-6 h-6 text-color-icon shrink-0" />
                      </button>

                      {isExpandable && (
                        <ArrowIcon
                          className={`w-4 h-4 text-color-icon shrink-0 transition-transform duration-300 ${
                            isExpanded ? "rotate-90" : "rotate-180"
                          }`}
                        />
                      )}
                    </div>

                    {/* Mobile three-dot menu — visible only on mobile, opens UPWARD */}
                    <div className="relative sm:hidden" ref={menuRef}>
                      <button
                        type="button"
                        className="cursor-pointer p-2 flex items-center justify-center
                      rounded-radius-sm hover:bg-color-primary/10
                      transition-all duration-200 active:scale-90"
                        onClick={handleMoreClick}
                        aria-label="Aktionen"
                      >
                        <MoreIcon className="w-5 h-5 text-color-icon" />
                      </button>

                      {mobileMenuOpen && (
                        <div
                          className="absolute right-0 bottom-full mb-1 z-50
                        w-52 rounded-radius-md border border-color-border-light
                        bg-color-bg-card shadow-shadow-strong
                        overflow-hidden animate-slide-up origin-bottom"
                        >
                          <button
                            type="button"
                            className="w-full flex items-center gap-3 px-4 py-3
                          text-sm text-color-text-main hover:bg-color-primary/10
                          transition-colors duration-150"
                            onClick={(e) => handleDownload(e)}
                          >
                            <DownloadIcon className="w-5 h-5 text-color-icon shrink-0" />
                            <span>Herunterladen</span>
                          </button>

                          <button
                            type="button"
                            className="w-full flex items-center gap-3 px-4 py-3
                          text-sm text-color-text-main hover:bg-color-primary/10
                          transition-colors duration-150"
                            onClick={(e) => handleOpen(e)}
                          >
                            <OpenIcon className="w-5 h-5 text-color-icon shrink-0" />
                            <span>In neuem Tab öffnen</span>
                          </button>

                          {onEdit && (
                            <button
                              type="button"
                              className="w-full flex items-center gap-3 px-4 py-3
                            text-sm text-color-text-main hover:bg-color-primary/10
                            transition-colors duration-150"
                              onClick={(e) => handleEdit(e)}
                            >
                              <EditIcon className="w-5 h-5 text-color-icon shrink-0" />
                              <span>Bearbeiten</span>
                            </button>
                          )}

                          <button
                            type="button"
                            className="w-full flex items-center gap-3 px-4 py-3
                          text-sm text-color-error-text hover:bg-color-error/10
                          transition-colors duration-150"
                            onClick={(e) => handleDelete(e)}
                          >
                            <DeleteIcon className="w-5 h-5 text-color-error-text shrink-0" />
                            <span>Löschen</span>
                          </button>

                          {isExpandable && (
                            <button
                              type="button"
                              className="w-full flex items-center gap-3 px-4 py-3
                            text-sm text-color-text-main hover:bg-color-primary/10
                            transition-colors duration-150"
                              onClick={(e) => handleExpand(e)}
                            >
                              <ArrowIcon
                                className={`w-5 h-5 text-color-icon shrink-0 transition-transform duration-300 ${
                                  isExpanded ? "rotate-90" : "rotate-180"
                                }`}
                              />
                              <span>
                                {isExpanded
                                  ? "Details ausblenden"
                                  : "Details anzeigen"}
                              </span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </>
            ) : (
              <ArrowIcon className="w-4 h-4 text-color-icon shrink-0 rotate-180" />
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
          <div className="border-t border-color-border-light px-4 pb-4 pt-3">
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
                    className={`flex items-center justify-between rounded-md px-3 py-2 ${
                      isDimmed
                        ? "bg-color-bg-dark/50 opacity-40"
                        : "bg-color-bg-dark"
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
                          : "font-semibold text-color-primary"
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
    </div>
  );
};
