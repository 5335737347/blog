import type { ButtonHTMLAttributes } from "react";

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-gradient-to-r from-pink-400 to-purple-400 text-white hover:from-pink-500 hover:to-purple-500 shadow-md shadow-pink-200 dark:shadow-purple-900/30",
  secondary:
    "bg-white text-purple-600 border-2 border-purple-200 hover:bg-purple-50 dark:bg-purple-950/30 dark:text-purple-300 dark:border-purple-800 dark:hover:bg-purple-900/30",
  danger:
    "bg-gradient-to-r from-red-400 to-pink-400 text-white hover:from-red-500 hover:to-pink-500",
  ghost:
    "bg-transparent text-purple-500 hover:bg-purple-50 dark:text-purple-400 dark:hover:bg-purple-900/20",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-sm",
  md: "px-5 py-2 text-sm",
  lg: "px-6 py-3 text-base",
};

export default function Button({
  variant = "primary",
  size = "md",
  className = "",
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center rounded-2xl font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-pink-400 focus:ring-offset-2 dark:focus:ring-offset-purple-950 disabled:opacity-50 disabled:pointer-events-none active:scale-95 ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
