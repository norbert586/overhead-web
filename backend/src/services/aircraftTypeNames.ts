// ICAO type designator → a model name Wikipedia knows (directly or as a
// redirect). Only used for the last-resort "photo of the type" fallback, so
// a missing or imperfect entry just falls through to a search on the
// registry's manufacturer + model.
//
// Names are deliberately the everyday model name ("Boeing 737-800"), not the
// article title ("Boeing 737 Next Generation"): Wikipedia keeps redirects for
// model names, and they survive article renames.

export const TYPE_NAMES: Record<string, string> = {
  // Airbus
  A318: 'Airbus A318', A319: 'Airbus A319', A320: 'Airbus A320', A321: 'Airbus A321',
  A19N: 'Airbus A319neo', A20N: 'Airbus A320neo', A21N: 'Airbus A321neo',
  A306: 'Airbus A300', A30B: 'Airbus A300', A310: 'Airbus A310',
  A332: 'Airbus A330-200', A333: 'Airbus A330-300', A338: 'Airbus A330-800', A339: 'Airbus A330-900',
  A342: 'Airbus A340', A343: 'Airbus A340', A345: 'Airbus A340-500', A346: 'Airbus A340-600',
  A359: 'Airbus A350', A35K: 'Airbus A350-1000', A388: 'Airbus A380',
  BCS1: 'Airbus A220-100', BCS3: 'Airbus A220-300',
  A400: 'Airbus A400M Atlas',
  // Boeing
  B712: 'Boeing 717',
  B732: 'Boeing 737-200', B733: 'Boeing 737-300', B734: 'Boeing 737-400', B735: 'Boeing 737-500',
  B736: 'Boeing 737-600', B737: 'Boeing 737-700', B738: 'Boeing 737-800', B739: 'Boeing 737-900',
  B37M: 'Boeing 737 MAX 7', B38M: 'Boeing 737 MAX 8', B39M: 'Boeing 737 MAX 9', B3XM: 'Boeing 737 MAX 10',
  B742: 'Boeing 747-200', B744: 'Boeing 747-400', B748: 'Boeing 747-8', B74S: 'Boeing 747SP',
  B752: 'Boeing 757-200', B753: 'Boeing 757-300',
  B762: 'Boeing 767-200', B763: 'Boeing 767-300', B764: 'Boeing 767-400ER',
  B772: 'Boeing 777-200', B77L: 'Boeing 777-200LR', B773: 'Boeing 777-300', B77W: 'Boeing 777-300ER',
  B778: 'Boeing 777-8', B779: 'Boeing 777-9',
  B788: 'Boeing 787-8', B789: 'Boeing 787-9', B78X: 'Boeing 787-10',
  // McDonnell Douglas
  DC10: 'McDonnell Douglas DC-10', MD11: 'McDonnell Douglas MD-11',
  MD81: 'McDonnell Douglas MD-80', MD82: 'McDonnell Douglas MD-80', MD83: 'McDonnell Douglas MD-80',
  MD87: 'McDonnell Douglas MD-80', MD88: 'McDonnell Douglas MD-80', MD90: 'McDonnell Douglas MD-90',
  // Regional jets and turboprops
  E135: 'Embraer ERJ 135', E145: 'Embraer ERJ 145', E170: 'Embraer E170', E175: 'Embraer E175',
  E75L: 'Embraer E175', E75S: 'Embraer E175', E190: 'Embraer E190', E195: 'Embraer E195',
  E290: 'Embraer E190-E2', E295: 'Embraer E195-E2',
  CRJ1: 'Bombardier CRJ100', CRJ2: 'Bombardier CRJ200', CRJ7: 'Bombardier CRJ700',
  CRJ9: 'Bombardier CRJ900', CRJX: 'Bombardier CRJ1000',
  DH8A: 'De Havilland Canada Dash 8', DH8B: 'De Havilland Canada Dash 8', DH8C: 'De Havilland Canada Dash 8',
  DH8D: 'De Havilland Canada Dash 8-400',
  AT43: 'ATR 42', AT45: 'ATR 42', AT46: 'ATR 42', AT72: 'ATR 72', AT75: 'ATR 72', AT76: 'ATR 72',
  SF34: 'Saab 340', SB20: 'Saab 2000', B190: 'Beechcraft 1900', JS41: 'British Aerospace Jetstream 41',
  D328: 'Dornier 328', SU95: 'Sukhoi Superjet 100', C919: 'Comac C919',
  // Business jets
  C510: 'Cessna Citation Mustang', C525: 'Cessna CitationJet', C25A: 'Cessna CitationJet CJ2',
  C25B: 'Cessna CitationJet CJ3', C25C: 'Cessna CitationJet CJ4',
  C550: 'Cessna Citation II', C560: 'Cessna Citation V', C56X: 'Cessna Citation Excel',
  C680: 'Cessna Citation Sovereign', C68A: 'Cessna Citation Latitude', C700: 'Cessna Citation Longitude',
  C750: 'Cessna Citation X',
  CL30: 'Bombardier Challenger 300', CL35: 'Bombardier Challenger 350', CL60: 'Bombardier Challenger 600 series',
  GLEX: 'Bombardier Global Express', GL5T: 'Bombardier Global 5000', GL7T: 'Bombardier Global 7500',
  GLF4: 'Gulfstream IV', GLF5: 'Gulfstream V', GLF6: 'Gulfstream G650', G280: 'Gulfstream G280',
  E50P: 'Embraer Phenom 100', E55P: 'Embraer Phenom 300', E545: 'Embraer Legacy 450', E550: 'Embraer Legacy 500',
  E35L: 'Embraer Legacy 600',
  FA7X: 'Dassault Falcon 7X', FA8X: 'Dassault Falcon 8X', F2TH: 'Dassault Falcon 2000', F900: 'Dassault Falcon 900',
  LJ35: 'Learjet 35', LJ45: 'Learjet 45', LJ60: 'Learjet 60', LJ75: 'Learjet 75',
  H25B: 'Hawker 800', PC24: 'Pilatus PC-24', HDJT: 'HondaJet', SF50: 'Cirrus Vision SF50',
  // Turboprops and utility
  PC12: 'Pilatus PC-12', C208: 'Cessna 208 Caravan', BE20: 'Beechcraft Super King Air',
  B350: 'Beechcraft Super King Air', BE9L: 'Beechcraft King Air', BE99: 'Beechcraft Model 99',
  TBM7: 'Daher TBM', TBM8: 'Daher TBM', TBM9: 'Daher TBM', P180: 'Piaggio P.180 Avanti',
  DHC6: 'de Havilland Canada DHC-6 Twin Otter', DHC2: 'de Havilland Canada DHC-2 Beaver',
  KODI: 'Quest Kodiak', PC6T: 'Pilatus PC-6 Porter',
  // Piston general aviation
  C150: 'Cessna 150', C152: 'Cessna 152', C170: 'Cessna 170', C172: 'Cessna 172', C177: 'Cessna 177 Cardinal',
  C182: 'Cessna 182 Skylane', C206: 'Cessna 206', C210: 'Cessna 210 Centurion', C310: 'Cessna 310',
  C340: 'Cessna 340', C414: 'Cessna 414', C421: 'Cessna 421',
  P28A: 'Piper PA-28 Cherokee', P28B: 'Piper PA-28 Cherokee', P28R: 'Piper PA-28R Arrow',
  PA32: 'Piper PA-32 Cherokee Six', P32R: 'Piper PA-32R', PA34: 'Piper PA-34 Seneca',
  PA44: 'Piper PA-44 Seminole', PA46: 'Piper PA-46', PA31: 'Piper PA-31 Navajo', PA18: 'Piper PA-18 Super Cub',
  J3: 'Piper J-3 Cub',
  SR20: 'Cirrus SR20', SR22: 'Cirrus SR22', S22T: 'Cirrus SR22',
  BE33: 'Beechcraft Bonanza', BE35: 'Beechcraft Bonanza', BE36: 'Beechcraft Bonanza',
  BE55: 'Beechcraft Baron', BE58: 'Beechcraft Baron', BE76: 'Beechcraft Duchess',
  M20P: 'Mooney M20', M20T: 'Mooney M20',
  DA20: 'Diamond DA20', DA40: 'Diamond DA40 Diamond Star', DA42: 'Diamond DA42 Twin Star', DA62: 'Diamond DA62',
  RV7: "Van's Aircraft RV-7", RV8: "Van's Aircraft RV-8", RV10: "Van's Aircraft RV-10",
  // Helicopters
  R22: 'Robinson R22', R44: 'Robinson R44', R66: 'Robinson R66',
  B06: 'Bell 206', B407: 'Bell 407', B412: 'Bell 412', B429: 'Bell 429', B505: 'Bell 505 Jet Ranger X',
  EC30: 'Eurocopter EC130', EC35: 'Eurocopter EC135', EC45: 'Eurocopter EC145',
  AS50: 'Eurocopter AS350 Écureuil', AS65: 'Eurocopter AS365 Dauphin',
  A109: 'AgustaWestland AW109', A139: 'AgustaWestland AW139', A169: 'AgustaWestland AW169',
  S76: 'Sikorsky S-76', S92: 'Sikorsky S-92', H60: 'Sikorsky UH-60 Black Hawk', H500: 'MD Helicopters MD 500',
  // Military
  C17: 'Boeing C-17 Globemaster III', C130: 'Lockheed C-130 Hercules', C30J: 'Lockheed Martin C-130J Super Hercules',
  C5M: 'Lockheed C-5 Galaxy', K35R: 'Boeing KC-135 Stratotanker', E3TF: 'Boeing E-3 Sentry',
  P8: 'Boeing P-8 Poseidon', V22: 'Bell Boeing V-22 Osprey', B52: 'Boeing B-52 Stratofortress',
  F16: 'General Dynamics F-16 Fighting Falcon', F15: 'McDonnell Douglas F-15 Eagle',
  F35: 'Lockheed Martin F-35 Lightning II', A10: 'Fairchild Republic A-10 Thunderbolt II',
  T38: 'Northrop T-38 Talon', T6: 'Beechcraft T-6 Texan II',
};
