import {
  parseRegistrationOcrText,
  REGISTRATION_OCR_PROMPT,
  separatePrintedMakeModel,
} from './registration-ocr';

describe('printed registration labels', () => {
  it('reads Lebanese Arabic labels without using body type, engine number or zero weight', () => {
    const result = parseRegistrationOcrText(
      `الماركة: TOYOTA
تاريخ الصنع: 2019
طرازها: YARIS
نوعها: SEDAN
رقم المحرك: 1NR-1234567
رقم الهيكل: MR2K19F31K1234567
وزنها فارغة: 0
وزنها الإجمالي: 0`,
      1,
    );
    expect(result.fields.brand.value).toBe('TOYOTA');
    expect(result.fields.model.value).toBe('YARIS');
    expect(result.fields.vin.value).toBe('MR2K19F31K1234567');
    expect(result.fields.manufactureYear.value).toBe(2019);
    expect(result.fields.emptyWeightKg.value).toBeNull();
    expect(result.fields.swissRegistrationNumber.value).toBeNull();
  });
  it('validates positive mass with the Lebanese empty-weight label and a printed unit', () => {
    const result = parseRegistrationOcrText(
      'وزنها فارغة: 1100 كغ\nتاريخ الصنع: 2020',
      1,
    );
    expect(result.fields.emptyWeightKg.value).toBe(1100);
    expect(result.fields.manufactureYear.value).toBe(2020);
  });
  it('reads a VIN and empty weight exactly and keeps the combined make/type for catalog separation', () => {
    const result = parseRegistrationOcrText(
      `Make / model: Renault Kangoo Express
VIN: VF1FW0J0H12345678
Leergewicht: 1297 kg
Stammnummer: 654.321.987
Baujahr: 2017`,
      1,
    );
    expect(result.fields.vin.value).toBe('VF1FW0J0H12345678');
    expect(result.fields.brand.value).toBe('Renault Kangoo Express');
    expect(result.fields.model.value).toBe('Renault Kangoo Express');
    expect(result.fields.emptyWeightKg.value).toBe(1297);
    expect(result.fields.manufactureYear.value).toBe(2017);
    expect(result.fields.swissRegistrationNumber.value).toBe('654321987');
    expect(result.fields.emptyWeightKg.evidence[0]).toMatchObject({
      label: 'Leergewicht',
      printedValue: '1297',
      unit: 'kg',
    });
  });
  it('maps numbered French card fields and uses first registration for the form year', () => {
    const result = parseRegistrationOcrText(
      `21. Marque et type: RENAULT KANGOO EXPRESS
23. N° de châssis: VF1FW0J0H12345678
30. Poids à vide: 1'297 kg
33. Poids total: 2100 kg
36. Première mise en circulation: 15.05.2018`,
      1,
    );
    expect(result.fields.vin.value).toBe('VF1FW0J0H12345678');
    expect(result.fields.emptyWeightKg.value).toBe(1297);
    expect(result.fields.manufactureYear.value).toBe(2018);
  });
  it('supports labels followed by values on the next line and units beside the label', () => {
    const result = parseRegistrationOcrText(
      `Chassis-Nr.:
VF1FW0J0H12345678
Leergewicht (kg):
1297
Baujahr:
2017`,
      1,
    );
    expect(result.fields.vin.value).toBe('VF1FW0J0H12345678');
    expect(result.fields.emptyWeightKg.value).toBe(1297);
    expect(result.fields.manufactureYear.value).toBe(2017);
  });
  it('does not mistake translated labels for field values on multilingual cards', () => {
    const result = parseRegistrationOcrText(
      `Marke/Marque/Marca:
Renault
Modell/Modèle/Modello:
Kangoo Express
Leergewicht/Poids à vide/Peso a vuoto (kg):
1297`,
      1,
    );
    expect(result.fields.brand.value).toBe('Renault');
    expect(result.fields.model.value).toBe('Kangoo Express');
    expect(result.fields.emptyWeightKg.value).toBe(1297);
  });
  it('rejects conflicting numbers and never guesses ambiguous VIN characters', () => {
    const result = parseRegistrationOcrText(
      `VIN: VF1FW0J0H1234567?
Leergewicht: 1297 kg
Leergewicht: 1300 kg`,
      2,
    );
    expect(result.fields.vin.status).not.toBe('extracted');
    expect(result.fields.emptyWeightKg.value).toBeNull();
  });
  it('does not leak unrelated personal details and rejects unrelated text', () => {
    const result = parseRegistrationOcrText(
      'Owner: PRIVATE PERSON\nAddress: PRIVATE ADDRESS\nMake: Renault\nModel: Kangoo Express',
      1,
    );
    expect(JSON.stringify(result)).not.toContain('PRIVATE');
    expect(() => parseRegistrationOcrText('Unrelated text only', 1)).toThrow();
  });
  it('does not include example vehicle values that can be copied into the result', () => {
    expect(REGISTRATION_OCR_PROMPT).not.toContain('Ford');
    expect(REGISTRATION_OCR_PROMPT).not.toContain('1550');
    expect(REGISTRATION_OCR_PROMPT).not.toContain('2019');
  });
});

