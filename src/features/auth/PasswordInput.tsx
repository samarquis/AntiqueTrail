import { useRef, useState, type ChangeEvent, type ReactNode } from 'react'

export function PasswordInput({
  id,
  label,
  value,
  onChange,
  autoComplete,
  minLength,
  maxLength,
  ariaInvalid = false,
  describedBy,
  helpText,
  helpId,
  required = false,
}: {
  id: string
  label: string
  value: string
  onChange: (event: ChangeEvent<HTMLInputElement>) => void
  autoComplete: 'current-password' | 'new-password'
  minLength?: number
  maxLength?: number
  ariaInvalid?: boolean
  describedBy?: string
  helpText?: ReactNode
  helpId?: string
  required?: boolean
}) {
  const [visible, setVisible] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const describedByIds = [helpText && helpId, describedBy].filter(Boolean).join(' ') || undefined
  return (
    <>
      <label htmlFor={id}>{label}</label>
      <div className="password-input">
        <input
          ref={inputRef}
          id={id}
          type={visible ? 'text' : 'password'}
          autoComplete={autoComplete}
          minLength={minLength}
          maxLength={maxLength}
          value={value}
          onChange={onChange}
          aria-invalid={ariaInvalid}
          aria-describedby={describedByIds}
          required={required}
        />
        <button
          className="button button--secondary"
          type="button"
          aria-controls={id}
          aria-pressed={visible}
          onClick={() => {
            setVisible((current) => !current)
            inputRef.current?.focus()
          }}
        >
          {visible ? 'Hide password' : 'Show password'}
        </button>
      </div>
      {helpText && helpId && <p id={helpId}>{helpText}</p>}
    </>
  )
}
