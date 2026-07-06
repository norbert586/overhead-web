// The Hangar roster: a curated field guide of ICAO aircraft types worth
// chasing. Caught types light up; the rest stay as ghosts. Types you catch
// that aren't on the roster still count — they show in "Off the chart".
//
// Codes are ICAO aircraft type designators as they appear in ADS-B data.

export interface RosterEntry {
  code: string;
  name: string;
}

export interface RosterSection {
  id: string;
  label: string;
  entries: RosterEntry[];
}

export const TYPE_ROSTER: RosterSection[] = [
  {
    id: 'airliners',
    label: 'Airliners',
    entries: [
      { code: 'A319', name: 'Airbus A319' },
      { code: 'A320', name: 'Airbus A320' },
      { code: 'A321', name: 'Airbus A321' },
      { code: 'A20N', name: 'Airbus A320neo' },
      { code: 'A21N', name: 'Airbus A321neo' },
      { code: 'A332', name: 'Airbus A330-200' },
      { code: 'A333', name: 'Airbus A330-300' },
      { code: 'A339', name: 'Airbus A330-900neo' },
      { code: 'A359', name: 'Airbus A350-900' },
      { code: 'A35K', name: 'Airbus A350-1000' },
      { code: 'A388', name: 'Airbus A380' },
      { code: 'B737', name: 'Boeing 737-700' },
      { code: 'B738', name: 'Boeing 737-800' },
      { code: 'B739', name: 'Boeing 737-900' },
      { code: 'B38M', name: 'Boeing 737 MAX 8' },
      { code: 'B39M', name: 'Boeing 737 MAX 9' },
      { code: 'B744', name: 'Boeing 747-400' },
      { code: 'B748', name: 'Boeing 747-8' },
      { code: 'B752', name: 'Boeing 757-200' },
      { code: 'B763', name: 'Boeing 767-300' },
      { code: 'B772', name: 'Boeing 777-200' },
      { code: 'B77L', name: 'Boeing 777-200LR' },
      { code: 'B77W', name: 'Boeing 777-300ER' },
      { code: 'B788', name: 'Boeing 787-8' },
      { code: 'B789', name: 'Boeing 787-9' },
      { code: 'B78X', name: 'Boeing 787-10' },
      { code: 'MD11', name: 'McDonnell Douglas MD-11' },
      { code: 'E170', name: 'Embraer E170' },
      { code: 'E75L', name: 'Embraer E175' },
      { code: 'E190', name: 'Embraer E190' },
      { code: 'E195', name: 'Embraer E195' },
      { code: 'CRJ2', name: 'Bombardier CRJ200' },
      { code: 'CRJ7', name: 'Bombardier CRJ700' },
      { code: 'CRJ9', name: 'Bombardier CRJ900' },
      { code: 'BCS3', name: 'Airbus A220-300' },
      { code: 'AT76', name: 'ATR 72-600' },
      { code: 'DH8D', name: 'Dash 8 Q400' },
    ],
  },
  {
    id: 'bizjets',
    label: 'Business Jets',
    entries: [
      { code: 'C25A', name: 'Citation CJ2' },
      { code: 'C25B', name: 'Citation CJ3' },
      { code: 'C560', name: 'Citation V' },
      { code: 'C56X', name: 'Citation Excel' },
      { code: 'C680', name: 'Citation Sovereign' },
      { code: 'C700', name: 'Citation Longitude' },
      { code: 'CL30', name: 'Challenger 300' },
      { code: 'CL35', name: 'Challenger 350' },
      { code: 'CL60', name: 'Challenger 600' },
      { code: 'GL5T', name: 'Global 5000' },
      { code: 'GLEX', name: 'Global Express' },
      { code: 'GLF4', name: 'Gulfstream IV' },
      { code: 'GLF5', name: 'Gulfstream V' },
      { code: 'GLF6', name: 'Gulfstream G650' },
      { code: 'E55P', name: 'Phenom 300' },
      { code: 'F2TH', name: 'Falcon 2000' },
      { code: 'FA7X', name: 'Falcon 7X' },
      { code: 'HDJT', name: 'HondaJet' },
      { code: 'LJ45', name: 'Learjet 45' },
      { code: 'LJ60', name: 'Learjet 60' },
      { code: 'PC24', name: 'Pilatus PC-24' },
    ],
  },
  {
    id: 'ga',
    label: 'General Aviation',
    entries: [
      { code: 'C152', name: 'Cessna 152' },
      { code: 'C172', name: 'Cessna 172 Skyhawk' },
      { code: 'C182', name: 'Cessna 182 Skylane' },
      { code: 'C208', name: 'Cessna 208 Caravan' },
      { code: 'C210', name: 'Cessna 210 Centurion' },
      { code: 'P28A', name: 'Piper Cherokee' },
      { code: 'PA34', name: 'Piper Seneca' },
      { code: 'PA46', name: 'Piper Malibu' },
      { code: 'SR20', name: 'Cirrus SR20' },
      { code: 'SR22', name: 'Cirrus SR22' },
      { code: 'DA40', name: 'Diamond DA40' },
      { code: 'DA42', name: 'Diamond DA42' },
      { code: 'BE36', name: 'Beechcraft Bonanza' },
      { code: 'BE58', name: 'Beechcraft Baron' },
      { code: 'B350', name: 'King Air 350' },
      { code: 'PC12', name: 'Pilatus PC-12' },
      { code: 'TBM9', name: 'TBM 900' },
      { code: 'M20P', name: 'Mooney M20' },
    ],
  },
  {
    id: 'military',
    label: 'Military',
    entries: [
      { code: 'C17',  name: 'C-17 Globemaster III' },
      { code: 'C130', name: 'C-130 Hercules' },
      { code: 'C30J', name: 'C-130J Super Hercules' },
      { code: 'C5M',  name: 'C-5M Super Galaxy' },
      { code: 'K35R', name: 'KC-135 Stratotanker' },
      { code: 'B52',  name: 'B-52 Stratofortress' },
      { code: 'B1',   name: 'B-1B Lancer' },
      { code: 'F16',  name: 'F-16 Fighting Falcon' },
      { code: 'F15',  name: 'F-15 Eagle' },
      { code: 'F35',  name: 'F-35 Lightning II' },
      { code: 'A10',  name: 'A-10 Thunderbolt II' },
      { code: 'T38',  name: 'T-38 Talon' },
      { code: 'P8',   name: 'P-8 Poseidon' },
      { code: 'V22',  name: 'V-22 Osprey' },
      { code: 'H60',  name: 'H-60 Black Hawk' },
      { code: 'H47',  name: 'CH-47 Chinook' },
    ],
  },
  {
    id: 'helicopters',
    label: 'Helicopters',
    entries: [
      { code: 'R44',  name: 'Robinson R44' },
      { code: 'R66',  name: 'Robinson R66' },
      { code: 'B06',  name: 'Bell 206 JetRanger' },
      { code: 'B407', name: 'Bell 407' },
      { code: 'B429', name: 'Bell 429' },
      { code: 'A109', name: 'AgustaWestland AW109' },
      { code: 'A139', name: 'AgustaWestland AW139' },
      { code: 'EC35', name: 'Airbus H135' },
      { code: 'EC45', name: 'Airbus H145' },
      { code: 'S76',  name: 'Sikorsky S-76' },
    ],
  },
];

export const ROSTER_SIZE = TYPE_ROSTER.reduce((n, s) => n + s.entries.length, 0);

const ROSTER_CODES = new Set(
  TYPE_ROSTER.flatMap((s) => s.entries.map((e) => e.code)),
);

export function isOnRoster(code: string): boolean {
  return ROSTER_CODES.has(code.toUpperCase());
}
