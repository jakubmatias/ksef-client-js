import { randomUUID } from 'crypto'

export type Fa2InvoiceInput = {
  seller?: {
    nip: string
    name: string
    addressL1: string
    addressL2: string
    email?: string
    phone?: string
  }
  buyer?: {
    nip: string
    name: string
    addressL1: string
    addressL2: string
    email?: string
    phone?: string
    clientNumber?: string
  }
  header?: {
    invoiceNumber: string
    issueDate: string
    saleDate: string
    place?: string
    currency?: string
    systemInfo?: string
    annotations?: {
      P_16?: string
      P_17?: string
      P_18?: string
      P_18A?: string
      Zwolnienie?: { P_19N?: string }
      NoweSrodkiTransportu?: { P_22N?: string }
      P_23?: string
      PMarzy?: { P_PMarzyN?: string }
    }
  }
  lines?: Array<{
    name: string
    unit?: string
    quantity: number
    unitPrice: number
    vatRatePercent: number
  }>
}

export type Fa3InvoiceInput = {
  seller?: {
    nip: string
    name: string
    addressL1: string
    addressL2: string
    email?: string
    phone?: string
  }
  buyer?: {
    nip: string
    name: string
    addressL1: string
    addressL2: string
    email?: string
    phone?: string
    clientNumber?: string
    jst?: string | number
    gv?: string | number
  }
  podmiot3?: {
    nip: string
    name: string
    addressL1: string
    addressL2: string
    email?: string
    phone?: string
    role?: string | number
    roleOther?: string
  }
  header?: {
    invoiceNumber: string
    issueDate: string
    saleDate: string
    place?: string
    currency?: string
    systemInfo?: string
    annotations?: {
      P_16?: string
      P_17?: string
      P_18?: string
      P_18A?: string
      Zwolnienie?: { P_19N?: string }
      NoweSrodkiTransportu?: { P_22N?: string }
      P_23?: string
      PMarzy?: { P_PMarzyN?: string }
    }
  }
  lines?: Array<{
    name: string
    unit?: string
    quantity: number
    unitPrice: number
    vatRatePercent: number
  }>
}

export type XsdValue = string | number | boolean | XsdNode | XsdValue[]
export type XsdNode = { [key: string]: XsdValue | undefined | null }

export type Fa3XsdInvoiceInput = {
  Faktura: XsdNode
}

