import { useState } from 'react'
import { useT } from '../i18n'

/** Destructive-action gate: the button stays disabled until the user types `requiredText` exactly. */
export function DangerConfirm({
  requiredText,
  onConfirm,
  disabled,
  busy,
  label,
}: {
  requiredText: string
  onConfirm(): void
  disabled?: boolean
  busy?: boolean
  label: { ta: string; en: string }
}) {
  const t = useT()
  const [typed, setTyped] = useState('')
  const canConfirm = typed === requiredText && !disabled && !busy

  return (
    <div className="danger-confirm">
      <p className="hint">
        {t(`உறுதிப்படுத்த "${requiredText}" எனத் தட்டச்சு செய்யவும்:`, `Type "${requiredText}" to confirm:`)}
      </p>
      <div className="toolbar">
        <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={requiredText} />
        <button
          className="btn small danger"
          disabled={!canConfirm}
          onClick={() => {
            onConfirm()
            setTyped('')
          }}
        >
          {busy ? '…' : t(label.ta, label.en)}
        </button>
      </div>
    </div>
  )
}
