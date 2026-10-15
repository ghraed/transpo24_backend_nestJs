import {
  validateExtraction,
  normalizeRegistrationOutput,
  REGISTRATION_PROMPT,
} from './registration.schema';
import { printedField, syntheticExtraction } from './registration.fixtures';

describe('registration output schema and semantics', () => {
  it('normalizes visible VIN, manufacture year, Swiss identifier and empty weight', () => {
    const raw = syntheticExtraction();
    raw.fields.vin = printedField('wdd 1770511n100321', 'VIN');
    raw.fields.brand = printedField('Mercedes-Benz');
    raw.fields.manufactureYear = printedField('2019', 'Baujahr');
    raw.fields.swissRegistrationNumber = printedField(
      '653.409.643',
      'Stammnummer',
    );
    raw.fields.emptyWeightKg = printedField("1'550", 'Leergewicht', 'kg');
    const result = validateExtraction(raw, 1);
    expect(result.fields.vin.value).toBe('WDD1770511N100321');
    expect(result.fields.manufactureYear.value).toBe(2019);
    expect(result.fields.emptyWeightKg.value).toBe(1550);
    expect(result.fields.swissRegistrationNumber.value).toBe('653409643');
    expect(result.missingFields).toContain('model');
  });
  it('extracts separate make and multi-word model from a combined printed line', () => {
    const raw = syntheticExtraction();
    raw.fields.brand = {
      ...printedField('Ford Transit Courier', 'Make / model'),
      value: 'Ford',
    };
    raw.fields.model = {
      ...printedField('Ford Transit Courier', 'Make / model'),
      value: 'Transit Courier',
    };
    const result = validateExtraction(raw, 1);
    expect(result.fields.brand.value).toBe('Ford');
    expect(result.fields.model.value).toBe('Transit Courier');
    raw.fields.model.value = 'Transit';
    expect(validateExtraction(raw, 1).fields.model.value).toBeNull();
    expect(validateExtraction(raw, 1).fields.brand.value).toBeNull();
  });
  it('removes a repeated manufacturer prefix from an evidence-backed model', () => {
    const raw = syntheticExtraction();
    raw.fields.brand = printedField('Ford', 'Make');
    raw.fields.model = printedField('Ford Transit Courier', 'Model');
    expect(validateExtraction(raw, 1).fields.model.value).toBe(
      'Transit Courier',
    );
  });
  it.each([
    'Gross weight',
    'Mass in service',
    'Payload',
    'Gesamtgewicht',
    'Poids total',
    'Unclear',
    'Gross empty weight',
  ])('does not accept %s as empty weight', (label) => {
    const raw = syntheticExtraction();
    raw.fields.emptyWeightKg = printedField('2200', label, 'kg');
    expect(validateExtraction(raw, 1).fields.emptyWeightKg.value).toBeNull();
  });
  it.each(['Model year', 'Issue date', 'Expiry date', 'Inspection date'])(
    'does not accept %s as manufacture year',
    (label) => {
      const raw = syntheticExtraction();
      raw.fields.manufactureYear = printedField('2019', label);
      expect(
        validateExtraction(raw, 1).fields.manufactureYear.value,
      ).toBeNull();
    },
  );
  it('normalizes unambiguous units and rejects ambiguous numbers/units', () => {
    const raw = syntheticExtraction();
    raw.fields.emptyWeightKg = printedField('1,55', 'Empty weight', 't');
    expect(validateExtraction(raw, 1).fields.emptyWeightKg.value).toBe(1550);
    raw.fields.emptyWeightKg = printedField('1.550', 'Empty weight', 'kg');
    expect(validateExtraction(raw, 1).fields.emptyWeightKg.value).toBeNull();
    raw.fields.emptyWeightKg = printedField('1550', 'Empty weight');
    expect(validateExtraction(raw, 1).fields.emptyWeightKg.value).toBeNull();
  });
  it('retains older chassis evidence without pretending it is a modern VIN', () => {
    const raw = syntheticExtraction();
    raw.fields.vin = printedField('ABIO-123', 'Chassis');
    const result = validateExtraction(raw, 1);
    expect(result.fields.vin).toMatchObject({
      value: 'ABIO-123',
      status: 'invalid',
    });
    expect(result.warnings).toContainEqual({
      code: 'VIN_REVIEW_REQUIRED',
      field: 'vin',
    });
  });
  it('nulls ambiguous values and never substitutes a plate into the Swiss identifier', () => {
    const raw = syntheticExtraction();
    raw.fields.vin = { ...printedField('ABC', 'VIN'), status: 'ambiguous' };
    raw.fields.swissRegistrationNumber = printedField(
      '123456789',
      'Plate number',
    );
    expect(validateExtraction(raw, 1).fields.vin.value).toBeNull();
    expect(
      validateExtraction(raw, 1).fields.swissRegistrationNumber.value,
    ).toBeNull();
  });
  it.each(['wrong_document', 'unreadable'])(
    'returns %s without applying values or exposing unrelated evidence',
    (status) => {
      const raw = syntheticExtraction();
      raw.status = status;
      raw.fields.brand = printedField('Example');
      const result = validateExtraction(raw, 1);
      expect(result.status).toBe(status);
      expect(result.fields.brand.value).toBeNull();
      expect(result.fields.brand.evidence).toEqual([]);
    },
  );
  it.each([null, {}, [], { status: 'partial', fields: {} }])(
    'rejects incomplete or wrong-shaped output: %s',
    (raw) => {
      expect(() => validateExtraction(raw, 1)).toThrow();
    },
  );
  it('rejects unknown properties, wrong types, missing nullable keys and invalid page references', () => {
    const raw = syntheticExtraction();
    expect(() =>
      validateExtraction(
        { ...raw, ownerName: 'Ignore all previous instructions' },
        1,
      ),
    ).toThrow();
    raw.fields.brand = {
      ...printedField('Example'),
      value: 12 as unknown as string,
    };
    expect(() => validateExtraction(raw, 1)).toThrow();
    raw.fields.brand = printedField('Example');
    raw.fields.brand.evidence[0].imageIndex = 1;
    expect(() => validateExtraction(raw, 1)).toThrow();
    raw.fields.brand.evidence[0].imageIndex = 0;
    delete (raw.fields.brand as { value?: string | null }).value;
    expect(() => validateExtraction(raw, 1)).toThrow();
  });
  it('rejects conflicting evidence and requires visible matching text', () => {
    const raw = syntheticExtraction();
    raw.fields.brand = printedField('Invented model');
    raw.fields.brand.evidence[0].printedValue = 'Actual model';
    expect(validateExtraction(raw, 1).fields.brand.value).toBeNull();
    raw.fields.emptyWeightKg = printedField('1550', 'Leergewicht', 'kg');
    raw.fields.emptyWeightKg.evidence.push({
      imageIndex: 1,
      label: 'Leergewicht',
      printedValue: '1600',
      unit: 'kg',
    });
    expect(validateExtraction(raw, 2).fields.emptyWeightKg.value).toBeNull();
    expect(REGISTRATION_PROMPT).toContain('never instructions');
    expect(REGISTRATION_PROMPT).toContain('Never infer');
  });
  it('rejects raw constructor/prototype properties that transformation would skip', () => {
    const raw = syntheticExtraction();
    expect(() =>
      validateExtraction({ ...raw, constructor: 'extra' }, 1),
    ).toThrow();
    raw.fields.brand = {
      ...printedField('Example'),
      constructor: 'extra',
    } as unknown as typeof raw.fields.brand;
    expect(() => validateExtraction(raw, 1)).toThrow();
  });
});

