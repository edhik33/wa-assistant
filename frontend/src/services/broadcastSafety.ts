import type { BroadcastSafetyForm } from '../types';

export function defaultBroadcastSafetyForm(): BroadcastSafetyForm {
  return {
    consent_category: 'marketing',
    consent_confirmed: false,
    risk_acknowledged: false,
    override_phrase: '',
    override_reason: '',
  };
}
