import type { CSSProperties } from "react";
import "./filter-menu.css";

interface FilterOption<T extends string> {
  value: T;
  label: string;
  count: number;
}

/** Shared presentation for status filters, independent of account role. */
export function FilterMenu<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: FilterOption<T>[];
  onChange: (value: T) => void;
}) {
  return (
    <div
      className="filter-menu"
      role="group"
      aria-label={label}
      style={
        { "--filter-options": Math.max(1, options.length) } as CSSProperties
      }
    >
      {options.map((option) => (
        <button
          type="button"
          key={option.value}
          className={`filter-menu-option ${value === option.value ? "active" : ""}`}
          onClick={() => onChange(option.value)}
          aria-pressed={value === option.value}
        >
          <span className="filter-menu-label">{option.label}</span>
          <span>{option.count}</span>
        </button>
      ))}
    </div>
  );
}
