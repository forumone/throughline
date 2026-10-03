import ts from 'typescript'

/**
 * Resolves the allowed values of a `select` field from the design system's own
 * types.
 *
 * The manifest does not carry them. `ContentField` has no `options`, and the
 * allowed values live in prose — `constraints: "'primary', 'secondary' or
 * 'on-dark'."` — which is documentation, not data. `content.variants` looks
 * like a substitute and is not: for most components it holds prose labels
 * ("Body only", "Body with rail") or runtime states ("paused", "playing"), so
 * mapping variants to options produces garbage more often than not.
 *
 * The component's own prop type is the one place the values exist as data, and
 * it is the definition the component actually behaves according to. Reading it
 * makes drift impossible in the direction that matters: rename a member of
 * `CardVariant` and the generated block changes with it, which shows up as a
 * diff in review rather than as an option that silently stopped working.
 *
 * The compiler API rather than a regex because the values are reached three
 * different ways — a named alias (`type CardVariant = 'default' | 'panel'`), an
 * inline union on the prop, and through an array element for a nested field
 * like `Credentials.credentials.icon`. The checker resolves all three; a regex
 * resolves the first.
 */
export class SelectOptionResolver {
  private readonly checker: ts.TypeChecker
  private readonly source: ts.SourceFile | undefined

  /**
   * @param typesEntry Path to the design system's declaration entry — the file
   *   that re-exports every component's props, e.g.
   *   `design-system/dist/src/lib/index.d.ts`.
   */
  constructor(typesEntry: string) {
    const program = ts.createProgram([typesEntry], {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      skipLibCheck: true,
      noEmit: true,
    })
    this.checker = program.getTypeChecker()
    this.source = program.getSourceFile(typesEntry)
  }

  /**
   * `('Card', 'variant')` → `['default', 'panel']`.
   * `('Credentials', 'credentials.icon')` → the icon keys.
   *
   * Null when the path does not resolve or the leaf is not a union of string
   * literals — the caller decides whether that is an error or a cue to look in
   * the overrides.
   */
  resolve(component: string, path: string): readonly string[] | null {
    const propsType = this.propsType(component)
    if (!propsType) return null

    let current: ts.Type | null = propsType
    for (const segment of path.split('.')) {
      current = this.propertyType(current, segment)
      if (!current) return null
      current = this.unwrapArray(current)
    }
    return literalUnion(current)
  }

  /**
   * A named exported type's literal union — `resolveNamed('IconName')` gives
   * every glyph in the global set.
   *
   * For fields whose prop type cannot carry the values: `ReportGrid.ctaIcon` is
   * a `ReactNode` because the component takes a rendered glyph, while the
   * contract, correctly, says an author picks a *name*.
   */
  resolveNamed(typeName: string): readonly string[] | null {
    const type = this.exportedType(typeName)
    return type ? literalUnion(type) : null
  }

  private propsType(component: string): ts.Type | null {
    return this.exportedType(`${component}Props`)
  }

  private exportedType(name: string): ts.Type | null {
    if (!this.source) return null
    const moduleSymbol = this.checker.getSymbolAtLocation(this.source)
    if (!moduleSymbol) return null

    const exported = this.checker
      .getExportsOfModule(moduleSymbol)
      .find(symbol => symbol.getName() === name)
    if (!exported) return null

    // Re-exports arrive as alias symbols; the local declaration is behind one
    // hop. A directly-declared export has no alias to follow.
    const symbol =
      exported.flags & ts.SymbolFlags.Alias ? this.checker.getAliasedSymbol(exported) : exported
    const declaration = symbol.declarations?.[0]
    return declaration ? this.checker.getDeclaredTypeOfSymbol(symbol) : null
  }

  private propertyType(type: ts.Type, name: string): ts.Type | null {
    const symbol = type.getProperty(name)
    if (!symbol) return null
    const declaration = symbol.declarations?.[0]
    if (!declaration) return null
    // The declared type, not the type at the use site, so an optional prop
    // resolves to its union rather than to `T | undefined` collapsed.
    return this.checker.getTypeOfSymbolAtLocation(symbol, declaration)
  }

  /**
   * `Item[]` → `Item`, so a nested path can keep walking into an array's rows.
   *
   * Matched on the array symbol rather than on a numeric index signature. A
   * union of string literals *has* a numeric index type — `string`, from
   * character access — so indexing it collapses `'default' | 'panel'` to
   * `string` and every select silently resolves to nothing.
   */
  private unwrapArray(type: ts.Type): ts.Type {
    const name = type.getSymbol()?.getName()
    if (name !== 'Array' && name !== 'ReadonlyArray') return type
    return this.checker.getTypeArguments(type as ts.TypeReference)[0] ?? type
  }
}

/**
 * The string literals in a union, or null if it is anything else.
 *
 * `undefined` and `null` members are dropped — a prop being optional says
 * nothing about which values are allowed. A union with a non-literal member
 * (`string`, a component type) returns null rather than a partial list, because
 * a partial list would silently forbid values the component accepts.
 */
function literalUnion(type: ts.Type): readonly string[] | null {
  const members = type.isUnion() ? type.types : [type]
  const values: string[] = []

  for (const member of members) {
    if (member.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Null)) continue
    if (member.isStringLiteral()) {
      values.push(member.value)
      continue
    }
    return null
  }

  return values.length > 0 ? values : null
}
