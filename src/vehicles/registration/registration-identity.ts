// Labels and generic body descriptions are not vehicle identity values.
const identityLabel =
  /^(?:vin|chassis(?:\s*[-.]?\s*(?:number|no\.?|nr\.?))?|fahr(?:gestell|getell)(?:nummer|\s*[-.]?\s*(?:nummer|nr\.?))|fahrzeugidentifikationsnummer|(?:n[°ºo.]?\s*(?:(?:de|du)\s*)?)?ch[âa]ssis|numero\s+(?:di\s+)?telaio|make|brand|manufacturer|marke(?:\s*(?:und|[/&])\s*typ)?|marque(?:\s*(?:et|[/&])\s*type)?|marca(?:\s*(?:e|[/&])\s*tipo)?|make\s*[/&]\s*model|model|modell|mod[èe]le|modello|type|typ|body\s*type|karosserie|carrosserie|carrozzeria|رقم\s+الهيكل|الماركة|الطراز|طرازها|نوعها)\s*[:.]?$/i;
const bodyDescription =
  /^(?:fourgon|fourgonnette|furg[oó]n|furgone|lieferwagen|kastenwagen|van|panel van|minibus|sedan|saloon|berline|limousine|estate|station wagon|hatchback|suv|pickup|pick-up|coup[ée]|cabriolet|convertible)$/i;

export function invalidRegistrationIdentity(value: string): boolean {
  const printed = value.normalize('NFKC').trim().replace(/\s+/g, ' ');
  return (
    identityLabel.test(printed) ||
    printed.split('/').every((part) => identityLabel.test(part.trim())) ||
    bodyDescription.test(printed) ||
    /^[A-HJ-NPR-Z0-9]{17}$/i.test(printed)
  );
}

/** Remove a visible VIN label, preserving every character of the VIN itself. */
export function printedVin(value: string): string {
  return value
    .trim()
    .replace(
      /^(?:VIN|chassis(?:\s*[-.]?\s*(?:number|no\.?|nr\.?))?|fahr(?:gestell|getell)(?:nummer|\s*[-.]?\s*(?:nummer|nr\.?)))\s*[:=]\s*/i,
      '',
    )
    .replace(/\s/g, '')
    .toUpperCase();
}

/** Flag transcription errors for North American VINs; never repair a digit.
 * Algorithm: 49 CFR 565.15(c). Other regions may use a different ninth character.
 */
export function northAmericanVinChecksumMismatch(vin: string): boolean {
  if (!/^[1-5][A-HJ-NPR-Z0-9]{16}$/.test(vin)) return false;
  const groups = ['AJ', 'BKS', 'CLT', 'DMU', 'ENV', 'FW', 'GPX', 'HY', 'RZ'];
  const weights = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];
  const remainder =
    [...vin].reduce((sum, character, index) => {
      const value = /\d/.test(character)
        ? Number(character)
        : groups.findIndex((group) => group.includes(character)) + 1;
      return sum + value * weights[index];
    }, 0) % 11;
  return vin[8] !== (remainder === 10 ? 'X' : String(remainder));
}
