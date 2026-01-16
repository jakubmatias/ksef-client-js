import { buildFa3XmlFromXsdJson, type Fa3XsdInvoiceInput, type XsdNode, type XsdValue } from '@/invoice/xml-builder'

export class Fa3XsdInvoiceBuilder {
  private readonly faktura: XsdNode = {}

  public withNaglowek(value: XsdNode): this {
    this.faktura['Naglowek'] = value
    return this
  }

  public withPodmiot1(value: XsdNode): this {
    this.faktura['Podmiot1'] = value
    return this
  }

  public withPodmiot2(value: XsdNode): this {
    this.faktura['Podmiot2'] = value
    return this
  }

  public addPodmiot3(value: XsdNode): this {
    const list = this.ensureArray('Podmiot3')
    list.push(value)
    return this
  }

  public withFa(value: XsdNode): this {
    this.faktura['Fa'] = value
    return this
  }

  public addFaWiersz(value: XsdNode): this {
    if (!this.faktura['Fa'] || typeof this.faktura['Fa'] !== 'object' || Array.isArray(this.faktura['Fa'])) {
      this.faktura['Fa'] = {}
    }
    const fa = this.faktura['Fa'] as XsdNode
    const list = this.ensureArray('Fa.FaWiersz')
    list.push(value)
    fa['FaWiersz'] = list
    return this
  }

  public withStopka(value: XsdNode): this {
    this.faktura['Stopka'] = value
    return this
  }

  public set(path: string, value: XsdValue): this {
    const normalized = path.replace(/^Faktura\./, '')
    this.setPath(this.faktura, normalized.split('.'), value)
    return this
  }

  public build(): Fa3XsdInvoiceInput {
    return { Faktura: this.faktura }
  }

  public buildXml(): string {
    return buildFa3XmlFromXsdJson(this.build())
  }

  public static create(): Fa3XsdInvoiceBuilder {
    return new Fa3XsdInvoiceBuilder()
  }

  private ensureArray(path: string): XsdNode[] {
    const normalized = path.replace(/^Faktura\./, '')
    const segments = normalized.split('.')
    const last = segments.pop()
    if (!last) {
      return []
    }
    const parent = this.getPath(this.faktura, segments)
    if (!parent || typeof parent !== 'object' || Array.isArray(parent)) {
      this.setPath(this.faktura, segments, {})
    }
    const container = this.getPath(this.faktura, segments) as XsdNode
    const current = container[last]
    if (Array.isArray(current)) {
      return current as XsdNode[]
    }
    if (current && typeof current === 'object') {
      const list = [current as XsdNode]
      container[last] = list
      return list
    }
    const list: XsdNode[] = []
    container[last] = list
    return list
  }

  private getPath(root: XsdNode, segments: string[]): XsdValue | null | undefined {
    let current: XsdValue | null | undefined = root
    for (const segment of segments) {
      if (!current || typeof current !== 'object' || Array.isArray(current)) {
        return undefined
      }
      current = (current as XsdNode)[segment]
    }
    return current
  }

  private setPath(root: XsdNode, segments: string[], value: XsdValue): void {
    let current: XsdNode = root
    for (let i = 0; i < segments.length; i += 1) {
      const segment = segments[i]
      if (!segment) {
        continue
      }
      if (i === segments.length - 1) {
        current[segment] = value
        return
      }
      const next = current[segment]
      if (!next || typeof next !== 'object' || Array.isArray(next)) {
        current[segment] = {}
      }
      current = current[segment] as XsdNode
    }
  }
}
