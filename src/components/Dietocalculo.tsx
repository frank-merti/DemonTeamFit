import { useEffect, useMemo, useState } from 'react'
import { Calculator, ChevronDown, Minus, Plus, Printer, RotateCcw, Send } from 'lucide-react'
import {
  aportesTotales,
  adecuacion,
  adecuacionTone,
  macrosDeKcal,
  metaKcal,
  mifflinStJeor,
  proteinaOk,
  racionesSugeridas,
  repartoPorTiempos,
  tdee,
  FACTORES_ACTIVIDAD,
  GRUPOS_EQUIVALENTES,
  PRESETS_MACROS,
  TIEMPOS,
} from '../lib/dietocalculo'
import type { ActividadKey, Objetivo, Raciones, Sex } from '../lib/dietocalculo'
import { dietocalculoPdf } from '../lib/dietocalculo-pdf'
import { useApp } from '../store/AppStore'
import { useScopedClients } from '../lib/hooks'
import { anthroPlanLabel, hasFullAnthro } from '../lib/plans'
import { Badge, Button, Card, Field, Progress, cx, inputClass, selectCompact } from './ui'

/**
 * Dietocálculo (0.27.4): herramienta del coach dentro de Planes de
 * alimentación. Convierte la meta del cliente en raciones por grupo de
 * alimentos con barras de adecuación por macro. Cálculo al momento, sin
 * guardar nada; se imprime para entregarlo al cliente.
 */

const FORM_STATE = {
  sexo: 'M' as Sex,
  edad: '',
  estatura: '',
  peso: '',
  actividad: 'moderado' as ActividadKey,
  objetivo: 'perder' as Objetivo,
}

