"use client";

import { useId, useState } from "react";

interface PasswordInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoComplete?: "current-password" | "new-password";
  required?: boolean;
  minLength?: number;
  className?: string;
  showLabel: string;
  hideLabel: string;
}

// One shared password field, used everywhere a password is typed (master
// login, admin login, admin's "create master" form) — a show/hide toggle so
// a password can be checked before submitting instead of only finding out
// it was mistyped after a 401. `showLabel`/`hideLabel` come from the caller
// rather than being hardcoded here, since the admin panel doesn't otherwise
// use the pl/ru/uk translation system (Этап 3) that the public/cabinet
// pages do — see web/app/admin/page.tsx.
export function PasswordInput({
  value,
  onChange,
  placeholder,
  autoComplete = "current-password",
  required,
  minLength,
  className,
  showLabel,
  hideLabel,
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  const inputId = useId();

  return (
    <div className="relative">
      <input
        id={inputId}
        type={visible ? "text" : "password"}
        required={required}
        minLength={minLength}
        autoComplete={autoComplete}
        placeholder={placeholder}
        className={className ?? "w-full rounded-lg border border-neutral-300 px-3 py-2 pr-10"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        // tabIndex -1 so Tab from the password field goes straight to the
        // submit button, not this toggle — it's a pointer-only convenience.
        tabIndex={-1}
        aria-label={visible ? hideLabel : showLabel}
        aria-controls={inputId}
        className="absolute inset-y-0 right-0 flex items-center px-3 text-current opacity-50 hover:opacity-90"
      >
        {visible ? <EyeOffIcon /> : <EyeIcon />}
      </button>
    </div>
  );
}

function EyeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 7 11 7a13.16 13.16 0 0 1-1.67 2.68M6.61 6.61C3.35 8.36 1 12 1 12s4 7 11 7a9.26 9.26 0 0 0 5.39-1.61" />
      <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
      <path d="M1 1l22 22" />
    </svg>
  );
}
