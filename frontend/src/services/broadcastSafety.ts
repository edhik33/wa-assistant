import type { BroadcastSafetyForm } from '../types';

function localDateInput() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

export function defaultBroadcastSafetyForm(): BroadcastSafetyForm {
  return {
    consent_category: 'marketing',
    consent_source: '',
    consent_granted_at: localDateInput(),
    consent_note: '',
    consent_confirmed: false,
    risk_acknowledged: false,
    override_phrase: '',
    override_reason: '',
  };
}
