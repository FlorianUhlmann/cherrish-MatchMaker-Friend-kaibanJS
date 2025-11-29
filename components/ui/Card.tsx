import React from "react";

type CardProps = {
  children: React.ReactNode;
  className?: string;
};

export const Card = ({ children, className = "" }: CardProps) => (
  <div
    className={`bg-neutral-white rounded-brand-md border border-neutral-50 shadow-brand-sm hover:shadow-brand-md transition-shadow duration-300 overflow-hidden ${className}`}
  >
    {children}
  </div>
);