export function buildFa2XmlFromJson(input: Fa2InvoiceInput): string {
  if (!input.header || !input.seller || !input.buyer || !input.lines?.length) {
    throw new Error('Missing required invoice fields (header, seller, buyer, lines)')
  }

  const currency = input.header.currency ?? 'PLN'
  const issueDate = input.header.issueDate
  const saleDate = input.header.saleDate
  const place = input.header.place ?? 'Warsaw'
  const systemInfo = input.header.systemInfo ?? 'ksef-client-js'

  let netTotal = 0
  let vatTotal = 0
  let grossTotal = 0

  const lineXml = input.lines.map((line, index) => {
    const quantity = line.quantity
    const unitPrice = line.unitPrice
    const net = quantity * unitPrice
    const vat = net * (line.vatRatePercent / 100)
    const gross = net + vat

    netTotal += net
    vatTotal += vat
    grossTotal += gross

    return `
    <FaWiersz>
      <NrWierszaFa>${index + 1}</NrWierszaFa>
      <P_7>${escapeXml(line.name)}</P_7>
      <P_8A>${escapeXml(line.unit ?? 'szt.')}</P_8A>
      <P_8B>${formatNumber(quantity)}</P_8B>
      <P_9A>${formatNumber(unitPrice)}</P_9A>
      <P_11>${formatNumber(net)}</P_11>
      <P_12>${formatNumber(line.vatRatePercent)}</P_12>
    </FaWiersz>`
  }).join('')

  const defaultAnnotations = {
    P_16: '2',
    P_17: '2',
    P_18: '2',
    P_18A: '2',
    Zwolnienie: { P_19N: '1' },
    NoweSrodkiTransportu: { P_22N: '1' },
    P_23: '2',
    PMarzy: { P_PMarzyN: '1' },
  }
  const annotations = {
    ...defaultAnnotations,
    ...input.header.annotations,
    Zwolnienie: {
      ...defaultAnnotations.Zwolnienie,
      ...input.header.annotations?.Zwolnienie,
    },
    NoweSrodkiTransportu: {
      ...defaultAnnotations.NoweSrodkiTransportu,
      ...input.header.annotations?.NoweSrodkiTransportu,
    },
    PMarzy: {
      ...defaultAnnotations.PMarzy,
      ...input.header.annotations?.PMarzy,
    },
  }

  return `<?xml version="1.0" encoding="utf-8"?>
<Faktura xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xmlns:xsd="http://www.w3.org/2001/XMLSchema"
         xmlns:etd="http://crd.gov.pl/xml/schematy/2020/10/08/eDokumenty"
         xmlns="http://crd.gov.pl/wzor/2023/06/29/12648/">
  <Naglowek>
    <KodFormularza kodSystemowy="FA (2)" wersjaSchemy="1-0E">FA</KodFormularza>
    <WariantFormularza>2</WariantFormularza>
    <DataWytworzeniaFa>${new Date().toISOString()}</DataWytworzeniaFa>
    <SystemInfo>${escapeXml(systemInfo)}</SystemInfo>
  </Naglowek>
  <Podmiot1>
    <DaneIdentyfikacyjne>
      <NIP>${escapeXml(input.seller.nip)}</NIP>
      <Nazwa>${escapeXml(input.seller.name)}</Nazwa>
    </DaneIdentyfikacyjne>
    <Adres>
      <KodKraju>PL</KodKraju>
      <AdresL1>${escapeXml(input.seller.addressL1)}</AdresL1>
      <AdresL2>${escapeXml(input.seller.addressL2)}</AdresL2>
    </Adres>
    <DaneKontaktowe>
      ${input.seller.email ? `<Email>${escapeXml(input.seller.email)}</Email>` : ''}
      ${input.seller.phone ? `<Telefon>${escapeXml(input.seller.phone)}</Telefon>` : ''}
    </DaneKontaktowe>
  </Podmiot1>
  <Podmiot2>
    <DaneIdentyfikacyjne>
      <NIP>${escapeXml(input.buyer.nip)}</NIP>
      <Nazwa>${escapeXml(input.buyer.name)}</Nazwa>
    </DaneIdentyfikacyjne>
    <Adres>
      <KodKraju>PL</KodKraju>
      <AdresL1>${escapeXml(input.buyer.addressL1)}</AdresL1>
      <AdresL2>${escapeXml(input.buyer.addressL2)}</AdresL2>
    </Adres>
    <DaneKontaktowe>
      ${input.buyer.email ? `<Email>${escapeXml(input.buyer.email)}</Email>` : ''}
      ${input.buyer.phone ? `<Telefon>${escapeXml(input.buyer.phone)}</Telefon>` : ''}
    </DaneKontaktowe>
    ${input.buyer.clientNumber ? `<NrKlienta>${escapeXml(input.buyer.clientNumber)}</NrKlienta>` : ''}
  </Podmiot2>
  <Fa>
    <KodWaluty>${escapeXml(currency)}</KodWaluty>
    <P_1>${escapeXml(issueDate)}</P_1>
    <P_1M>${escapeXml(place)}</P_1M>
    <P_2>${escapeXml(input.header.invoiceNumber)}</P_2>
    <P_6>${escapeXml(saleDate)}</P_6>
    <P_13_1>${formatNumber(netTotal)}</P_13_1>
    <P_14_1>${formatNumber(vatTotal)}</P_14_1>
    <P_15>${formatNumber(grossTotal)}</P_15>
    <Adnotacje>
      <P_16>${escapeXml(annotations.P_16)}</P_16>
      <P_17>${escapeXml(annotations.P_17)}</P_17>
      <P_18>${escapeXml(annotations.P_18)}</P_18>
      <P_18A>${escapeXml(annotations.P_18A)}</P_18A>
      <Zwolnienie>
        <P_19N>${escapeXml(annotations.Zwolnienie.P_19N)}</P_19N>
      </Zwolnienie>
      <NoweSrodkiTransportu>
        <P_22N>${escapeXml(annotations.NoweSrodkiTransportu.P_22N)}</P_22N>
      </NoweSrodkiTransportu>
      <P_23>${escapeXml(annotations.P_23)}</P_23>
      <PMarzy>
        <P_PMarzyN>${escapeXml(annotations.PMarzy.P_PMarzyN)}</P_PMarzyN>
      </PMarzy>
    </Adnotacje>
    <RodzajFaktury>VAT</RodzajFaktury>
    ${lineXml}
  </Fa>
</Faktura>`
}

