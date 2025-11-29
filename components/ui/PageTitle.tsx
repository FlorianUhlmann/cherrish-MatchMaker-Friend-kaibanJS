import Image from "next/image";
import React from "react";

type PageTitleProps = {
  title: string;
  subtitle?: string;
};

export const PageTitle = ({ title, subtitle }: PageTitleProps) => {
  const tokens = title.split(" ");
  const firstWord = tokens[0] ?? "";
  const secondWord = tokens[1] ?? "";
  const remaining = tokens.slice(2).join(" ");

  return (
    <div className="text-center mb-10 max-w-2xl mx-auto space-y-4">
      <div className="flex items-end justify-center gap-4">
        <h1 className="flex flex-wrap items-end gap-3 font-lora text-[27px] leading-tight font-[400] text-white">
          {firstWord && (
            <span className="italic text-white">{firstWord}</span>
          )}
          {secondWord && (
            <span className="text-[rgb(233,147,153)] font-[700]">
              {secondWord}
            </span>
          )}
          {remaining && (
            <span className="italic text-white">{remaining}</span>
          )}
        </h1>
      </div>
      {subtitle && (
        <p className="text-text-muted text-[14px] font-[500] font-roboto leading-relaxed">
          {subtitle}
        </p>
      )}
    </div>
  );
};