export function Dietocalculo() {
  const { currentUser, uploadMealPdf } = useApp()
  const clients = useScopedClients()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(FORM_STATE)
  const [presetKey, setPresetKey] = useState<string>('perder')
  const [libre, setLibre] = useState({ cho: 50, pro: 30, lip: 20 })
  const [kcalManual, setKcalManual] = useState<number | null>(null)
  const [raciones, setRaciones] = useState<Raciones>({})
  const [clienteId, setClienteId] = useState('')
  const [pdfBusy, setPdfBusy] = useState(false)
  const [entregadoA, setEntregadoA] = useState<string | null>(null)

  const peso = Number(form.peso)
  const estatura = Number(form.estatura)
  const edad = Number(form.edad)
  const datosCompletos = peso > 0 && estatura > 0 && edad > 0

  // Cadena derivada memoizada: sin esto, los objetos nuevos en cada render
  // disparan el efecto de raciones en bucle (Maximum update depth).
  const bmr = useMemo(
    () => (datosCompletos ? mifflinStJeor(form.sexo, peso, estatura, edad) : null),
    [datosCompletos, form.sexo, peso, estatura, edad],
  )
  const gasto = useMemo(
    () => (bmr !== null ? tdee(bmr, form.actividad) : null),
    [bmr, form.actividad],
  )
  const kcalCalculada = useMemo(
    () => (gasto !== null && bmr !== null ? metaKcal(gasto, bmr, form.objetivo) : null),
    [gasto, bmr, form.objetivo],
  )
  const kcal = kcalManual ?? kcalCalculada

  const preset = PRESETS_MACROS.find((p) => p.key === presetKey)
  const pct = useMemo(
    () => (preset ? { cho: preset.cho, pro: preset.pro, lip: preset.lip } : libre),
    [preset, libre.cho, libre.pro, libre.lip],
  )
  const pctValida = Math.abs(pct.cho + pct.pro + pct.lip - 100) <= 0.5
  const macros = useMemo(
    () => (kcal && pctValida ? macrosDeKcal(kcal, pct) : null),
    [kcal, pctValida, pct.cho, pct.pro, pct.lip],
  )

  const sugerencia = useMemo(
    () => (kcal && macros ? racionesSugeridas(kcal, macros) : null),
    [kcal, macros],
  )

  // Al cambiar la meta o el reparto, las raciones vuelven a la sugerencia.
  useEffect(() => {
    if (sugerencia) setRaciones(sugerencia)
  }, [sugerencia])

  const aporte = useMemo(() => aportesTotales(raciones), [raciones])
  const tiempoRows = useMemo(() => repartoPorTiempos(raciones), [raciones])

  const setRacion = (key: string, value: number) =>
    setRaciones((r) => ({ ...r, [key]: Math.max(0, Math.min(99, value)) }))

  /** Entrega al cliente (0.27.5): genera el PDF y lo sube por la vía del
   * plan en PDF; el cliente lo ve en «Mi alimentación» de su portal. */
  const entregar = async () => {
    const cliente = clients.find((c) => c.id === clienteId)
    if (!cliente || !kcal || !macros || bmr === null || gasto === null || sugerencia === null) return
    setPdfBusy(true)
    const objetivoLabel = { mantener: 'Mantener peso', perder: 'Perder grasa (−20%)', ganar: 'Ganar músculo (+10%)' }[form.objetivo]
    const doc = dietocalculoPdf({
      cliente: cliente.name,
      coach: currentUser?.name ?? 'Entrenamiento',
      fecha: new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }),
      objetivoLabel,
      actividadKey: form.actividad,
      kcal,
      gasto,
      bmr,
      macros,
      raciones,
    })
    const slug = cliente.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    const file = new File([doc.output('blob')], `dietocalculo-${slug || 'cliente'}.pdf`, { type: 'application/pdf' })
    const ok = await uploadMealPdf(cliente.id, file)
    setPdfBusy(false)
    if (ok) setEntregadoA(cliente.name)
  }

  const toneClass = { good: 'text-emerald-600 dark:text-emerald-400', warn: 'text-warn', bad: 'text-danger' }

  return (
    <Card>
      <div className="flex flex-col gap-3 border-b border-line p-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[18px] font-semibold tracking-tight">Dietocálculo</h2>
            <Badge tone="brand">VIP</Badge>
          </div>
          <p className="mt-1 text-[12.5px] text-muted">
            Convierte la meta del cliente en raciones por grupo de alimentos, con adecuación por macro.
          </p>
        </div>
        <Button size="sm" variant="secondary" onClick={() => setOpen((v) => !v)}>
          <Calculator size={14} /> {open ? 'Cerrar' : 'Abrir dietocálculo'}
          <ChevronDown size={14} className={cx('transition-transform', open && 'rotate-180')} />
        </Button>
      </div>

      {open && (
        <div className="p-5">
          {/* Datos del cliente */}
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Sexo">
              <select
                className={inputClass}
                value={form.sexo}
                onChange={(e) => { setForm({ ...form, sexo: e.target.value as Sex }); setKcalManual(null) }}
              >
                <option value="M">Masculino</option>
                <option value="F">Femenino</option>
              </select>
            </Field>
            <Field label="Edad (años)">
              <input className={inputClass} type="number" min={1} placeholder="30" value={form.edad}
                onChange={(e) => { setForm({ ...form, edad: e.target.value }); setKcalManual(null) }} />
            </Field>
            <Field label="Estatura (cm)">
              <input className={inputClass} type="number" min={1} placeholder="172" value={form.estatura}
                onChange={(e) => { setForm({ ...form, estatura: e.target.value }); setKcalManual(null) }} />
            </Field>
            <Field label="Peso (kg)">
              <input className={inputClass} type="number" min={1} step="0.1" placeholder="82.6" value={form.peso}
                onChange={(e) => { setForm({ ...form, peso: e.target.value }); setKcalManual(null) }} />
            </Field>
            <Field label="Actividad">
              <select
                className={inputClass}
                value={form.actividad}
                onChange={(e) => { setForm({ ...form, actividad: e.target.value as ActividadKey }); setKcalManual(null) }}
              >
                {FACTORES_ACTIVIDAD.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
              </select>
            </Field>
            <Field label="Objetivo">
              <select
                className={inputClass}
                value={form.objetivo}
                onChange={(e) => { setForm({ ...form, objetivo: e.target.value as Objetivo }); setKcalManual(null) }}
              >
                <option value="mantener">Mantener peso</option>
                <option value="perder">Perder grasa (−20%)</option>
                <option value="ganar">Ganar músculo (+10%)</option>
              </select>
            </Field>
            <Field label="Meta (kcal) · se recalcula sola">
              <input
                className={inputClass}
                type="number" min={0} step={10}
                value={kcal ?? ''}
                onChange={(e) => setKcalManual(Number(e.target.value))}
              />
            </Field>
          </div>

          {/* Resultado del gasto */}
          {bmr !== null && gasto !== null && kcalCalculada !== null && (
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                ['Gasto (TDEE)', Math.round(gasto), 'kcal'],
                ['Meta', kcal, 'kcal'],
                ['BMR', Math.round(bmr), 'kcal'],
                ['Proteína', macros ? `${(macros.pro / peso).toFixed(1)}` : '—', 'g/kg'],
              ].map(([label, value, unit]) => (
                <div key={label as string} className="rounded-xl bg-canvas px-3 py-2.5">
                  <p className="text-[10.5px] text-muted">{label}</p>
                  <p className="text-[16px] font-semibold">
                    {value} <span className="text-[10px] font-normal text-muted">{unit}</span>
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Reparto de macros */}
          <div className="mt-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Reparto de macros</p>
            <div className="mt-2 flex flex-wrap items-start gap-2">
              {PRESETS_MACROS.map((p) => (
                <button
                  key={p.key}
                  onClick={() => { setPresetKey(p.key); setKcalManual(null) }}
                  className={cx(
                    'rounded-xl border px-3 py-2 text-left transition-all',
                    presetKey === p.key ? 'border-brand ring-2 ring-brand/10' : 'border-line hover:border-brand/40',
                  )}
                >
                  <p className="text-[12.5px] font-semibold">{p.label}</p>
                  <p className="text-[10px] text-muted">{p.label_full}</p>
                </button>
              ))}
              <button
                onClick={() => { setPresetKey('libre'); setKcalManual(null) }}
                className={cx(
                  'rounded-xl border px-3 py-2 text-left transition-all',
                  presetKey === 'libre' ? 'border-brand ring-2 ring-brand/10' : 'border-line hover:border-brand/40',
                )}
              >
                <p className="text-[12.5px] font-semibold">Libre</p>
                <p className="text-[10px] text-muted">% propios</p>
              </button>
              {presetKey === 'libre' && (
                <div className="grid grid-cols-3 gap-1.5">
                  {(['cho', 'pro', 'lip'] as const).map((k) => (
                    <input
                      key={k}
                      className={cx(inputClass, 'h-10 w-16 px-2 py-1 text-center text-[12.5px]')}
                      type="number" min={0} max={100} value={libre[k]}
                      onChange={(e) => setLibre({ ...libre, [k]: Number(e.target.value) })}
                      aria-label={`% ${k === 'cho' ? 'carbohidratos' : k === 'pro' ? 'proteína' : 'grasas'}`}
                    />
                  ))}
                </div>
              )}
              {!pctValida && <p className="self-center text-[11px] text-warn">Los % deben sumar 100</p>}
            </div>
          </div>

          {/* Tabla de grupos con raciones */}
          {datosCompletos && macros && kcal && pctValida && (
            <>
              <div className="mt-5 overflow-x-auto">
                <table className="w-full min-w-[560px] text-[12px]">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wider text-muted">
                      <th className="pb-1 text-left font-medium">Grupo</th>
                      <th className="pb-1 text-left font-medium">1 ración ≈</th>
                      <th className="pb-1 text-center font-medium">Raciones</th>
                      <th className="pb-1 text-right font-medium">kcal</th>
                      <th className="pb-1 text-right font-medium">C</th>
                      <th className="pb-1 text-right font-medium">P</th>
                      <th className="pb-1 text-right font-medium">G</th>
                    </tr>
                  </thead>
                  <tbody>
                    {GRUPOS_EQUIVALENTES.map((g) => {
                      const q = raciones[g.key] ?? 0
                      return (
                        <tr key={g.key} className="border-t border-line">
                          <td className="py-1.5 font-medium">{g.label}</td>
                          <td className="py-1.5 text-[11px] text-muted">{g.serving}</td>
                          <td className="py-1.5">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                onClick={() => setRacion(g.key, q - 1)}
                                className="grid h-6 w-6 place-items-center rounded-lg border border-line text-muted hover:border-brand hover:text-brand"
                                aria-label={`Quitar una ración de ${g.label}`}
                              >
                                <Minus size={12} />
                              </button>
                              <span className="w-6 text-center font-semibold tabular-nums">{q}</span>
                              <button
                                onClick={() => setRacion(g.key, q + 1)}
                                className="grid h-6 w-6 place-items-center rounded-lg border border-line text-muted hover:border-brand hover:text-brand"
                                aria-label={`Agregar una ración de ${g.label}`}
                              >
                                <Plus size={12} />
                              </button>
                            </div>
                          </td>
                          <td className="py-1.5 text-right tabular-nums">{g.kcal * q}</td>
                          <td className="py-1.5 text-right tabular-nums text-muted">{g.cho * q || '—'}</td>
                          <td className="py-1.5 text-right tabular-nums text-muted">{g.pro * q || '—'}</td>
                          <td className="py-1.5 text-right tabular-nums text-muted">{g.lip * q || '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Adecuación por macro */}
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {([
                  ['Carbohidratos', aporte.cho, macros.cho],
                  ['Proteína', aporte.pro, macros.pro],
                  ['Grasas', aporte.lip, macros.lip],
                ] as const).map(([label, ap, objetivo]) => {
                  const p = adecuacion(ap, objetivo)
                  const tone = adecuacionTone(p)
                  const barTone = tone === 'bad' ? 'danger' : tone
                  return (
                    <div key={label} className="rounded-xl border border-line px-3 py-2.5">
                      <div className="flex items-center justify-between">
                        <p className="text-[11.5px] font-medium">{label}</p>
                        <p className={cx('text-[11.5px] font-semibold tabular-nums', toneClass[tone])}>
                          {p}% de adecuación
                        </p>
                      </div>
                      <Progress value={Math.min(p, 100)} tone={barTone} className="mt-2" />
                      <p className="mt-1 text-[10.5px] text-muted">
                        {Math.round(ap)} g aportados · {objetivo} g objetivo
                      </p>
                    </div>
                  )
                })}
              </div>

              {/* Menú por tiempos (v1, solo lectura) */}
              <div className="mt-4">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                  Menú por tiempos · reparto estándar
                </p>
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full min-w-[420px] text-[12px]">
                    <thead>
                      <tr className="text-[10px] uppercase tracking-wider text-muted">
                        <th className="pb-1 text-left font-medium">Grupo</th>
                        {TIEMPOS.map((t) => (
                          <th key={t.key} className="pb-1 text-center font-medium">{t.label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {GRUPOS_EQUIVALENTES.filter((g) => (raciones[g.key] ?? 0) > 0).map((g) => (
                        <tr key={g.key} className="border-t border-line">
                          <td className="py-1.5 font-medium">{g.label}</td>
                          {TIEMPOS.map((t) => (
                            <td key={t.key} className="py-1.5 text-center tabular-nums">
                              {tiempoRows[g.key]?.[t.key] || '—'}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Entrega al cliente (0.27.5): PDF directo a su portal. */}
              <div className="mt-4 rounded-2xl border border-line p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[12px] font-semibold">Entregar al cliente</p>
                  <Badge tone="brand">PDF</Badge>
                </div>
                <p className="mt-1 text-[11px] text-muted">
                  Genera este dietocálculo en PDF y lo deja en «Mi alimentación» del cliente.
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <select
                    aria-label="Entregar a cliente"
                    className={cx(selectCompact, 'h-9 py-1 text-[12px]')}
                    value={clienteId}
                    onChange={(e) => { setClienteId(e.target.value); setEntregadoA(null) }}
                  >
                    <option value="">Elegir cliente…</option>
                    {clients.filter((c) => !c.archived).map((c) => {
                      const conflict = !hasFullAnthro(c) && Boolean(c.routineId)
                      return (
                        <option key={c.id} value={c.id} disabled={conflict}>
                          {c.name} · {anthroPlanLabel(c)}{conflict ? ' — ya tiene rutina (Básico)' : ''}
                        </option>
                      )
                    })}
                  </select>
                  <Button size="sm" disabled={!clienteId || pdfBusy} onClick={entregar}>
                    <Send size={14} /> Entregar PDF
                  </Button>
                  {entregadoA && (
                    <p className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                      Entregado a {entregadoA.split(' ')[0]} · aparece en su portal «Mi alimentación».
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <p className="max-w-md text-[11px] leading-relaxed text-muted">
                  Las raciones son punto de partida; ajusta con tu criterio clínico y
                  transcribe al plan o PDF del cliente.
                </p>
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setRaciones(sugerencia ?? {})}>
                    <RotateCcw size={14} /> Restaurar sugerencia
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => window.print()}>
                    <Printer size={14} /> Imprimir dietocálculo
                  </Button>
                </div>
              </div>
            </>
          )}

          {(!datosCompletos || !pctValida) && (
            <p className="mt-4 rounded-xl bg-canvas px-3 py-2.5 text-[11.5px] text-muted">
              Completa peso, estatura y edad del cliente para calcular la meta y las raciones.
            </p>
          )}
          {datosCompletos && macros && !proteinaOk(macros.pro, peso, form.objetivo) && (
            <p className="mt-2 rounded-xl bg-warn-soft px-3 py-2.5 text-[11.5px] leading-snug text-warn">
              La proteína del reparto queda bajo 1.2 g/kg; sube la proteína del objetivo para proteger la masa muscular.
            </p>
          )}
        </div>
      )}
    </Card>
  )
}