it.each([
  `21. Marke und Typ: Ford Transit Courier
23. Fahrgestell-Nr.: WF0WXXTACWKJ75955
30. Leergewicht: 1349 kg
36. 1. Inverkehrsetzung: 30.12.2019`,
  `21. Marque et type: Ford Transit Courier
23. N° de châssis: WF0WXXTACWKJ75955
30. Poids à vide: 1349 kg
36. Première mise en circulation: 30.12.2019`,
  `الماركة: Ford
الطراز: Transit Courier
رقم الهيكل: WF0WXXTACWKJ75955
الوزن الفارغ: ١٣٤٩ كغ
تاريخ التسجيل الأول: ٣٠.١٢.٢٠١٩`,
  `brand: Ford
model: Transit Courier
vin: WF0WXXTACWKJ75955
emptyWeightKg: 1349
manufactureYear: 30.12.2019`,
])(
  'extracts the reported vehicle from printed or canonical labels: %s',
  (content) => {
    const result = separatePrintedMakeModel(
      parseRegistrationOcrText(content, 1),
      [{ name: 'Ford' }],
    );
    expect(result.fields.brand.value).toBe('Ford');
    expect(result.fields.model.value).toBe('Transit Courier');
    expect(result.fields.vin.value).toBe('WF0WXXTACWKJ75955');
    expect(result.fields.emptyWeightKg.value).toBe(1349);
    expect(result.fields.manufactureYear.value).toBe(2019);
  },
);

it.each([
  'Baujahr: 2018\n1. Inverkehrsetzung: 30.12.2019',
  '1. Inverkehrsetzung: 30.12.2019\nBaujahr: 2018',
])(
  'prefers an explicit manufacture year regardless of field order',
  (content) => {
    expect(
      parseRegistrationOcrText(content, 1).fields.manufactureYear.value,
    ).toBe(2018);
  },
);

it('separates make and complete model before returning the API contract', () => {
  const result = separatePrintedMakeModel(
    parseRegistrationOcrText('Marque et type: FORD TRANSIT COURIER', 1),
    [{ name: 'Ford' }],
  );
  expect(result.fields.brand.value).toBe('Ford');
  expect(result.fields.model.value).toBe('TRANSIT COURIER');
  expect(result.fields.brand.evidence[0].printedValue).toBe(
    'FORD TRANSIT COURIER',
  );
  const multiWord = separatePrintedMakeModel(
    parseRegistrationOcrText('Marke und Typ: LAND ROVER FREELANDER', 1),
    [{ name: 'Land' }, { name: 'Land Rover' }],
  );
  expect(multiWord.fields.brand.value).toBe('Land Rover');
  expect(multiWord.fields.model.value).toBe('FREELANDER');
});

it('keeps adjacent multilingual rows separate, including the spaced VIN and padded weight in the selected photo', () => {
  const result = separatePrintedMakeModel(
    parseRegistrationOcrText(
      `D 21. Marke und Typ
Marque et type
Marca e tipo
Marca e tip
FORD Transit Courier
E 23. Fahrgestell-Nr.
Châssis no
Telaio n.
Schassis nr.
WF0 WXX TAC WKJ 759 55
25. Karosserie
Carrosserie
Carrozzeria
Carossaria
Fourgon
30. Leergewicht
Poids à vide
Peso a vuoto
Paisa da vid (kg)
**1394
36. 1. Inverkehrsetzung
1re mise en circulation
1a messa in circolazione
1. entrada en circulaziun
30.12.2019`,
      1,
    ),
    [{ name: 'Ford' }],
  );
  expect(result.fields).toMatchObject({
    brand: { value: 'Ford' },
    model: { value: 'Transit Courier' },
    vin: { value: 'WF0WXXTACWKJ75955' },
    emptyWeightKg: { value: 1394 },
    manufactureYear: { value: 2019 },
  });
  expect(result.fields).not.toHaveProperty('bodyType');
  expect(result.fields).not.toHaveProperty('transmission');
});
