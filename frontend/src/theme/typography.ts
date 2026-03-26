// Overhead — Typography Tokens
// Based on section 2.2 of the design spec.

export const fonts = {
  mono:  "'JetBrains Mono', monospace",
  label: "'IBM Plex Mono', monospace",
} as const;

// Font-size scale (px values as strings for inline styles, or use directly)
export const fontSize = {
  appName:       '12px',
  callsign:      '44px',
  telemetryVal:  '22px',
  timesSeen:     '32px',
  iata:          '22px',
  statCardVal:   '13px',
  photoOverlayL: '13px',
  photoOverlayS: '11px',
  aircraftType:  '12px',
  sectionHeader: '9px',
  dataLabel:     '11px',
  dataValue:     '11px',
  statLabel:     '10px',
  badge:         '9px',
  menuItem:      '11px',
  scanStatus:    '10px',
  bottomBar:     '9px',
} as const;

export const fontWeight = {
  light:    300,
  regular:  400,
  medium:   500,
  semibold: 600,
  bold:     700,
} as const;

export const letterSpacing = {
  appName:      '3px',
  callsign:     '6px',
  telemetryVal: '0.5px',
  iata:         '3px',
  photoOverlayL:'2px',
  photoOverlayS:'1.5px',
  aircraftType: '2.5px',
  sectionHeader:'2px',
  badge:        '2px',
  menuItem:     '1.5px',
  scanStatus:   '1.5px',
  bottomBar:    '1px',
} as const;
