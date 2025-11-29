import React from "react";

type BadgeProps = {
  children: React.ReactNode;
  className?: string;
};

export const Badge = ({ children, className = "" }: BadgeProps) => (
  <span
    className={`inline-flex items-center py-1.5 px-4 rounded-pill bg-primary-light text-primary-hover text-xs font-bold uppercase tracking-widest ${className}`}
  >
    {children}
  </span>
);
