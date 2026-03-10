import { useEffect, useMemo, useState } from 'react'
import Papa, { type ParseResult } from 'papaparse'

type CsvRow = Record<string, string>

type GroupId = 'dimension' | 'relief' | 'drainage' | 'shape' | 'hydrology' | 'concentration' | 'other'

type MetricRow = {
  id: string
  parameter: string
  value: string
  unit: string
  interpretation: string
  numeric?: number
  group: GroupId
}

const BASE_URL = import.meta.env.BASE_URL

const GROUP_LABELS: Record<GroupId, string> = {
  dimension: 'Dimensões',
  relief: 'Relevo e declividade',
  drainage: 'Drenagem',
  shape: 'Forma da bacia',
  hydrology: 'Fluxos e rede',
  concentration: 'Tempo de concentração',
  other: 'Outros indicadores'
}

function resolvePublicPath(path: string): string {
  return `${BASE_URL}${path.replace(/^\/+/, '')}`
}

function normalizeKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

function parseNumeric(value: string): number | undefined {
  let cleaned = value
    .trim()
    .replace(/\s/g, '')
    .replace(/[^0-9,.-]/g, '')

  if (!cleaned) return undefined

  const commaIndex = cleaned.lastIndexOf(',')
  const dotIndex = cleaned.lastIndexOf('.')

  if (commaIndex > -1 && dotIndex > -1) {
    if (commaIndex > dotIndex) {
      cleaned = cleaned.replace(/\./g, '').replace(',', '.')
    } else {
      cleaned = cleaned.replace(/,/g, '')
    }
  } else if (commaIndex > -1 && dotIndex === -1) {
    cleaned = cleaned.replace(',', '.')
  }

  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : undefined
}

function pickHeader(headers: string[], aliases: string[]): string | null {
  const normalizedAliases = aliases.map(normalizeKey)

  for (const header of headers) {
    const normalized = normalizeKey(header)
    if (normalizedAliases.includes(normalized)) return header
  }

  return null
}

function inferGroup(parameter: string): GroupId {
  const normalized = normalizeKey(parameter)

  if (normalized.includes('tempodeconcentracao') || normalized.includes('kirpich') || normalized.includes('giandotti')) {
    return 'concentration'
  }

  if (
    normalized.includes('densidadededrenagem') ||
    normalized.includes('rede') ||
    normalized.includes('manutencaodocanal')
  ) {
    return 'drainage'
  }

  if (
    normalized.includes('areadabacia') ||
    normalized.includes('perimetro') ||
    normalized.includes('comprimentodabacia') ||
    normalized.includes('larguradabacia')
  ) {
    return 'dimension'
  }

  if (
    normalized.includes('elevacao') ||
    normalized.includes('relevo') ||
    normalized.includes('declividade') ||
    normalized.includes('rugosidade')
  ) {
    return 'relief'
  }

  if (
    normalized.includes('razaodealongamento') ||
    normalized.includes('razaodecircularidade') ||
    normalized.includes('coeficientedecompactacao') ||
    normalized.includes('fator') ||
    normalized.includes('gravelius')
  ) {
    return 'shape'
  }

  if (
    normalized.includes('ordemdosfluxos') ||
    normalized.includes('comprimentomediodofluxo') ||
    normalized.includes('frequenciadacorrente') ||
    normalized.includes('razaodebifurcacao')
  ) {
    return 'hydrology'
  }

  return 'other'
}

function parseCsvRows(data: CsvRow[], headers: string[]): MetricRow[] {
  const parameterKey = pickHeader(headers, ['parameter', 'parâmetro', 'parametro'])
  const valueKey = pickHeader(headers, ['value', 'valor'])
  const unitKey = pickHeader(headers, ['unit', 'unidade'])
  const interpretationKey = pickHeader(headers, ['interpretation', 'interpretação', 'interpretacao'])

  if (parameterKey && valueKey) {
    return data
      .map((row, index) => {
        const parameter = String(row[parameterKey] ?? '').trim()
        const value = String(row[valueKey] ?? '').trim()
        const unit = unitKey ? String(row[unitKey] ?? '').trim() : ''
        const interpretation = interpretationKey ? String(row[interpretationKey] ?? '').trim() : ''

        return {
          id: `metric-${index + 1}`,
          parameter,
          value,
          unit,
          interpretation,
          numeric: parseNumeric(value),
          group: inferGroup(parameter)
        }
      })
      .filter((row) => row.parameter || row.value || row.unit || row.interpretation)
  }

  if (data.length === 0) return []

  const first = data[0]
  return headers.map((header, index) => {
    const value = String(first[header] ?? '').trim()
    return {
      id: `metric-wide-${index + 1}`,
      parameter: header,
      value,
      unit: '',
      interpretation: '',
      numeric: parseNumeric(value),
      group: inferGroup(header)
    }
  })
}

function summarizeNumeric(rows: MetricRow[]) {
  const numericValues = rows.map((row) => row.numeric).filter((value): value is number => typeof value === 'number')

  if (numericValues.length === 0) {
    return {
      min: undefined as number | undefined,
      max: undefined as number | undefined,
      average: undefined as number | undefined
    }
  }

  const total = numericValues.reduce((acc, value) => acc + value, 0)

  return {
    min: Math.min(...numericValues),
    max: Math.max(...numericValues),
    average: total / numericValues.length
  }
}

function formatMetricValue(row: MetricRow): string {
  if (!row.value) return '-'
  return row.unit ? `${row.value} ${row.unit}` : row.value
}

function findMetric(rows: MetricRow[], expression: RegExp): MetricRow | null {
  return rows.find((row) => expression.test(normalizeKey(row.parameter))) ?? null
}

