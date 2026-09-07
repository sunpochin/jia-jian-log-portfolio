// Mother's BP has turned toward hypotension at night post-surgery-prep
// medication adjustment, so Caretaker may take separate evening checkpoints
// around 18:00 / 20:00 / 22:00 before discussing whether hospital escalation
// is needed. A single 'malam' bucket (17:00–04:59) used to lump all night
// readings together, so later checkpoints could inherit the first
// checkpoint's rest/done flow. These buckets identify the current time only;
// they are not a rule that every night must contain all three checks.
export type Session = 'pagi' | 'siang' | 'malam1' | 'malam2' | 'malam3'

// Pulled out of InputPage.tsx into its own module so it's unit-testable
// without mounting React or mocking Supabase.
export function getSession(h: number): Session {
  if (h >= 5  && h < 12) return 'pagi'
  if (h >= 12 && h < 17) return 'siang'
  if (h >= 17 && h < 19) return 'malam1'  // ~18:00 checkpoint
  if (h >= 19 && h < 21) return 'malam2'  // ~20:00 checkpoint
  return 'malam3'                          // ~22:00 checkpoint (also covers overnight/early-morning stragglers)
}
