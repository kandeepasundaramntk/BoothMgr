import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import PrintForm from '../components/PrintForm'
import { getApi } from '../data/api'
import { useT } from '../i18n'

export default function BoothPrintPage() {
  const { boothId } = useParams<{ boothId: string }>()
  const t = useT()
  const [blank, setBlank] = useState(false)
  const detail = useQuery({
    queryKey: ['booth', boothId],
    queryFn: async () => (await getApi()).getBoothDetail(boothId!),
    enabled: Boolean(boothId),
  })
  const assemblies = useQuery({
    queryKey: ['assemblies'],
    queryFn: async () => (await getApi()).listAssemblies(),
  })

  if (detail.isLoading) return <div className="card">Loading…</div>
  if (detail.isError || !detail.data) return <div className="card error">{String(detail.error)}</div>

  const d = detail.data
  const assemblyName = assemblies.data?.find((a) => a.id === d.booth.assembly_id)?.name ?? ''

  return (
    <div className="card" style={{ maxWidth: 800, margin: '0 auto' }}>
      <div className="toolbar no-print">
        <Link to={`/booth/${boothId}`}>← {t('திரும்பு', 'Back')}</Link>
        <span className="grow" />
        <button className="btn small secondary" aria-pressed={blank} onClick={() => setBlank((v) => !v)}>
          {blank ? t('தரவுகளுடன் காட்டு', 'Show data') : t('வெற்றுப் படிவம்', 'Blank form')}
        </button>
        <button className="btn" onClick={() => window.print()}>
          🖨️ {t('அச்சிடுக', 'Print')}
        </button>
      </div>
      <PrintForm assemblyName={assemblyName} detail={d} blank={blank} />
    </div>
  )
}
