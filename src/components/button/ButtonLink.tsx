import Link from "next/link";
import type { ComponentType, SVGProps } from "react";
import { sizeClasses, variantClasses, onHover } from "./Button.const";
import type { ButtonSize, ButtonVariant } from "./Button.types";

type ButtonLinkProps = {
  href: string;
  text: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ComponentType<SVGProps<SVGSVGElement>>;
};

/** A navigation link that looks like a Button (default: secondary). */
export const ButtonLink = ({
  href,
  text,
  variant = "secondary",
  size = "small",
  icon: Icon,
}: ButtonLinkProps) => (
  <Link
    href={href}
    className={`inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-radius-md font-medium leading-none no-underline transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-out hover:no-underline active:scale-[0.97] ${variantClasses[variant]} ${sizeClasses[size]} ${onHover[variant]}`}
  >
    {Icon && <Icon className="h-[18px] w-[18px] shrink-0" />}
    {text}
  </Link>
);
