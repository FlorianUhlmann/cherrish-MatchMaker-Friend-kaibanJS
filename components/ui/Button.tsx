import React from "react";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "outline" | "ghost";
};

const variants: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary: "bg-primary text-white hover:bg-primary-hover shadow-brand-sm hover:shadow-brand-md",
  outline: "border border-neutral-900 text-neutral-900 hover:bg-neutral-50",
  ghost: "text-primary hover:bg-primary-light"
};

export const Button = ({
  variant = "primary",
  className = "",
  children,
  ...props
}: ButtonProps) => {
  const baseStyle =
    "inline-flex items-center justify-center px-8 py-3.5 text-sm font-semibold tracking-wide transition-all duration-300 rounded-pill focus-visible:outline-none active:scale-95 disabled:opacity-50";

  return (
    <button className={`${baseStyle} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
};