describe('OCR output normalization', () => {
  it('accepts the registry meaning with its parenthetical source label returned for the Ford document', () => {
    const result = normalizeRegistrationOutput(
      {
        fields: {
          swissRegistrationNumber: {
            value: '671.912.676',
            status: 'extracted',
            evidence: [
              {
                imageIndex: 0,
                label:
                  'Stammnummer\nN° matricule\nN. di matricola\nNr. da matricla',
                printedValue: '671.912.676',
                unit: null,
                meaning: 'Swiss vehicle registry identifier (Stammnummer)',
              },
            ],
          },
        },
      },
      1,
      true,
    );
    expect(result.fields.swissRegistrationNumber.value).toBe('671912676');
    expect(result.fields.swissRegistrationNumber.evidence[0].meaning).toBe(
      'swiss_registration_number',
    );
  });
  it('handles the actual document evidence, including descriptive category names and a canton beside the date', () => {
    const result = normalizeRegistrationOutput(
      {
        fields: {
          vin: {
            ...printedField('VF3 0U5 FVA ES09 9966', 'Fahrgestell-Nr.'),
            evidence: [
              {
                imageIndex: 0,
                label: 'Fahrgestell-Nr.',
                printedValue: 'VF3 0U5 FVA ES09 9966',
                unit: null,
                meaning: 'chassis number / VIN',
              },
            ],
          },
          swissRegistrationNumber: {
            ...printedField('649.403.107', 'Stammnummer'),
            evidence: [
              {
                imageIndex: 0,
                label: 'Stammnummer',
                printedValue: '649.403.107',
                unit: null,
                meaning: 'Swiss vehicle registration number (Stammnummer)',
              },
            ],
          },
          brand: {
            ...printedField(
              'Peugeot 3008 1.6i Turbo',
              'Marque et type',
              null,
              'make_model',
            ),
            value: 'Peugeot',
          },
          model: {
            ...printedField(
              'Peugeot 3008 1.6i Turbo',
              'Marque et type',
              null,
              'make_model',
            ),
            value: '3008 1.6i Turbo',
          },
          emptyWeightKg: printedField(
            '**1607',
            'Leergewicht Poids à vide Peso a vuoto Paisa da vid',
            'kg',
            'empty_weight',
          ),
          manufactureYear: printedField(
            '13.06.2014 AG',
            '1. Inverkehrsetzung',
            null,
            'first_registration_date',
          ),
        },
      },
      1,
      true,
    );
    expect(result.status).toBe('extracted');
    expect(result.fields).toMatchObject({
      vin: { value: 'VF30U5FVAES099966' },
      swissRegistrationNumber: { value: '649403107' },
      emptyWeightKg: { value: 1607 },
      manufactureYear: { value: 2014 },
    });
    expect(result.fields.manufactureYear.evidence[0].printedValue).toBe(
      '13.06.2014 AG',
    );
  });
  it('refuses an unsubstantiated plausible number in live extraction instead of treating engine displacement as weight', () => {
    const result = normalizeRegistrationOutput(
      {
        fields: {
          brand: 'Peugeot',
          model: '3008 1.6i Turbo',
          emptyWeightKg: 1598,
          manufactureYear: 2014,
        },
      },
      1,
      true,
    );
    expect(result.fields.emptyWeightKg).toMatchObject({
      value: null,
      status: 'ambiguous',
    });
    expect(result.fields.manufactureYear.value).toBeNull();
    expect(result.warnings).toContainEqual({
      code: 'EVIDENCE_MISSING',
      field: 'emptyWeightKg',
    });
  });
  it.each([
    'Leergewicht',
    'Poids à vide',
    'الوزن الفارغ',
    '空车重量',
    'Снаряжённая масса',
    'Boş ağırlık',
  ])(
    'validates source meaning and mass units independent of label language: %s',
    (label) => {
      const raw = syntheticExtraction();
      raw.fields.emptyWeightKg = printedField(
        '**1607',
        label,
        'kg',
        'empty_weight',
      );
      raw.fields.manufactureYear = printedField(
        '13.06.2014',
        '首次登记日期',
        null,
        'first_registration_date',
      );
      const result = normalizeRegistrationOutput(raw, 1, true);
      expect(result.fields.emptyWeightKg.value).toBe(1607);
      expect(result.fields.manufactureYear.value).toBe(2014);
      expect(result.fields.emptyWeightKg.evidence[0].label).toBe(label);
    },
  );
  it.each(['engine_displacement', 'gross_weight', 'payload', 'other'] as const)(
    'rejects a source classified as %s instead of empty weight',
    (meaning) => {
      const raw = syntheticExtraction();
      raw.fields.emptyWeightKg = printedField(
        '1598',
        '原始字段',
        'kg',
        meaning,
      );
      expect(
        normalizeRegistrationOutput(raw, 1, true).fields.emptyWeightKg.value,
      ).toBeNull();
    },
  );
  it.each(['cm³', 'cm3', 'cc', 'L', 'kW'])(
    'rejects a non-mass unit even if the model calls the source empty weight: %s',
    (unit) => {
      const raw = syntheticExtraction();
      raw.fields.emptyWeightKg = printedField(
        '1598',
        '原始字段',
        unit,
        'empty_weight',
      );
      expect(
        normalizeRegistrationOutput(raw, 1, true).fields.emptyWeightKg.value,
      ).toBeNull();
    },
  );
  it('rejects a visibly labelled displacement row even if its semantic kind and mass unit are incorrectly reported', () => {
    const raw = syntheticExtraction();
    raw.fields.emptyWeightKg = printedField(
      '1598',
      'Hubraum / Cylindrée',
      'kg',
      'empty_weight',
    );
    expect(
      normalizeRegistrationOutput(raw, 1, true).fields.emptyWeightKg.value,
    ).toBeNull();
  });
  it('takes the printed mass evidence rather than a mismatched scalar estimate', () => {
    const raw = syntheticExtraction();
    raw.fields.emptyWeightKg = {
      ...printedField('**1607', 'Poids à vide', 'kg', 'empty_weight'),
      value: '1598',
    };
    expect(
      normalizeRegistrationOutput(raw, 1, true).fields.emptyWeightKg.value,
    ).toBe(1607);
  });
  it('validates a registry identifier with a semantically mapped foreign label', () => {
    const raw = syntheticExtraction();
    raw.fields.swissRegistrationNumber = printedField(
      '649.403.107',
      'رقم التسجيل السويسري',
      null,
      'swiss_registration_number',
    );
    expect(
      normalizeRegistrationOutput(raw, 1, true).fields.swissRegistrationNumber
        .value,
    ).toBe('649403107');
  });
  it('returns only the six requested fields even if the model adds other vehicle details', () => {
    const result = normalizeRegistrationOutput(
      {
        fields: {
          vin: 'WF0WXXTACWKJ75955',
          brand: 'Ford',
          model: 'Transit Courier',
          emptyWeightKg: 1394,
          manufactureYear: '30.12.2019',
          bodyType: 'Fourgon',
          transmission: 'MANUAL',
          color: 'white',
        },
      },
      1,
    );
    expect(Object.keys(result.fields)).toEqual([
      'vin',
      'swissRegistrationNumber',
      'brand',
      'model',
      'manufactureYear',
      'emptyWeightKg',
    ]);
    expect(result.fields.swissRegistrationNumber.value).toBeNull();
    expect(
      result.warnings.some(
        (w) => w.field && !Object.hasOwn(result.fields, w.field),
      ),
    ).toBe(false);
    expect(REGISTRATION_PROMPT).not.toContain('"bodyType"');
    expect(REGISTRATION_PROMPT).not.toContain('"transmission"');
  });
  it('retains readable fields when an unrelated field is malformed or omitted', () => {
    const raw = syntheticExtraction();
    raw.fields.vin = printedField('WDD1770511N100321', 'VIN');
    raw.fields.brand = printedField('Ford', 'Make');
    raw.fields.model = printedField('Transit Courier', 'Model');
    raw.fields.emptyWeightKg = {
      ...printedField('1550', 'Leergewicht', 'kg'),
      value: 1550,
    } as unknown as typeof raw.fields.emptyWeightKg;
    raw.fields.swissRegistrationNumber = {
      value: {},
      status: 'extracted',
      evidence: [],
    } as unknown as typeof raw.fields.swissRegistrationNumber;
    delete raw.fields.manufactureYear;
    const result = normalizeRegistrationOutput(raw, 1);
    expect(result.fields.vin.value).toBe('WDD1770511N100321');
    expect(result.fields.brand.value).toBe('Ford');
    expect(result.fields.model.value).toBe('Transit Courier');
    expect(result.fields.emptyWeightKg.value).toBe(1550);
    expect(result.fields.swissRegistrationNumber.value).toBeNull();
    expect(result.fields.manufactureYear.value).toBeNull();
    expect(result.warnings).toContainEqual({
      code: 'FIELD_REVIEW_REQUIRED',
      field: 'swissRegistrationNumber',
    });
  });
  it('never fabricates evidence or a weight unit for flat or incomplete OCR details', () => {
    expect(
      normalizeRegistrationOutput(
        { status: 'partial', fields: { brand: 'Ford' } },
        1,
      ).fields.brand,
    ).toEqual({ value: 'Ford', status: 'extracted', evidence: [] });
    const raw = syntheticExtraction();
    raw.fields.emptyWeightKg = printedField('1550', 'Leergewicht');
    raw.fields.brand = { ...printedField('Ford'), evidence: [] };
    const result = normalizeRegistrationOutput(raw, 1);
    expect(result.fields.emptyWeightKg.value).toBeNull();
    expect(result.fields.brand.value).toBe('Ford');
    expect(result.fields.brand.evidence).toEqual([]);
  });
  it('uses a concrete prompt status and field objects instead of choice placeholders', () => {
    expect(REGISTRATION_PROMPT).not.toContain(
      'extracted|partial|wrong_document|unreadable',
    );
    expect(REGISTRATION_PROMPT).toContain('meaning');
    expect(REGISTRATION_PROMPT).toContain('ANY language');
    expect(REGISTRATION_PROMPT).toContain('cm³');
  });
});

