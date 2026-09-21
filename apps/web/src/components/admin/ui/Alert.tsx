type AlertVariant = "success" | "error" | "info";

const variantClasses: Record<AlertVariant, string> = {
  success: "border-success/30 bg-success-soft text-success",
  error: "border-danger/30 bg-danger-soft text-danger",
  info: "border-accent/30 bg-accent-soft text-accent-deep",
};

interface AlertProps {
  variant: AlertVariant;
  children: React.ReactNode;
  className?: string;
}

/**
 * 后台统一的提示横幅。此前各页面的错误/成功提示是三四种写法各异的
 * 内联 div（red-50/green-50、✅/❌ 前缀混用），这里收拢成一种。
 */
export default function Alert({ variant, children, className = "" }: AlertProps) {
  return (
    <div
      role={variant === "error" ? "alert" : "status"}
      className={`mb-4 rounded-sm border px-4 py-2.5 text-meta ${variantClasses[variant]} ${className}`}
    >
      {children}
    </div>
  );
}
