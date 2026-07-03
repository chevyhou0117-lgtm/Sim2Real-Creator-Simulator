"use client";

import { Toaster as Sonner, ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="dark"
      className="toaster group"
      style={
        {
          "--normal-bg": "var(--c-0b1d30)",
          "--normal-text": "#e2e8f0",
          "--normal-border": "var(--c-1e3a55)",
          "--error-bg": "var(--c-2c1010)",
          "--error-text": "#fca5a5",
          "--error-border": "#7f1d1d",
          "--success-bg": "var(--c-0f2716)",
          "--success-text": "#86efac",
          "--success-border": "var(--c-166534)",
        } as React.CSSProperties
      }
      position="top-center"
      duration={2000}
      {...props}
    />
  );
};

export { Toaster };
