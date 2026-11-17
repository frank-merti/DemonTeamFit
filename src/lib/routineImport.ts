import type { Exercise, ExerciseCatalogItem, Routine, RoutineDay } from '../types'

export type RoutineDraft = {
  name: string
  goal: string
  level: Routine['level']
  weeks: number
  days: RoutineDay[]
}

export type ParsedRoutine = {
  draft: RoutineDraft
  warnings: string[]
}

type ParseOptions = {
  catalog: ExerciseCatalogItem[]
  fallbackName: string
  metaRows?: unknown[][]
  maxRows?: number
}

const MAX_EXERCISES = 400

const uid = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}${Math.random().toString(16).slice(2, 8)}`

export const normalizeHeader = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

const cellText = (value: unknown): string => {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return String(value).replace(/\s+/g, ' ').trim()
}

const numberFrom = (value: unknown, fallback: number) => {
  const text = cellText(value).replace(',', '.')
  if (!text) return fallback
  const parsed = Number.parseFloat(text.replace(/[^\d.-]/g, ''))
  return Number.isFinite(parsed) ? parsed : fallback
}

/** Acepta 90, "90 s", "90 segundos", "1:30" o "1.5 min". */
export const parseRestSeconds = (value: unknown, fallback = 60) => {
  const text = cellText(value).toLowerCase()
  if (!text) return fallback
  const clock = text.match(/^(\d+):(\d{1,2})$/)
  if (clock) return clampNumber(Number(clock[1]) * 60 + Number(clock[2]), 0, 3600)
  const minutes = /(min|minuto)/.test(text)
  const seconds = numberFrom(text, fallback)
  return clampNumber(Math.round(minutes ? seconds * 60 : seconds), 0, 3600)
}

const clampNumber = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Math.round(value)))

const parseLevel = (value: string): Routine['level'] => {
  const normalized = normalizeHeader(value)
  if (normalized.startsWith('avanz')) return 'Avanzado'
  if (normalized.startsWith('inter')) return 'Intermedio'
  return 'Principiante'
}

const aliases: Record<string, string> = {
  dia: 'day',
  day: 'day',
  'dia entrenamiento': 'day',
  enfoque: 'focus',
  foco: 'focus',
  focus: 'focus',
  grupo: 'focus',
  'grupo muscular': 'focus',
  ejercicio: 'exercise',
  exercise: 'exercise',
  movimiento: 'exercise',
  series: 'sets',
  sets: 'sets',
  reps: 'reps',
  rep: 'reps',
  repeticiones: 'reps',
  descanso: 'rest',
  'descanso s': 'rest',
  'descanso segundos': 'rest',
  'descanso en segundos': 'rest',
  rest: 'rest',
  'rest seconds': 'rest',
  segundos: 'rest',
  notas: 'notes',
  nota: 'notes',
  notes: 'notes',
  instrucciones: 'notes',
  catalogo: 'catalog',
  'catalogo id': 'catalog',
  'catalog id': 'catalog',
  catalog_id: 'catalog',
  biblioteca: 'catalog',
  rutina: 'routine',
  routine: 'routine',
  plan: 'routine',
  objetivo: 'goal',
  goal: 'goal',
  nivel: 'level',
  level: 'level',
  semanas: 'weeks',
  weeks: 'weeks',
}

const metaAliases: Record<string, keyof RoutineDraft> = {
  rutina: 'name',
  routine: 'name',
  nombre: 'name',
  name: 'name',
  plan: 'name',
  objetivo: 'goal',
  goal: 'goal',
  nivel: 'level',
  level: 'level',
  semanas: 'weeks',
  weeks: 'weeks',
}

export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^\uFEFF/, '')
  const firstLine = clean.split(/\r?\n/)[0] ?? ''
  const counts = [
    { delimiter: ';', count: (firstLine.match(/;/g) ?? []).length },
    { delimiter: ',', count: (firstLine.match(/,/g) ?? []).length },
    { delimiter: '\t', count: (firstLine.match(/\t/g) ?? []).length },
  ]
  const delimiter = counts.sort((a, b) => b.count - a.count)[0].delimiter

  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false

  for (let index = 0; index < clean.length; index += 1) {
    const char = clean[index]
    if (quoted) {
      if (char === '"' && clean[index + 1] === '"') {
        cell += '"'
        index += 1
      } else if (char === '"') {
        quoted = false
      } else {
        cell += char
      }
      continue
    }
    if (char === '"') {
      quoted = true
    } else if (char === delimiter) {
      row.push(cell)
      cell = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && clean[index + 1] === '\n') index += 1
      row.push(cell)
      if (row.some((value) => value.trim())) rows.push(row)
      row = []
      cell = ''
    } else {
      cell += char
    }
  }
  row.push(cell)
  if (row.some((value) => value.trim())) rows.push(row)
  return rows
}

const catalogByName = (catalog: ExerciseCatalogItem[]) =>
  new Map(catalog.map((item) => [normalizeHeader(item.name), item]))

const catalogById = (catalog: ExerciseCatalogItem[]) =>
  new Map(catalog.map((item) => [item.id, item]))

const findColumn = (headers: string[], alias: string) => {
  for (let index = 0; index < headers.length; index += 1) {
    if (aliases[normalizeHeader(headers[index])] === alias) return index
  }
  return -1
}

const metaFromRows = (rows: unknown[][]) => {
  const meta: Record<string, unknown> = {}
  for (const row of rows) {
    const key = normalizeHeader(cellText(row[0]))
    const target = metaAliases[key]
    if (!target) continue
    const value = row[1]
    if (cellText(value)) meta[target] = value
  }
  return meta
}

export function parseRoutineRows(rows: unknown[][], options: ParseOptions): ParsedRoutine {
  const valid = rows.filter((row) => row.some((cell) => cellText(cell)))
  if (valid.length === 0) {
    throw new Error('El archivo está vacío. Descarga la plantilla y captura al menos un ejercicio.')
  }

  const headerIndex = valid.findIndex((row) =>
    row.some((cell) => {
      const key = normalizeHeader(cellText(cell))
      return key === 'ejercicio' || key === 'exercise' || key === 'movimiento'
    }),
  )
  if (headerIndex === -1) {
    throw new Error(
      'No encontré la columna «Ejercicio». La hoja debe incluir: Día, Ejercicio, Series, Reps y Descanso (s).',
    )
  }

  const headers = valid[headerIndex].map((cell) => cellText(cell))
  const exerciseIndex = findColumn(headers, 'exercise')
  const dayIndex = findColumn(headers, 'day')
  const focusIndex = findColumn(headers, 'focus')
  const setsIndex = findColumn(headers, 'sets')
  const repsIndex = findColumn(headers, 'reps')
  const restIndex = findColumn(headers, 'rest')
  const notesIndex = findColumn(headers, 'notes')
  const catalogIndex = findColumn(headers, 'catalog')
  const routineIndex = findColumn(headers, 'routine')
  const goalIndex = findColumn(headers, 'goal')
  const levelIndex = findColumn(headers, 'level')
  const weeksIndex = findColumn(headers, 'weeks')

  const byName = catalogByName(options.catalog)
  const byId = catalogById(options.catalog)
  const warnings: string[] = []
  const days = new Map<string, RoutineDay>()
  let exercises = 0

  for (let index = headerIndex + 1; index < valid.length; index += 1) {
    const row = valid[index]
    const name = cellText(row[exerciseIndex])
    if (!name) continue
    if (exercises >= (options.maxRows ?? MAX_EXERCISES)) {
      warnings.push(`Se detuvo la lectura en ${options.maxRows ?? MAX_EXERCISES} ejercicios.`)
      break
    }

    const dayName = cellText(dayIndex >= 0 ? row[dayIndex] : '') || `Día ${days.size + 1}`
    let day = days.get(dayName)
    if (!day) {
      day = {
        id: uid('day'),
        name: dayName,
        focus: cellText(focusIndex >= 0 ? row[focusIndex] : ''),
        exercises: [],
      }
      days.set(dayName, day)
    } else if (!day.focus) {
      day.focus = cellText(focusIndex >= 0 ? row[focusIndex] : '')
    }

    const rawSets = cellText(setsIndex >= 0 ? row[setsIndex] : '')
    const sets = rawSets ? clampNumber(numberFrom(rawSets, 3), 1, 50) : 3
    const rawReps = cellText(repsIndex >= 0 ? row[repsIndex] : '')
    const reps = rawReps ? rawReps.replace(/\.0$/, '') : '10'
    const rawRest = cellText(restIndex >= 0 ? row[restIndex] : '')
    const restSeconds = parseRestSeconds(rawRest, 60)
    const catalogHint = cellText(catalogIndex >= 0 ? row[catalogIndex] : '')
    const catalogItem =
      (catalogHint && (byId.get(catalogHint) ?? byName.get(normalizeHeader(catalogHint)))) ||
      byName.get(normalizeHeader(name))

    if (!rawSets) warnings.push(`Fila ${index + 1}: sin series, se usaron 3.`)
    if (!rawReps) warnings.push(`Fila ${index + 1}: sin reps, se usaron 10.`)
    if (!rawRest) warnings.push(`Fila ${index + 1}: sin descanso, se usaron 60 s.`)

    const exercise: Exercise = {
      id: uid('ex'),
      name,
      sets,
      reps,
      rest: `${restSeconds} s`,
      restSeconds,
      catalogId: catalogItem?.id ?? null,
      notes: cellText(notesIndex >= 0 ? row[notesIndex] : '') || undefined,
    }
    day.exercises.push(exercise)
    exercises += 1
  }

  if (exercises === 0) {
    throw new Error('No encontré ejercicios con nombre. Revisa que la columna «Ejercicio» tenga datos.')
  }

  const meta = {
    ...metaFromRows(options.metaRows ?? []),
    ...metaFromRows(valid.slice(0, headerIndex)),
  }
  const firstRow = valid[headerIndex + 1] ?? []
  const columnMeta: Record<string, unknown> = {}
  if (routineIndex >= 0 && cellText(firstRow[routineIndex])) columnMeta.name = firstRow[routineIndex]
  if (goalIndex >= 0 && cellText(firstRow[goalIndex])) columnMeta.goal = firstRow[goalIndex]
  if (levelIndex >= 0 && cellText(firstRow[levelIndex])) columnMeta.level = firstRow[levelIndex]
  if (weeksIndex >= 0 && cellText(firstRow[weeksIndex])) columnMeta.weeks = firstRow[weeksIndex]

  const fallback = options.fallbackName.trim() || 'Rutina importada'
  const name = cellText(meta.name) || cellText(columnMeta.name) || fallback
  const goal = cellText(meta.goal) || cellText(columnMeta.goal) || 'Salud general'
  const level = parseLevel(cellText(meta.level) || cellText(columnMeta.level))
  const weeks = clampNumber(numberFrom(meta.weeks ?? columnMeta.weeks, 4), 1, 52)

  const draft: RoutineDraft = {
    name,
    goal,
    level,
    weeks,
    days: Array.from(days.values()),
  }

  if (draft.days.length > 14) {
    warnings.push(`El archivo trae ${draft.days.length} días; revisa que cada nombre de día sea correcto.`)
  }

  return { draft, warnings }
}

export async function parseRoutineFile(
  file: File,
  options: ParseOptions,
): Promise<ParsedRoutine> {
  const lower = file.name.toLowerCase()
  let rows: unknown[][]
  let metaRows: unknown[][] | undefined

  if (lower.endsWith('.csv') || lower.endsWith('.txt')) {
    rows = parseCsv(await file.text())
  } else if (lower.endsWith('.xlsx')) {
    const { default: readXlsxFile } = await import('read-excel-file/browser')
    const sheets = await readXlsxFile(file)
    if (sheets.length === 0) throw new Error('El libro no tiene hojas.')
    const main =
      sheets.find((sheet) => normalizeHeader(sheet.sheet) === 'rutina') ??
      sheets.find((sheet) => normalizeHeader(sheet.sheet) !== 'datos') ??
      sheets[0]
    rows = main.data
    const meta = sheets.find((sheet) =>
      ['datos', 'info', 'metadata'].includes(normalizeHeader(sheet.sheet)),
    )
    if (meta) metaRows = meta.data
  } else {
    throw new Error('Formato no compatible. Usa un archivo .xlsx o .csv.')
  }

  return parseRoutineRows(rows, { ...options, metaRows: metaRows ?? options.metaRows })
}

export async function downloadRoutineTemplate() {
  const { default: writeXlsxFile } = await import('write-excel-file/browser')
  const rows = [
    ['Rutina', 'Fuerza · bloque de 4 semanas'],
    ['Objetivo', 'Fuerza'],
    ['Nivel', 'Intermedio'],
    ['Semanas', 4],
    [],
    ['Día', 'Enfoque', 'Ejercicio', 'Series', 'Reps', 'Descanso (s)', 'Notas'],
    ['Día 1 · Tren superior', 'Empuje', 'Press de banca', 4, 8, 90, 'Deja 2 repeticiones en reserva.'],
    ['Día 1 · Tren superior', 'Espalda', 'Remo con barra', 4, 10, 75, ''],
    ['Día 1 · Tren superior', 'Core', 'Plancha abdominal', 3, 30, 45, 'Segundos por serie.'],
    ['Día 2 · Tren inferior', 'Piernas', 'Sentadilla con barra', 4, 8, 120, ''],
    ['Día 2 · Tren inferior', 'Piernas', 'Zancadas con mancuernas', 3, 12, 60, ''],
    ['Día 2 · Tren inferior', 'Bíceps', 'Curl de bíceps', 3, 12, 45, ''],
  ]
  await writeXlsxFile(rows, { sheet: 'Rutina' }).toFile('plantilla-rutina.xlsx')
}

export const routineFromDraft = (draft: RoutineDraft, id: string, updatedAt: string): Routine => ({
  id,
  name: draft.name.trim() || 'Rutina importada',
  goal: draft.goal.trim() || 'Salud general',
  level: draft.level,
  weeks: draft.weeks,
  assignedTo: [],
  updatedAt,
  days: draft.days,
})
