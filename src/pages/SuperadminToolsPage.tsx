import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { Tabs, type TabDef } from '../components/Tabs'
import { L, useT } from '../i18n'
import ActivityLogTab from './superadmin/ActivityLogTab'
import BackupRestoreTab from './superadmin/BackupRestoreTab'
import ClearDataTab from './superadmin/ClearDataTab'
import ElectionsTab from './superadmin/ElectionsTab'
import UploadAssembliesTab from './superadmin/UploadAssembliesTab'
import UsersTab from './superadmin/UsersTab'

type SuperadminTab = 'users' | 'activity' | 'backup' | 'upload' | 'clear' | 'elections'

const TABS: TabDef<SuperadminTab>[] = [
  { key: 'users', ta: 'பயனர்கள்', en: 'Users' },
  { key: 'activity', ta: 'செயல்பாட்டுப் பதிவு', en: 'Activity Log' },
  { key: 'backup', ta: 'காப்பு / மீட்பு', en: 'Backup / Restore' },
  { key: 'upload', ta: 'தொகுதிகளை பதிவேற்று', en: 'Upload Assemblies' },
  { key: 'clear', ta: 'தரவை அழி', en: 'Clear Data' },
  { key: 'elections', ta: 'தேர்தல்கள்', en: 'Elections' },
]

export default function SuperadminToolsPage() {
  // Deliberately the real profile, not the effective (view-as) one — a
  // superadmin viewing-as a member must still be able to reach this page
  // to exit view-as or check the activity log.
  const { profile } = useAuth()
  const t = useT()
  const [tab, setTab] = useState<SuperadminTab>('users')

  if (profile?.role !== 'superadmin') return <Navigate to="/" replace />

  return (
    <div className="card">
      <div className="toolbar">
        <Link to="/">← {t('தொகுதிகள்', 'Assemblies')}</Link>
      </div>
      <h2 className="page-title">
        <L ta="மேலாண்மைக் கருவிகள்" en="Superadmin Tools" />
      </h2>
      <Tabs tabs={TABS} active={tab} onChange={setTab} />
      {tab === 'users' && <UsersTab />}
      {tab === 'activity' && <ActivityLogTab />}
      {tab === 'backup' && <BackupRestoreTab />}
      {tab === 'upload' && <UploadAssembliesTab />}
      {tab === 'clear' && <ClearDataTab />}
      {tab === 'elections' && <ElectionsTab />}
    </div>
  )
}
