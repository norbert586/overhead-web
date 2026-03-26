// Maps lowercase operator name fragments → IATA code
// Checked against free CDN: https://images.kiwi.com/airlines/64/{IATA}.png
const LOOKUP: [string, string][] = [
  // North America
  ['air canada',         'AC'],
  ['westjet',            'WS'],
  ['porter',             'PD'],
  ['air transat',        'TS'],
  ['sunwing',            'WG'],
  ['air north',          '4N'],
  ['united airlines',    'UA'],
  ['united',             'UA'],
  ['delta air lines',    'DL'],
  ['delta',              'DL'],
  ['american airlines',  'AA'],
  ['american',           'AA'],
  ['southwest',          'WN'],
  ['alaska airlines',    'AS'],
  ['alaska',             'AS'],
  ['jetblue',            'B6'],
  ['spirit',             'NK'],
  ['frontier',           'F9'],
  ['sun country',        'SY'],
  ['allegiant',          'G4'],
  ['hawaiian',           'HA'],
  // Cargo
  ['fedex',              'FX'],
  ['ups airlines',       '5X'],
  ['ups',                '5X'],
  ['amazon air',         'XQ'],
  ['atlas air',          '5Y'],
  ['polar air',          'PO'],
  ['kalitta',            'K4'],
  ['air cargo carriers', '2Q'],
  ['cargojet',           'W8'],
  // Europe
  ['air france',         'AF'],
  ['british airways',    'BA'],
  ['lufthansa',          'LH'],
  ['klm',                'KL'],
  ['ryanair',            'FR'],
  ['easyjet',            'U2'],
  ['iberia',             'IB'],
  ['alitalia',           'AZ'],
  ['tap',                'TP'],
  ['turkish airlines',   'TK'],
  ['swiss',              'LX'],
  ['austrian',           'OS'],
  ['scandinavian',       'SK'],
  ['finnair',            'AY'],
  ['norwegian',          'DY'],
  ['vueling',            'VY'],
  ['wizz',               'W6'],
  ['wizz air',           'W6'],
  // Middle East / Asia
  ['emirates',           'EK'],
  ['qatar airways',      'QR'],
  ['etihad',             'EY'],
  ['singapore airlines', 'SQ'],
  ['cathay pacific',     'CX'],
  ['ana ',               'NH'],
  ['japan airlines',     'JL'],
  ['korean air',         'KE'],
  ['air china',          'CA'],
  ['china southern',     'CZ'],
  ['china eastern',      'MU'],
  ['thai airways',       'TG'],
  ['indigo',             '6E'],
  ['air india',          'AI'],
  // Other
  ['qantas',             'QF'],
  ['air new zealand',    'NZ'],
  ['aeromexico',         'AM'],
  ['avianca',            'AV'],
  ['latam',              'LA'],
  ['copa',               'CM'],
];

export function getAirlineIata(operatorName: string): string | null {
  const lower = operatorName.toLowerCase();
  for (const [fragment, iata] of LOOKUP) {
    if (lower.includes(fragment)) return iata;
  }
  return null;
}

export function getAirlineLogoUrl(iata: string): string {
  return `https://images.kiwi.com/airlines/64/${iata}.png`;
}
