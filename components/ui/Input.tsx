import React from "react";

export const Input = (props: React.InputHTMLAttributes<HTMLInputElement>) => (
  <input
    className="w-full px-6 py-4 bg-neutral-50 border border-neutral-100 rounded-pill text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all duration-200"
    {...props}
  />
);