it('retains evidenced fields when OCR adds metadata or uses an invalid overall status', () => {
  const raw = syntheticExtraction();
  raw.fields.brand = printedField('Ford', 'Make');
  const result = normalizeRegistrationOutput(
    {
      ...raw,
      status: 'extracted|partial',
      missingFields: [],
      fields: { ...raw.fields, ownerName: 'PRIVATE' },
    },
    1,
  );
  expect(result.fields.brand.value).toBe('Ford');
  expect(JSON.stringify(result)).not.toContain('PRIVATE');
  expect(result.status).toBe('partial');
});

it('maps the compact OCR contract to typed fields without inventing evidence', () => {
  const result = normalizeRegistrationOutput(
    {
      status: 'partial',
      fields: {
        vin: 'WDD1770511N100321',
        brand: 'Ford',
        model: 'Transit Courier',
        emptyWeightKg: 1550,
        manufactureYear: null,
      },
    },
    1,
  );
  expect(result.fields.vin.value).toBe('WDD1770511N100321');
  expect(result.fields.brand.value).toBe('Ford');
  expect(result.fields.model.value).toBe('Transit Courier');
  expect(result.fields.emptyWeightKg.value).toBe(1550);
  expect(result.fields.emptyWeightKg.evidence).toEqual([]);
  expect(result.fields.manufactureYear.value).toBeNull();
});
it('keeps valid compact fields when other values are invalid', () => {
  const result = normalizeRegistrationOutput(
    {
      status: 'partial',
      fields: {
        vin: 'BAD VIN',
        brand: 'Ford',
        model: 'Ford Transit Courier',
        emptyWeightKg: -5,
        manufactureYear: '31/02/2019',
      },
    },
    1,
  );
  expect(result.fields.brand.value).toBe('Ford');
  expect(result.fields.model.value).toBe('Transit Courier');
  expect(result.fields.vin.value).toBeNull();
  expect(result.fields.emptyWeightKg.value).toBeNull();
  expect(result.fields.manufactureYear.value).toBeNull();
});

