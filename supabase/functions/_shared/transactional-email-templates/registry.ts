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
import { template as supportTicketCreated } from './support-ticket-created.tsx'
import { template as supportTicketReply } from './support-ticket-reply.tsx'
import { template as supportTicketClosed } from './support-ticket-closed.tsx'

export const TEMPLATES: Record<string, TemplateEntry> = {
  'market-won': marketWon,
  'market-lost': marketLost,
  'market-expired-creator': marketExpiredCreator,
  'deposit-completed': depositCompleted,
  'withdrawal-completed': withdrawalCompleted,
  'support-ticket-created': supportTicketCreated,
  'support-ticket-reply': supportTicketReply,
  'support-ticket-closed': supportTicketClosed,
}