export function buildFa3XmlFromJson(input: Fa3InvoiceInput): string {
  if (!input.header || !input.seller || !input.buyer || !input.lines?.length) {
    throw new Error('Missing required invoice fields (header, seller, buyer, lines)')
  }

  const currency = input.header.currency ?? 'PLN'
  const issueDate = input.header.issueDate
  const saleDate = input.header.saleDate
  const place = input.header.place ?? 'Warsaw'
  const systemInfo = input.header.systemInfo ?? 'ksef-client-js'
  const jst = normalizeBinaryFlag(input.buyer.jst, 'JST')
  const gv = normalizeBinaryFlag(input.buyer.gv, 'GV')
  const needsPodmiot3 = jst === '1' || gv === '1'
  if (needsPodmiot3 && !input.podmiot3) {
    throw new Error('Podmiot3 is required when buyer.jst or buyer.gv is "1"')
  }

  const hasPodmiot3Contact = Boolean(input.podmiot3?.email || input.podmiot3?.phone)
  const podmiot3RoleRaw = input.podmiot3?.role
  const podmiot3Role = podmiot3RoleRaw !== undefined ? Number(podmiot3RoleRaw) : undefined
  if (needsPodmiot3 && podmiot3Role === undefined) {
    throw new Error('Podmiot3 role is required when buyer.jst or buyer.gv is "1"')
  }
  if (podmiot3Role !== undefined && (!Number.isInteger(podmiot3Role) || podmiot3Role < 1 || podmiot3Role > 11)) {
    throw new Error('Podmiot3 role must be an integer between 1 and 11')
  }
  const podmiot3RoleOther = input.podmiot3?.roleOther
  if (podmiot3RoleOther && podmiot3RoleOther.length > 256) {
    throw new Error('Podmiot3 roleOther must be at most 256 characters')
  }
  if (input.podmiot3 && !hasPodmiot3Contact && podmiot3Role === undefined && !podmiot3RoleOther) {
    throw new Error('Podmiot3 requires contact info or role details (role or roleOther)')
  }

  let netTotal = 0
  let vatTotal = 0
  let grossTotal = 0

  const lineXml = input.lines.map((line, index) => {
    const quantity = line.quantity
    const unitPrice = line.unitPrice
    const net = quantity * unitPrice
    const vat = net * (line.vatRatePercent / 100)
    const gross = net + vat

    netTotal += net
    vatTotal += vat
    grossTotal += gross

    return `
    <FaWiersz>
      <NrWierszaFa>${index + 1}</NrWierszaFa>
      <UU_ID>${randomUUID()}</UU_ID>
      <P_7>${escapeXml(line.name)}</P_7>
      <P_8A>${escapeXml(line.unit ?? 'szt.')}</P_8A>
      <P_8B>${formatNumber(quantity)}</P_8B>
      <P_9A>${formatNumber(unitPrice)}</P_9A>
      <P_11>${formatNumber(net)}</P_11>
      <P_12>${formatNumber(line.vatRatePercent)}</P_12>
    </FaWiersz>`
  }).join('')

  const defaultAnnotations = {
    P_16: '2',
    P_17: '2',
    P_18: '2',
    P_18A: '2',
    Zwolnienie: { P_19N: '1' },
    NoweSrodkiTransportu: { P_22N: '1' },
    P_23: '2',
    PMarzy: { P_PMarzyN: '1' },
  }
  const annotations = {
    ...defaultAnnotations,
    ...input.header.annotations,
    Zwolnienie: {
      ...defaultAnnotations.Zwolnienie,
      ...input.header.annotations?.Zwolnienie,
    },
    NoweSrodkiTransportu: {
      ...defaultAnnotations.NoweSrodkiTransportu,
      ...input.header.annotations?.NoweSrodkiTransportu,
    },
    PMarzy: {
      ...defaultAnnotations.PMarzy,
      ...input.header.annotations?.PMarzy,
    },
  }

  return `<?xml version="1.0" encoding="utf-8"?>
<Faktura xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xmlns:xsd="http://www.w3.org/2001/XMLSchema"
         xmlns:etd="http://crd.gov.pl/xml/schematy/dziedzinowe/mf/2022/01/05/eD/DefinicjeTypy/"
         xmlns="http://crd.gov.pl/wzor/2025/06/25/13775/">
  <Naglowek>
    <KodFormularza kodSystemowy="FA (3)" wersjaSchemy="1-0E">FA</KodFormularza>
    <WariantFormularza>3</WariantFormularza>
    <DataWytworzeniaFa>${new Date().toISOString()}</DataWytworzeniaFa>
    <SystemInfo>${escapeXml(systemInfo)}</SystemInfo>
  </Naglowek>
  <Podmiot1>
    <DaneIdentyfikacyjne>
      <NIP>${escapeXml(input.seller.nip)}</NIP>
      <Nazwa>${escapeXml(input.seller.name)}</Nazwa>
    </DaneIdentyfikacyjne>
    <Adres>
      <KodKraju>PL</KodKraju>
      <AdresL1>${escapeXml(input.seller.addressL1)}</AdresL1>
      <AdresL2>${escapeXml(input.seller.addressL2)}</AdresL2>
    </Adres>
    <DaneKontaktowe>
      ${input.seller.email ? `<Email>${escapeXml(input.seller.email)}</Email>` : ''}
      ${input.seller.phone ? `<Telefon>${escapeXml(input.seller.phone)}</Telefon>` : ''}
    </DaneKontaktowe>
  </Podmiot1>
  <Podmiot2>
    <DaneIdentyfikacyjne>
      <NIP>${escapeXml(input.buyer.nip)}</NIP>
      <Nazwa>${escapeXml(input.buyer.name)}</Nazwa>
    </DaneIdentyfikacyjne>
    <Adres>
      <KodKraju>PL</KodKraju>
      <AdresL1>${escapeXml(input.buyer.addressL1)}</AdresL1>
      <AdresL2>${escapeXml(input.buyer.addressL2)}</AdresL2>
    </Adres>
    <DaneKontaktowe>
      ${input.buyer.email ? `<Email>${escapeXml(input.buyer.email)}</Email>` : ''}
      ${input.buyer.phone ? `<Telefon>${escapeXml(input.buyer.phone)}</Telefon>` : ''}
    </DaneKontaktowe>
    ${input.buyer.clientNumber ? `<NrKlienta>${escapeXml(input.buyer.clientNumber)}</NrKlienta>` : ''}
    <JST>${escapeXml(jst)}</JST>
    <GV>${escapeXml(gv)}</GV>
  </Podmiot2>
  ${input.podmiot3 ? `
  <Podmiot3>
    <DaneIdentyfikacyjne>
      <NIP>${escapeXml(input.podmiot3.nip)}</NIP>
      <Nazwa>${escapeXml(input.podmiot3.name)}</Nazwa>
    </DaneIdentyfikacyjne>
    <Adres>
      <KodKraju>PL</KodKraju>
      <AdresL1>${escapeXml(input.podmiot3.addressL1)}</AdresL1>
      <AdresL2>${escapeXml(input.podmiot3.addressL2)}</AdresL2>
    </Adres>
    ${input.podmiot3.email || input.podmiot3.phone ? `
    <DaneKontaktowe>
      ${input.podmiot3.email ? `<Email>${escapeXml(input.podmiot3.email)}</Email>` : ''}
      ${input.podmiot3.phone ? `<Telefon>${escapeXml(input.podmiot3.phone)}</Telefon>` : ''}
    </DaneKontaktowe>` : ''}
    <Rola>${escapeXml(String(podmiot3Role))}</Rola>
    ${podmiot3RoleOther
      ? `<RolaInna>1</RolaInna><OpisRoli>${escapeXml(podmiot3RoleOther)}</OpisRoli>`
      : ''}
  </Podmiot3>` : ''}
  <Fa>
    <KodWaluty>${escapeXml(currency)}</KodWaluty>
    <P_1>${escapeXml(issueDate)}</P_1>
    <P_1M>${escapeXml(place)}</P_1M>
    <P_2>${escapeXml(input.header.invoiceNumber)}</P_2>
    <P_6>${escapeXml(saleDate)}</P_6>
    <P_13_1>${formatNumber(netTotal)}</P_13_1>
    <P_14_1>${formatNumber(vatTotal)}</P_14_1>
    <P_15>${formatNumber(grossTotal)}</P_15>
    <Adnotacje>
      <P_16>${escapeXml(annotations.P_16)}</P_16>
      <P_17>${escapeXml(annotations.P_17)}</P_17>
      <P_18>${escapeXml(annotations.P_18)}</P_18>
      <P_18A>${escapeXml(annotations.P_18A)}</P_18A>
      <Zwolnienie>
        <P_19N>${escapeXml(annotations.Zwolnienie.P_19N)}</P_19N>
      </Zwolnienie>
      <NoweSrodkiTransportu>
        <P_22N>${escapeXml(annotations.NoweSrodkiTransportu.P_22N)}</P_22N>
      </NoweSrodkiTransportu>
      <P_23>${escapeXml(annotations.P_23)}</P_23>
      <PMarzy>
        <P_PMarzyN>${escapeXml(annotations.PMarzy.P_PMarzyN)}</P_PMarzyN>
      </PMarzy>
    </Adnotacje>
    <RodzajFaktury>VAT</RodzajFaktury>
    ${lineXml}
  </Fa>
</Faktura>`
}

