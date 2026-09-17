import type { TextareaHTMLAttributes } from "react";

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export default function Textarea({
  label,
  error,
  hint,
  className = "",
  id,
  ...props
}: TextareaProps) {
  const inputId = id || label?.toLowerCase().replace(/\s+/g, "-");
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="text-meta font-medium text-ink-2">
          {label}
        </label>
      )}
      <textarea
        id={inputId}
        aria-invalid={error ? true : undefined}
        className={`rounded-sm border bg-surface px-3 py-2 text-ui leading-relaxed text-ink transition-colors duration-150 placeholder:text-ink-3 focus:outline-none ${
          error ? "border-danger" : "border-line focus:border-accent"
        } ${className}`}
        {...props}
      />
      {hint && !error && <p className="text-micro text-ink-3">{hint}</p>}
      {error && <p className="text-micro text-danger">{error}</p>}
    </div>
  );
}
