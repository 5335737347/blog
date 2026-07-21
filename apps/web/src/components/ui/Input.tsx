import type { InputHTMLAttributes } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export default function Input({
  label,
  error,
  className = "",
  id,
  ...props
}: InputProps) {
  const inputId = id || label?.toLowerCase().replace(/\s+/g, "-");
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label
          htmlFor={inputId}
          className="text-sm font-medium text-purple-800 dark:text-purple-200"
        >
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={`rounded-2xl border-2 border-pink-200 bg-white px-4 py-2.5 text-sm text-purple-950 placeholder-pink-300 focus:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-200 dark:border-purple-700 dark:bg-purple-950/50 dark:text-purple-100 dark:placeholder-purple-500 dark:focus:border-pink-400 dark:focus:ring-pink-900/30 transition-all ${error ? "border-red-400 focus:border-red-500 focus:ring-red-200" : ""} ${className}`}
        {...props}
      />
      {error && <p className="text-sm text-red-500 dark:text-red-400">{error}</p>}
    </div>
  );
}
