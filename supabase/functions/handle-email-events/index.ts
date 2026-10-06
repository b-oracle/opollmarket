import { createEmailWebhookHandler } from 'npm:@lovable.dev/email-js@0.3.1'
import { createClient } from 'npm:@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

type Reason = 'bounce' | 'complaint' | 'unsubscribe'

const STATUS: Record<Reason, 'bounced' | 'complained' | 'suppressed'> = {
  bounce: 'bounced',
  complaint: 'complained',
  unsubscribe: 'suppressed',
}
const MESSAGE: Record<Reason, string> = {
  bounce: 'Permanent bounce — email address is invalid or rejected',
  complaint: 'Spam complaint — recipient marked email as spam',
  unsubscribe: 'Recipient unsubscribed',
}

// deno-lint-ignore no-explicit-any
async function record(event: any, reason: Reason) {
  const recipient = String(event?.data?.recipient ?? '').toLowerCase()
  if (!recipient) return

  const { error: supErr } = await supabase
    .from('suppressed_emails')
    .upsert({ email: recipient, reason, metadata: null }, { onConflict: 'email' })
  if (supErr) {
    console.error('suppressed_emails upsert failed', {
      code: supErr.code, message: supErr.message, event_id: event.event_id,
    })
    throw new Error('suppressed_emails upsert failed')
  }

  const { error: logErr } = await supabase.from('email_send_log').insert({
    message_id: null,
    template_name: 'system',
    recipient_email: recipient,
    status: STATUS[reason],
    error_message: MESSAGE[reason],
    metadata: null,
  })
  if (logErr) {
    console.error('email_send_log insert failed', {
      code: logErr.code, message: logErr.message, event_id: event.event_id,
    })
    throw new Error('email_send_log insert failed')
  }
}

const handler = createEmailWebhookHandler({
  apiKey: Deno.env.get('LOVABLE_API_KEY')!,
  on: {
    'email.bounced': (event) => record(event, 'bounce'),
    'email.complaint': (event) => record(event, 'complaint'),
    'email.unsubscribed': (event) => record(event, 'unsubscribe'),
  },
})

Deno.serve((req) => handler(req))
