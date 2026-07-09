import { Link } from 'react-router-dom'
import PrintForm, { emptyBoothDetail } from '../components/PrintForm'
import { useT } from '../i18n'

/** Booth-independent blank paper form — print as many copies as needed. */
export default function BlankFormPage() {
  const t = useT()
  return (
    <div className="card" style={{ maxWidth: 800, margin: '0 auto' }}>
      <div className="toolbar no-print">
        <Link to="/">← {t('திரும்பு', 'Back')}</Link>
        <span className="grow" />
        <button className="btn" onClick={() => window.print()}>
          🖨️ {t('அச்சிடுக', 'Print')}
        </button>
      </div>
      <PrintForm assemblyName="" detail={emptyBoothDetail()} blank />
    </div>
  )
}