export function buildFa3XmlFromXsdJson(input: Fa3XsdInvoiceInput): string {
  if (!input.Faktura) {
    throw new Error('Missing Faktura node in XSD-aligned JSON input')
  }

  const faktura = normalizeFaktura(input.Faktura)
  const fakturaXml = serializeNode('Faktura', faktura, 'Faktura')

  return `<?xml version="1.0" encoding="utf-8"?>
<Faktura xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xmlns:xsd="http://www.w3.org/2001/XMLSchema"
         xmlns:etd="http://crd.gov.pl/xml/schematy/dziedzinowe/mf/2022/01/05/eD/DefinicjeTypy/"
         xmlns="http://crd.gov.pl/wzor/2025/06/25/13775/">
${fakturaXml.replace(/^<Faktura>|<\/Faktura>$/g, '')}
</Faktura>`
}

function normalizeBinaryFlag(value: string | number | undefined, label: string): string {
  if (value === undefined || value === null || value === '') {
    return '2'
  }
  const normalized = String(value)
  if (normalized !== '1' && normalized !== '2') {
    throw new Error(`${label} must be "1" or "2"`)
  }
  return normalized
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function formatNumber(value: number): string {
  return Number.isInteger(value)
    ? value.toString()
    : value.toFixed(2)
}

function normalizeFaktura(faktura: XsdNode): XsdNode {
  const rawNaglowek = (faktura['Naglowek'] ?? {}) as XsdNode
  const naglowek: XsdNode = {
    KodFormularza: rawNaglowek['KodFormularza'] ?? 'FA',
    WariantFormularza: rawNaglowek['WariantFormularza'] ?? '3',
    DataWytworzeniaFa: rawNaglowek['DataWytworzeniaFa'] ?? new Date().toISOString(),
  }

  if (rawNaglowek['SystemInfo'] !== undefined) {
    naglowek['SystemInfo'] = rawNaglowek['SystemInfo']
  }

  for (const [key, value] of Object.entries(rawNaglowek)) {
    if (key in naglowek) {
      continue
    }
    naglowek[key] = value as XsdValue
  }

  const fakturaWithoutNaglowek: XsdNode = { ...faktura }
  delete fakturaWithoutNaglowek['Naglowek']

  const orderedKeys = [
    'Podmiot1',
    'Podmiot2',
    'Podmiot3',
    'PodmiotUpowazniony',
    'Fa',
    'Stopka',
  ]

  const ordered: XsdNode = {
    Naglowek: naglowek,
  }

  for (const key of orderedKeys) {
    if (key in fakturaWithoutNaglowek) {
      ordered[key] = fakturaWithoutNaglowek[key] as XsdValue
      delete fakturaWithoutNaglowek[key]
    }
  }

  for (const [key, value] of Object.entries(fakturaWithoutNaglowek)) {
    ordered[key] = value as XsdValue
  }

  return ordered
}

function serializeNode(name: string, value: XsdValue, path: string): string {
  if (value === null || value === undefined) {
    return ''
  }

  if (Array.isArray(value)) {
    return value.map((item) => serializeNode(name, item, path)).join('')
  }

  if (typeof value === 'object') {
    const content = serializeChildren(value as XsdNode, path)
    return `<${name}>${content}</${name}>`
  }

  if (path === 'Faktura.Naglowek.KodFormularza') {
    const text = escapeXml(String(value))
    return `<${name} kodSystemowy="FA (3)" wersjaSchemy="1-0E">${text}</${name}>`
  }

  return `<${name}>${escapeXml(String(value))}</${name}>`
}

function serializeChildren(node: XsdNode, parentPath: string): string {
  return Object.entries(node)
    .map(([key, value]) => serializeNode(key, value as XsdValue, `${parentPath}.${key}`))
    .join('')
}
