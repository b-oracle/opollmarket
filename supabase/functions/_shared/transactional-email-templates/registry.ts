/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'

export interface TemplateEntry {
  component: React.ComponentType<any>
  subject: string | ((data: Record<string, any>) => string)
  to?: string
  displayName?: string
  previewData?: Record<string, any>
}

import { template as marketWon } from './market-won.tsx'
import { template as marketLost } from './market-lost.tsx'
import { template as marketExpiredCreator } from './market-expired-creator.tsx'
import { template as depositCompleted } from './deposit-completed.tsx'
import { template as withdrawalCompleted } from './withdrawal-completed.tsx'

export const TEMPLATES: Record<string, TemplateEntry> = {
  'market-won': marketWon,
  'market-lost': marketLost,
  'market-expired-creator': marketExpiredCreator,
  'deposit-completed': depositCompleted,
  'withdrawal-completed': withdrawalCompleted,
}
