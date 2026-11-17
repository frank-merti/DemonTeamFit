import { useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Upload } from 'lucide-react'
import type { ExerciseCatalogItem, Routine } from '../types'
import { todayISO } from '../lib/format'
import {
  downloadRoutineTemplate, parseRoutineFile, routineFromDraft, type RoutineDraft,
} from '../lib/routineImport'
import { Button, Field, Modal, cx, inputClass } from './ui'

type Props = {
  open: boolean
  onClose: () => void
  catalog: ExerciseCatalogItem[]
  onSave: (routine: Routine) => Promise<{ ok: boolean; error?: string }>
  onSaved: (routine: Routine) => void
}

const newId = () =>
  `r-${Date.now().toString(36)}${Math.random().toString(16).slice(2, 5)}`

export default function ImportRoutineModal({ open, onClose, catalog, onSave, onSaved }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [draft, setDraft] = useState<RoutineDraft | null>(null)
  const [fileName, setFileName] = useState('')
  const [warnings, setWarnings] = useState<string[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [templateBusy, setTemplateBusy] = useState(false)

  const handleFile = async (file?: File) => {
    if (!file) return
    setError('')
    setWarnings([])
    if (file.size > 5 * 1024 * 1024) {
      setError('El archivo supera 5 MB. Divide la rutina en bloques más pequeños.')
      return
    }
    setBusy(true)
    try {
      const parsed = await parseRoutineFile(file, {
        catalog,
        fallbackName: file.name.replace(/\.[^.]+$/, ''),
      })
      setDraft(parsed.draft)
      setWarnings(parsed.warnings)
      setFileName(file.name)
    } catch (err) {
      setDraft(null)
      setWarnings([])
      setFileName('')
      setError(err instanceof Error ? err.message : 'No se pudo leer el archivo.')
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const downloadTemplate = async () => {
    setError('')
    setTemplateBusy(true)
    try {
      await downloadRoutineTemplate()
    } catch {
      setError('No se pudo generar la plantilla. Intenta de nuevo.')
    } finally {
      setTemplateBusy(false)
    }
  }

  const save = async () => {
    if (!draft) return
    if (!draft.name.trim()) {
      setError('Ponle un nombre a la rutina.')
      return
    }
    setBusy(true)
    setError('')
    const routine = routineFromDraft(draft, newId(), todayISO())
    const result = await onSave(routine)
    setBusy(false)
    if (!result.ok) {
      setError(result.error ?? 'No se pudo guardar la rutina importada.')
      return
    }
    onSaved(routine)
    onClose()
  }

  const exerciseCount = draft?.days.reduce((total, day) => total + day.exercises.length, 0) ?? 0

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Importar rutina"
      subtitle="Desde Excel (.xlsx) o CSV"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>Cancelar</Button>
          <Button size="sm" onClick={() => void save()} disabled={!draft || busy}>
            {busy ? 'Guardando…' : 'Guardar rutina'}
          </Button>
        </div>
      }
    >
      <div className="rounded-xl border border-line bg-canvas/60 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[12.5px] font-semibold">Plantilla oficial</p>
            <p className="text-[11px] text-muted">
              Incluye los encabezados y dos días de ejemplo.
            </p>
          </div>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => void downloadTemplate()}
            disabled={templateBusy}
          >
            <Download size={14} /> {templateBusy ? 'Generando…' : 'Descargar .xlsx'}
          </Button>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="sr-only"
        onChange={(event) => void handleFile(event.target.files?.[0])}
      />

      {!draft ? (
        <button
          onClick={() => inputRef.current?.click()}
          className={cx(
            'mt-3 flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-8 text-center transition-colors',
            busy ? 'border-line bg-canvas' : 'border-line bg-surface hover:border-brand/40 hover:bg-brand-soft/20',
          )}
          disabled={busy}
        >
          <span className="grid h-11 w-11 place-items-center rounded-full bg-brand-soft text-brand">
            {busy ? <FileSpreadsheet size={20} /> : <Upload size={20} />}
          </span>
          <span className="text-[13px] font-semibold">
            {busy ? 'Leyendo archivo…' : 'Elegir archivo .xlsx o .csv'}
          </span>
          <span className="text-[11px] text-muted">
            Arrastra el archivo o haz clic aquí. Nada se guarda hasta que confirmes.
          </span>
        </button>
      ) : (
        <>
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2">
            <FileSpreadsheet size={16} className="text-brand" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] font-medium">{fileName || 'Archivo importado'}</p>
              <p className="text-[10.5px] text-muted">
                {draft.days.length} día(s) · {exerciseCount} ejercicio(s)
              </p>
            </div>
            <Button size="sm" variant="ghost" onClick={() => inputRef.current?.click()}>
              Cambiar
            </Button>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Nombre de la rutina">
              <input
                className={inputClass}
                value={draft.name}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                placeholder="Ej. Fuerza · bloque de 4 semanas"
              />
            </Field>
            <Field label="Objetivo">
              <input
                className={inputClass}
                value={draft.goal}
                onChange={(event) => setDraft({ ...draft, goal: event.target.value })}
                placeholder="Ej. Fuerza"
              />
            </Field>
            <Field label="Nivel">
              <select
                className={inputClass}
                value={draft.level}
                onChange={(event) =>
                  setDraft({ ...draft, level: event.target.value as RoutineDraft['level'] })
                }
              >
                <option value="Principiante">Principiante</option>
                <option value="Intermedio">Intermedio</option>
                <option value="Avanzado">Avanzado</option>
              </select>
            </Field>
            <Field label="Semanas">
              <input
                className={inputClass}
                type="number"
                min={1}
                max={52}
                value={draft.weeks}
                onChange={(event) =>
                  setDraft({ ...draft, weeks: Math.min(52, Math.max(1, Number(event.target.value) || 1)) })
                }
              />
            </Field>
          </div>

          {warnings.length > 0 && (
            <div className="mt-3 rounded-xl bg-warn/10 px-3 py-2 text-[11.5px] text-ink">
              <p className="flex items-center gap-1.5 font-semibold">
                <AlertTriangle size={13} className="text-warn" /> Revisa estos avisos
              </p>
              <ul className="mt-1 list-inside list-disc space-y-0.5 text-muted">
                {warnings.slice(0, 4).map((warning) => <li key={warning}>{warning}</li>)}
                {warnings.length > 4 && <li>y {warnings.length - 4} aviso(s) más…</li>}
              </ul>
            </div>
          )}

          <div className="mt-3 overflow-hidden rounded-xl border border-line">
            <div className="flex items-center justify-between gap-2 border-b border-line bg-canvas px-3 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
                Vista previa
              </p>
              <span className="inline-flex items-center gap-1 text-[10.5px] text-muted">
                <CheckCircle2 size={12} className="text-brand" /> Enlazado a la biblioteca cuando coincide
              </span>
            </div>
            <div className="max-h-56 divide-y divide-line overflow-y-auto">
              {draft.days.map((day) => (
                <div key={day.id} className="px-3 py-2.5">
                  <p className="text-[12px] font-medium">
                    {day.name}
                    <span className="ml-1.5 text-[10.5px] font-normal text-muted">
                      {day.focus ? `${day.focus} · ` : ''}{day.exercises.length} ejercicios
                    </span>
                  </p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-muted">
                    {day.exercises
                      .map((exercise) => `${exercise.name} ${exercise.sets}×${exercise.reps} (${exercise.restSeconds}s)`)
                      .join(' · ')}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      <div className="mt-3 rounded-xl bg-canvas px-3 py-2 text-[10.5px] leading-relaxed text-muted">
        <p className="font-semibold text-ink">Columnas esperadas</p>
        <p>Día · Enfoque · Ejercicio · Series · Reps · Descanso (s) · Notas</p>
        <p className="mt-1">
          Opcionales: Rutina, Objetivo, Nivel, Semanas y Catálogo. El descanso acepta
          <strong> 90</strong>, <strong>1:30</strong> o <strong>1.5 min</strong>. Si un
          ejercicio coincide con la biblioteca, queda enlazado automáticamente.
        </p>
      </div>

      {error && (
        <p className="mt-3 rounded-xl bg-danger-soft px-3 py-2 text-[12px] text-danger">
          {error}
        </p>
      )}
    </Modal>
  )
}