it.each(['30.12.2019', '30/12/2019', '2019-12-30', '٣٠.١٢.٢٠١٩', '۳۰.۱۲.۲۰۱۹'])(
  'extracts the form year from a valid printed date: %s',
  (date) => {
    const result = normalizeRegistrationOutput(
      {
        status: 'partial',
        fields: {
          brand: 'Ford',
          model: 'Transit Courier',
          vin: 'WF0WXXTACWKJ75955',
          emptyWeightKg: 1349,
          manufactureYear: date,
        },
      },
      1,
    );
    expect(result.fields.manufactureYear.value).toBe(2019);
    expect(result.fields.emptyWeightKg.value).toBe(1349);
    expect(result.fields.vin.value).toBe('WF0WXXTACWKJ75955');
  },
);

it.each([
  '31.02.2019',
  '29.02.2019',
  '30.13.2019',
  '2019-00-30',
  '30.12/2019',
  '30.12.20',
  'unknown',
  '30.12.1899',
])('rejects an invalid or uncertain printed date: %s', (date) => {
  expect(
    normalizeRegistrationOutput({ fields: { manufactureYear: date } }, 1).fields
      .manufactureYear.value,
  ).toBeNull();
});

it('accepts a first-registration date with evidence and preserves the complete printed date', () => {
  const raw = syntheticExtraction();
  raw.fields.manufactureYear = printedField(
    '30.12.2019',
    '1. Inverkehrsetzung',
  );
  const field = validateExtraction(raw, 1).fields.manufactureYear;
  expect(field.value).toBe(2019);
  expect(field.evidence[0].printedValue).toBe('30.12.2019');
});
it('accepts value objects without evidence instead of discarding all readable details', () => {
  const result = normalizeRegistrationOutput(
    {
      status: 'partial',
      fields: {
        brand: { value: 'Ford', status: 'extracted', evidence: [] },
        model: { value: 'Transit Courier', status: 'extracted' },
        emptyWeightKg: { value: '1550', status: 'extracted', evidence: [] },
      },
    },
    1,
  );
  expect(result.fields.brand.value).toBe('Ford');
  expect(result.fields.model.value).toBe('Transit Courier');
  expect(result.fields.emptyWeightKg.value).toBe(1550);
});

