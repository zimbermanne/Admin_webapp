import { useState } from 'react'

/**
 * Drop-in replacement for <input type="password">, with a show/hide eye
 * toggle so the user can double check what they typed. Accepts the same
 * props as a normal controlled input.
 */
export default function PasswordInput({ value, onChange, placeholder, required, autoFocus, autoComplete, id, name }) {
  const [visible, setVisible] = useState(false)

  return (
    <div className="password-input">
      <input
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        autoFocus={autoFocus}
        autoComplete={autoComplete}
        id={id}
        name={name}
      />
      <button
        type="button"
        className="password-input-toggle"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        tabIndex={-1}
      >
        {visible ? '🙈' : '👁'}
      </button>
    </div>
  )
}
