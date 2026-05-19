export const CAPABILITIES = [
  'worship_lead', 'vocal', 'drums', 'bass', 'guitar', 'keys',
  'sound', 'camera', 'projector',
] as const;
export type Capability = (typeof CAPABILITIES)[number];

export const ROTA_ROLES = CAPABILITIES;
export type RotaRole = Capability;

export const ROTA_ROLE_LABEL: Record<RotaRole, string> = {
  worship_lead: 'Worship lead',
  vocal:        'Vocal',
  drums:        'Drums',
  bass:         'Bass',
  guitar:       'Guitar',
  keys:         'Keys',
  sound:        'Sound',
  camera:       'Camera',
  projector:    'Projector',
};
