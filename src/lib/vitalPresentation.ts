/**
 * 血壓指標色只用來辨識「哪一種數值」，不承擔正常或危險的醫療判定；
 * 警示狀態仍必須由 blood-pressure-spec.json 的規則與 Badge 表達，避免正常高壓看起來像警報。
 */
export const VITAL_COLORS = {
  systolic: { light: '#C23B3B', dark: '#F87171' },
  diastolic: { light: '#2563EB', dark: '#60A5FA' },
  pulse: { light: '#7C3AED', dark: '#C084FC' },
} as const

export const VITAL_VALUE_CLASSES = {
  systolic: 'vital-systolic',
  diastolic: 'vital-diastolic',
  pulse: 'vital-pulse',
} as const
