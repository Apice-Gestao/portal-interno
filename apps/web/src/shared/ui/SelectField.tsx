import * as Select from "@radix-ui/react-select";
import { CheckIcon, ChevronDownIcon, ChevronUpIcon } from "../icons";
import {
  Children,
  Fragment,
  isValidElement,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import type {
  ComponentPropsWithoutRef,
  ReactNode,
  OptionHTMLAttributes,
} from "react";
import "./select-field.css";

export interface SelectOption {
  value: string;
  label: ReactNode;
  disabled?: boolean;
  textValue?: string;
}

export interface SelectFieldProps extends Omit<
  ComponentPropsWithoutRef<typeof Select.Trigger>,
  "children" | "value" | "defaultValue" | "onChange" | "name" | "form"
> {
  options?: SelectOption[];
  children?: ReactNode;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  name?: string;
  form?: string;
  required?: boolean;
  label?: string;
  placeholder?: string;
}

function textContent(node: ReactNode): string {
  return Children.toArray(node)
    .map((child) => {
      if (typeof child === "string" || typeof child === "number") {
        return String(child);
      }
      return isValidElement<{ children?: ReactNode }>(child)
        ? textContent(child.props.children)
        : "";
    })
    .join("");
}

function optionChildren(children: ReactNode): SelectOption[] {
  return Children.toArray(children).flatMap((child) => {
    if (!isValidElement<OptionHTMLAttributes<HTMLOptionElement>>(child)) {
      return [];
    }
    if (child.type === Fragment) return optionChildren(child.props.children);
    if (child.type !== "option") return [];
    const label = child.props.children;
    return [
      {
        value: String(child.props.value ?? textContent(label)),
        label,
        textValue: textContent(label),
        disabled: child.props.disabled,
      },
    ];
  });
}

/** Accessible dropdown with native form submission, validation and reset. */
export function SelectField({
  options,
  children,
  value,
  defaultValue,
  onValueChange,
  name,
  form,
  required,
  disabled,
  label,
  placeholder = "Selecione uma opção",
  id,
  className,
  "aria-describedby": describedBy,
  "aria-invalid": ariaInvalid,
  ...triggerProps
}: SelectFieldProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const choices = options ?? optionChildren(children);
  const initialValue = defaultValue ?? choices[0]?.value ?? "";
  const [localValue, setLocalValue] = useState(initialValue);
  const [invalid, setInvalid] = useState(false);
  const nativeRef = useRef<HTMLSelectElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const currentValue = value ?? localValue;
  const selectedIndex = choices.findIndex(
    (item) => item.value === currentValue,
  );
  const selected = choices[selectedIndex];
  const errorId = `${fieldId}-error`;

  useEffect(() => {
    const ownerForm = nativeRef.current?.form;
    if (!ownerForm) return;
    function reset() {
      if (value === undefined) setLocalValue(initialValue);
      setInvalid(false);
    }
    ownerForm.addEventListener("reset", reset);
    return () => ownerForm.removeEventListener("reset", reset);
  }, [initialValue, value]);

  function change(nextValue: string) {
    if (value === undefined) setLocalValue(nextValue);
    setInvalid(false);
    onValueChange?.(nextValue);
  }

  return (
    <span className="select-field">
      {label && (
        <label htmlFor={fieldId} className="select-field-label">
          {label}
        </label>
      )}
      <Select.Root
        value={selectedIndex < 0 ? "" : `option-${selectedIndex}`}
        onValueChange={(key) => {
          const next = choices[Number(key.slice("option-".length))];
          if (next) change(next.value);
        }}
        disabled={disabled}
      >
        <Select.Trigger
          {...triggerProps}
          ref={triggerRef}
          id={fieldId}
          type="button"
          className={`select-field-trigger ${className ?? ""}`}
          aria-required={required || undefined}
          aria-invalid={invalid || ariaInvalid}
          aria-describedby={
            [describedBy, invalid ? errorId : undefined]
              .filter(Boolean)
              .join(" ") || undefined
          }
        >
          <Select.Value placeholder={placeholder}>
            {selected?.label}
          </Select.Value>
          <Select.Icon className="select-field-icon">
            <ChevronDownIcon size={15} aria-hidden="true" />
          </Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Content
            className="select-field-content"
            position="popper"
            sideOffset={6}
            collisionPadding={12}
          >
            <Select.ScrollUpButton className="select-field-scroll">
              <ChevronUpIcon size={16} aria-hidden="true" />
            </Select.ScrollUpButton>
            <Select.Viewport className="select-field-options">
              {choices.map((option, index) => (
                <Select.Item
                  key={option.value}
                  value={`option-${index}`}
                  disabled={option.disabled}
                  textValue={option.textValue ?? textContent(option.label)}
                  className="select-field-option"
                >
                  <Select.ItemText>{option.label}</Select.ItemText>
                  <Select.ItemIndicator className="select-field-check">
                    <CheckIcon size={15} aria-hidden="true" />
                  </Select.ItemIndicator>
                </Select.Item>
              ))}
            </Select.Viewport>
            <Select.ScrollDownButton className="select-field-scroll">
              <ChevronDownIcon size={16} aria-hidden="true" />
            </Select.ScrollDownButton>
          </Select.Content>
        </Select.Portal>
      </Select.Root>
      {/* Original values stay in the form; Radix's internal keys never leave the UI. */}
      <select
        ref={nativeRef}
        className="select-field-native"
        aria-hidden="true"
        tabIndex={-1}
        name={name}
        form={form}
        required={required}
        disabled={disabled}
        value={currentValue}
        onChange={(event) => change(event.target.value)}
        onInvalid={(event) => {
          event.preventDefault();
          setInvalid(true);
          const firstInvalid = event.currentTarget.form?.querySelector(
            "input:invalid, select:invalid, textarea:invalid",
          );
          if (!firstInvalid || firstInvalid === event.currentTarget) {
            triggerRef.current?.focus();
          }
        }}
      >
        {choices.map((option) => (
          <option
            key={option.value}
            value={option.value}
            disabled={option.disabled}
          >
            {option.textValue ?? textContent(option.label)}
          </option>
        ))}
      </select>
      {invalid && (
        <span id={errorId} className="select-field-error" role="alert">
          Selecione uma opção.
        </span>
      )}
    </span>
  );
}