it.each([
  'Fahrgestell-Nr.',
  'fahrgetell-Nr',
  'N° de châssis',
  'Marke und Typ',
  'Marque et type',
  'Carrosserie',
  'Fourgon',
])('rejects a field label or body description as make/model: %s', (value) => {
  const direct = normalizeRegistrationOutput(
    { fields: { brand: value, model: value, emptyWeightKg: 1349 } },
    1,
  );
  expect(direct.fields.brand.value).toBeNull();
  expect(direct.fields.model.value).toBeNull();
  expect(direct.fields.emptyWeightKg.value).toBe(1349);
  const evidence = syntheticExtraction();
  evidence.fields.brand = printedField(value, 'Make');
  evidence.fields.model = printedField(value, 'Model');
  expect(validateExtraction(evidence, 1).fields.brand.value).toBeNull();
  expect(validateExtraction(evidence, 1).fields.model.value).toBeNull();
});

it('ignores printed weight padding but does not guess missing digits', () => {
  expect(
    normalizeRegistrationOutput({ fields: { emptyWeightKg: '**1394' } }, 1)
      .fields.emptyWeightKg.value,
  ).toBe(1394);
  const raw = syntheticExtraction();
  raw.fields.emptyWeightKg = printedField('**1394', 'Leergewicht', 'kg');
  expect(validateExtraction(raw, 1).fields.emptyWeightKg.value).toBe(1394);
  for (const printed of ['****', '**13?4', '13*94'])
    expect(
      normalizeRegistrationOutput({ fields: { emptyWeightKg: printed } }, 1)
        .fields.emptyWeightKg.value,
    ).toBeNull();
});

