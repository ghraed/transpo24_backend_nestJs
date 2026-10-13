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
