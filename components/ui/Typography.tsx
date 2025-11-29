import React from "react";

type TypographyProps = {
  children: React.ReactNode;
  className?: string;
};

export const Heading1 = ({ children, className = "" }: TypographyProps) => (
  <h1
    className={`font-heading text-5xl md:text-6xl lg:text-7xl font-medium leading-tight tracking-tight text-neutral-900 ${className}`}
  >
    {children}
  </h1>
);

export const Heading2 = ({ children, className = "" }: TypographyProps) => (
  <h2
    className={`font-heading text-3xl md:text-4xl font-medium text-neutral-900 ${className}`}
  >
    {children}
  </h2>
);

type TextProps = TypographyProps & { variant?: "default" | "muted" };

export const Text = ({
  children,
  className = "",
  variant = "default"
}: TextProps) => (
  <p
    className={`font-body text-base md:text-lg leading-relaxed ${
      variant === "muted" ? "text-neutral-600" : "text-neutral-900"
    } ${className}`}
  >
    {children}
  </p>
);
