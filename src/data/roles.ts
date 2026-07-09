import type { UserRole, UserStatus } from '../types'

export const ROLE_LABEL: Record<UserRole, { ta: string; en: string }> = {
  admin: { ta: 'நிர்வாகி', en: 'Admin' },
  assembly_poc: { ta: 'தொகுதி பொறுப்பாளர்', en: 'Assembly POC' },
  member: { ta: 'உறுப்பினர்', en: 'Member' },
}

export const STATUS_LABEL: Record<UserStatus, { ta: string; en: string }> = {
  pending: { ta: 'காத்திருக்கிறது', en: 'Pending' },
  approved: { ta: 'ஒப்புதல் பெற்றது', en: 'Approved' },
  rejected: { ta: 'நிராகரிக்கப்பட்டது', en: 'Rejected' },
}
