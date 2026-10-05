import type { InputHTMLAttributes } from 'react';
import { fieldA11y } from '@/lib/forms/validate';
import FieldError from './FieldError';

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'onChange'> {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** The field's inline validation message, if any. */
  error?: string;
}

const inputClass =
  'w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500';

/** A labelled text input with its inline error, tied together for assistive technology. */
export default function TextField({
  id,
  label,
  value,
  onChange,
  error,
  className = '',
  ...inputProps
}: TextFieldProps) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-1">
        {label}
      </label>
      <input
        {...inputProps}
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${inputClass} ${className}`}
        {...fieldA11y(id, error)}
      />
      <FieldError fieldId={id} message={error} />
    </div>
  );
}
