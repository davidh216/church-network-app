import { errorId } from '@/lib/forms/validate';

interface FieldErrorProps {
  /** The id of the control the message belongs to (see fieldA11y). */
  fieldId: string;
  message?: string;
}

/** A field's inline validation message, referenced by the control's aria-describedby. */
export default function FieldError({ fieldId, message }: FieldErrorProps) {
  if (!message) return null;
  return (
    <p id={errorId(fieldId)} className="mt-1 text-sm text-red-700">
      {message}
    </p>
  );
}