export default function ReportDashboard() {
  const [rows, setRows] = useState<MetricRow[]>([])
  const [search, setSearch] = useState('')
  const [groupFilter, setGroupFilter] = useState<GroupId | 'all'>('all')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Papa.parse<CsvRow>(resolvePublicPath('/data/report/report_bacia_paramirim.csv'), {
      download: true,
      header: true,
      skipEmptyLines: true,
      complete: ({ data, meta }: ParseResult<CsvRow>) => {
        const csvHeaders = (meta.fields ?? []).filter(Boolean)
        const parsedRows = parseCsvRows(data, csvHeaders)
        setRows(parsedRows)
        setLoading(false)
      },
      error: () => {
        setRows([])
        setLoading(false)
      }
    })
  }, [])

  const availableGroups = useMemo(() => {
    const ids = Array.from(new Set(rows.map((row) => row.group)))
    return ids
  }, [rows])

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase()

    return rows.filter((row) => {
      if (groupFilter !== 'all' && row.group !== groupFilter) return false
      if (!term) return true

      return [row.parameter, row.value, row.unit, row.interpretation, GROUP_LABELS[row.group]]
        .some((field) => field.toLowerCase().includes(term))
    })
  }, [rows, search, groupFilter])

  const stats = useMemo(() => {
    const unitCount = filteredRows.filter((row) => row.unit).length
    const numericCount = filteredRows.filter((row) => typeof row.numeric === 'number').length
    const groupedCount = new Set(filteredRows.map((row) => row.group)).size
    const range = summarizeNumeric(filteredRows)

    return {
      unitCount,
      numericCount,
      groupedCount,
      range
    }
  }, [filteredRows])

  const highlights = useMemo(() => {
    const area = findMetric(rows, /areadabacia/)
    const perimeter = findMetric(rows, /perimetro/)
    const averageElevation = findMetric(rows, /elevacaomedia/)
    const slope = findMetric(rows, /declividademediadabaciaporcentagem/)
    const runoff = findMetric(rows, /densidadededrenagem/)

    return [area, perimeter, averageElevation, slope, runoff].filter((item): item is MetricRow => item !== null)
  }, [rows])

  return (
    <section className="page-card report-card">
      <header className="section-top">
        <div>
          <p className="eyebrow">Informações da bacia</p>
          <h2>Relatório morfométrico do Rio Paramirim</h2>
          <p className="subtle">
            Parâmetros, unidades e interpretações da análise morfométrica da bacia hidrográfica do Rio Paramirim.
          </p>
        </div>

        <div className="report-toolbar">
          <label className="search-box">
            <span>Buscar no relatório</span>
            <input
              type="search"
              placeholder="Parâmetro, valor, unidade ou interpretação"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>

          <label className="search-box report-select-box">
            <span>Grupo</span>
            <select value={groupFilter} onChange={(event) => setGroupFilter(event.target.value as GroupId | 'all')}>
              <option value="all">Todos os grupos</option>
              {availableGroups.map((groupId) => (
                <option key={groupId} value={groupId}>{GROUP_LABELS[groupId]}</option>
              ))}
            </select>
          </label>
        </div>
      </header>

      {loading && <p className="empty-note">Carregando dados do report...</p>}

      {!loading && rows.length === 0 && (
        <p className="empty-note">
          O CSV não contém registros utilizáveis. Verifique <code>public/data/report/report_bacia_paramirim.csv</code>.
        </p>
      )}

      {!loading && rows.length > 0 && (
        <>
          <div className="report-summary">
            <article>
              <strong>{filteredRows.length}</strong>
              <span>Indicadores filtrados</span>
            </article>
            <article>
              <strong>{stats.groupedCount}</strong>
              <span>Grupos representados</span>
            </article>
            <article>
              <strong>{stats.numericCount}</strong>
              <span>Valores numéricos</span>
            </article>
            <article>
              <strong>{stats.unitCount}</strong>
              <span>Registros com unidade</span>
            </article>
            <article>
              <strong>
                {stats.range.min !== undefined && stats.range.max !== undefined
                  ? `${stats.range.min.toLocaleString('pt-BR')} - ${stats.range.max.toLocaleString('pt-BR')}`
                  : '-'}
              </strong>
              <span>Faixa numérica</span>
            </article>
          </div>

          {highlights.length > 0 && (
            <section className="report-highlights">
              {highlights.map((metric) => (
                <article key={metric.id} className="report-highlight-item">
                  <p>{metric.parameter}</p>
                  <strong>{formatMetricValue(metric)}</strong>
                  <small>{metric.interpretation || GROUP_LABELS[metric.group]}</small>
                </article>
              ))}
            </section>
          )}

          <section className="report-group-chips" aria-label="Filtros rápidos do report">
            <button
              type="button"
              className={groupFilter === 'all' ? 'active' : ''}
              onClick={() => setGroupFilter('all')}
            >
              Todos
            </button>
            {availableGroups.map((groupId) => (
              <button
                key={groupId}
                type="button"
                className={groupFilter === groupId ? 'active' : ''}
                onClick={() => setGroupFilter(groupId)}
              >
                {GROUP_LABELS[groupId]}
              </button>
            ))}
          </section>

          <div className="report-table-wrap">
            <table className="report-table">
              <thead>
                <tr>
                  <th>Parâmetro</th>
                  <th>Valor</th>
                  <th>Unidade</th>
                  <th>Interpretação</th>
                  <th>Grupo</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.parameter || '-'}</td>
                    <td>{row.value || '-'}</td>
                    <td>{row.unit || '-'}</td>
                    <td>{row.interpretation || '-'}</td>
                    <td>
                      <span className={`group-chip ${row.group}`}>{GROUP_LABELS[row.group]}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  )
}

