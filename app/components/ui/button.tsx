import { ButtonHTMLAttributes } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "ghost" | "link";
  size?: "sm" | "md";
}

export function Button({
  variant = "default",
  size = "md",
  className = "",
  children,
  ...props
}: ButtonProps) {
  const base = "inline-flex items-center justify-center rounded font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-black disabled:pointer-events-none disabled:opacity-50";

  const variants: Record<string, string> = {
    default: "bg-black text-white hover:bg-neutral-800",
    ghost: "hover:bg-neutral-100 text-neutral-700",
    link: "text-neutral-600 hover:text-black underline-offset-4 hover:underline",
  };

  const sizes: Record<string, string> = {
    sm: "h-7 px-2 text-xs",
    md: "h-8 px-3 text-sm",
  };

  return (
    <button
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
