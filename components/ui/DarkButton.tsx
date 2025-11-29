import React from "react";

type DarkButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  secondary?: boolean;
};

export const DarkButton = ({
  children,
  secondary = false,
  className = "",
  ...props
}: DarkButtonProps) => {
  const base =
    "px-8 py-3 rounded-pill tracking-wide transition-all duration-300 transform active:scale-95 text-[14px] font-[500] font-roboto";

  const variant = secondary
    ? "bg-transparent border border-white/20 text-white hover:bg-white/10"
    : "bg-accent text-brand-dark hover:bg-accent-hover shadow-[0_4px_20px_-5px_rgba(230,138,138,0.4)]";

  return (
    <button className={`${base} ${variant} ${className}`} {...props}>
      {children}
    </button>
  );
};