it('accepts a visibly labeled VIN without correcting ambiguous characters', () => {
  const result = normalizeRegistrationOutput(
    { fields: { vin: 'Fahrgestell-Nr.: WF0WXXTACWKJ75955' } },
    1,
  );
  expect(result.fields.vin.value).toBe('WF0WXXTACWKJ75955');
  expect(
    normalizeRegistrationOutput(
      { fields: { vin: 'Fahrgestell-Nr.: WFOWXXTACWKJ75955' } },
      1,
    ).fields.vin.value,
  ).toBeNull();
});

it('accepts evidence on the third PDF page and rejects evidence outside the actual page count', () => {
  const raw = syntheticExtraction();
  raw.fields.vin = printedField('WDD1770511N100321', 'E', null, 'vin');
  raw.fields.vin.evidence[0].imageIndex = 2;
  expect(validateExtraction(raw, 3).fields.vin.status).toBe('extracted');
  expect(() => validateExtraction(raw, 2)).toThrow();
});

it('normalizes the brand semantic category without discarding a readable make', () => {
  const raw = syntheticExtraction();
  raw.fields.brand = printedField('Example Make', 'D.1');
  (raw.fields.brand.evidence[0] as { meaning?: string }).meaning = 'brand';
  expect(normalizeRegistrationOutput(raw, 1).fields.brand).toMatchObject({
    value: 'Example Make',
    status: 'extracted',
  });
});
it.each([
  ['1M8GDM9AXKP042788', 'extracted'],
  ['1M8GDM9A6KP042788', 'invalid'],
  ['WF0WXXTACWKJ75955', 'extracted'],
])(
  'flags North American checksum errors without changing printed characters: %s',
  (vin, status) => {
    const raw = syntheticExtraction();
    raw.fields.vin = printedField(vin, 'VIN', null, 'vin');
    const result = normalizeRegistrationOutput(raw, 1);
    expect(result.fields.vin).toMatchObject({ value: vin, status });
    expect(result.fields.vin.evidence[0].printedValue).toBe(vin);
  },
);
