import type { ButtonHTMLAttributes } from "react";

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

// 实底按钮统一走 on-solid + *-solid 令牌组合，保证两种模式下都满足 AA。
const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-primary-solid text-on-solid hover:bg-primary-deep",
  secondary:
    "border border-line bg-surface text-ink hover:border-line-strong hover:bg-surface-hover",
  danger:
    "bg-danger text-white hover:bg-danger/90",
  ghost:
    "bg-transparent text-ink-2 hover:bg-surface-hover hover:text-primary-deep",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-meta",
  md: "h-10 px-4 text-ui",
  lg: "h-12 px-6 text-base",
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
      className={`inline-flex items-center justify-center gap-1.5 rounded-sm font-semibold transition-colors duration-150 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
