// Overhead — Color Tokens
// Mirrors the CSS variables in App.css. Use CSS vars in styles;
// use these constants when color values are needed in TypeScript logic.

export const colors = {
  // Backgrounds
  bgPrimary:    '#070a10',
  bgCard:       '#0a0e16',
  bgElevated:   '#0d1219',
  border:       '#141c28',
  borderSubtle: '#101620',

  // Accent
  accent:       '#7eb8e0',
  accentDim:    'rgba(126,184,224,0.10)',
  accentMicro:  'rgba(126,184,224,0.04)',

  // Classification
  classification: {
    commercial:  '#5b9bd5',
    private:     '#9b7ec8',
    government:  '#d46b6b',
    cargo:       '#c4935a',
    military:    '#d46b6b',
    unknown:     '#5a6370',
  },

  // Text
  textPrimary:   '#c8d0da',
  textSecondary: '#586474',
  textDim:       '#2c3644',
  textGhost:     '#1a2230',
} as const;

export type ClassificationType = keyof typeof colors.classification;
