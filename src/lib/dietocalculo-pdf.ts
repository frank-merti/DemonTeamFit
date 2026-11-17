import { jsPDF } from 'jspdf'
import {
  aportesTotales,
  adecuacion,
  FACTORES_ACTIVIDAD,
  GRUPOS_EQUIVALENTES,
  TIEMPOS,
} from './dietocalculo'
import type { MacrosPct, Raciones } from './dietocalculo'

/**
 * Entrega del dietocálculo en PDF (0.27.5): genera el documento que el
 * coach entrega al cliente — se sube por la vía del plan en PDF
 * (meal-pdfs/) y aparece en «Mi alimentación» del portal. Un documento
 * limpio, en español, con la meta, las raciones y el menú por tiempos.
 */

export interface DietocalculoPdfInput {
  cliente: string
  coach: string
  fecha: string
  objetivoLabel: string
  actividadKey: string
  kcal: number
  gasto: number
  bmr: number
  macros: MacrosPct
  raciones: Raciones
}

const BRAND: [number, number, number] = [213, 55, 65]
const INK: [number, number, number] = [40, 36, 36]
const MUTED: [number, number, number] = [128, 118, 115]
const CANVAS: [number, number, number] = [248, 245, 244]

const fmt = (n: number) => n.toLocaleString('es-MX')

export function dietocalculoPdf(input: DietocalculoPdfInput): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const M = 16
  const W = 210 - M * 2
  let y = 20

  const aporte = aportesTotales(input.raciones)
  const actividad = FACTORES_ACTIVIDAD.find((a) => a.key === input.actividadKey)?.label ?? input.actividadKey

  /* Encabezado */
  doc.setFont('helvetica', 'bold').setFontSize(15).setTextColor(...INK)
  doc.text('Entrenamiento', M, y)
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...MUTED)
  doc.text('Tu plan diario', 210 - M, y, { align: 'right' })
  y += 6
  doc.setDrawColor(...BRAND).setLineWidth(0.8)
  doc.line(M, y, 210 - M, y)
  y += 8

  doc.setFont('helvetica', 'bold').setFontSize(13).setTextColor(...INK)
  doc.text('Dietocálculo · Plan de alimentación', M, y)
  y += 7
  doc.setFont('helvetica', 'normal').setFontSize(10.5).setTextColor(...MUTED)
  doc.text(`Cliente: ${input.cliente}`, M, y)
  doc.text(`Fecha: ${input.fecha}`, 210 - M, y, { align: 'right' })
  y += 6
  doc.text(`Coach: ${input.coach}`, M, y)
  y += 9

  /* Meta */
  doc.setFillColor(...CANVAS)
  doc.roundedRect(M, y, W, 20, 2, 2, 'F')
  y += 6
  doc.setFont('helvetica', 'bold').setFontSize(10.5).setTextColor(...INK)
  doc.text(`Meta: ${fmt(input.kcal)} kcal al día`, M + 4, y)
  y += 5.5
  doc.setFont('helvetica', 'normal').setFontSize(9.5).setTextColor(...MUTED)
  doc.text(
    `${input.objetivoLabel} · Actividad ${actividad} · Gasto ${fmt(Math.round(input.gasto))} kcal · BMR ${fmt(Math.round(input.bmr))} kcal`,
    M + 4, y,
  )
  y += 11

  /* Macros objetivo vs reparto */
  doc.setFont('helvetica', 'bold').setFontSize(10.5).setTextColor(...INK)
  doc.text('Macros', M, y)
  y += 6
  const macroCols: Array<[string, number, number]> = [
    ['Carbohidratos', input.macros.cho, aporte.cho],
    ['Proteína', input.macros.pro, aporte.pro],
    ['Grasas', input.macros.lip, aporte.lip],
  ]
  const colW = W / 3
  macroCols.forEach(([label, objetivo, ap], i) => {
    const x = M + i * colW
    doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...MUTED)
    doc.text(label, x, y)
    doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(...INK)
    doc.text(`${fmt(Math.round(objetivo))} g`, x, y + 5.5)
    doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(...MUTED)
    doc.text(`reparto ${fmt(Math.round(ap))} g · ${adecuacion(ap, objetivo)}%`, x, y + 10)
  })
  y += 15

  /* Raciones por grupo */
  doc.setFont('helvetica', 'bold').setFontSize(10.5).setTextColor(...INK)
  doc.text('Raciones por grupo de alimentos', M, y)
  y += 6

  const col = [46, 22, W - 46 - 22] // Grupo | Rac. | 1 ración ≈
  doc.setFillColor(...BRAND)
  doc.rect(M, y, W, 7, 'F')
  doc.setFont('helvetica', 'bold').setFontSize(8.5).setTextColor(255, 255, 255)
  doc.text('Grupo', M + 2, y + 4.8)
  doc.text('Rac.', M + col[0], y + 4.8)
  doc.text('1 ración equivale a', M + col[0] + col[1], y + 4.8)
  doc.text('kcal', 210 - M, y + 4.8, { align: 'right' })
  y += 7

  GRUPOS_EQUIVALENTES.forEach((g, i) => {
    const q = input.raciones[g.key] ?? 0
    if (i % 2 === 0) {
      doc.setFillColor(...CANVAS)
      doc.rect(M, y, W, 6.5, 'F')
    }
    doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...INK)
    doc.text(g.label, M + 2, y + 4.5)
    doc.setFont('helvetica', 'bold').setTextColor(...BRAND)
    doc.text(String(q), M + col[0] + col[1] / 2, y + 4.5, { align: 'center' })
    doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(...MUTED)
    doc.text(g.serving, M + col[0] + col[1] + 1, y + 4.5)
    doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...INK)
    doc.text(String(g.kcal * q), 210 - M, y + 4.5, { align: 'right' })
    y += 6.5
  })
  doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(...INK)
  doc.text('Total', M + 2, y + 4.5)
  doc.text(`${fmt(Math.round(aporte.kcal))} kcal`, 210 - M, y + 4.5, { align: 'right' })
  doc.setDrawColor(...MUTED).setLineWidth(0.3)
  doc.line(M, y, 210 - M, y)
  y += 10

  /* Menú por tiempos */
  if (y > 240) { doc.addPage(); y = 20 }
  doc.setFont('helvetica', 'bold').setFontSize(10.5).setTextColor(...INK)
  doc.text('Menú por tiempos', M, y)
  y += 6

  const tc = W / (TIEMPOS.length + 1)
  doc.setFillColor(...BRAND)
  doc.rect(M, y, W, 7, 'F')
  doc.setFont('helvetica', 'bold').setFontSize(8).setTextColor(255, 255, 255)
  doc.text('Grupo', M + 1.5, y + 4.8)
  TIEMPOS.forEach((t, i) => {
    doc.text(t.label.replace(' 1', ' 1').replace(' 2', ' 2'), M + tc * (i + 1) + tc / 2, y + 4.8, { align: 'center' })
  })
  y += 7

  const reparto: Record<string, Record<string, number>> = {}
  for (const g of GRUPOS_EQUIVALENTES) {
    const total = input.raciones[g.key] ?? 0
    if (total <= 0) continue
    const raw = TIEMPOS.map((t) => total * t.share)
    const floors = raw.map(Math.floor)
    let left = total - floors.reduce((a, b) => a + b, 0)
    const order = raw.map((v, i) => ({ i, frac: v - Math.floor(v) })).sort((a, b) => b.frac - a.frac)
    let cursor = 0
    while (left > 0) { floors[order[cursor % order.length].i] += 1; left -= 1; cursor += 1 }
    const row: Record<string, number> = {}
    TIEMPOS.forEach((t, i) => { row[t.key] = floors[i] })
    reparto[g.key] = row
  }

  GRUPOS_EQUIVALENTES.filter((g) => reparto[g.key]).forEach((g, i) => {
    if (i % 2 === 0) {
      doc.setFillColor(...CANVAS)
      doc.rect(M, y, W, 6.5, 'F')
    }
    doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...INK)
    doc.text(g.label, M + 1.5, y + 4.5)
    TIEMPOS.forEach((t, j) => {
      const v = reparto[g.key]?.[t.key] ?? 0
      if (v > 0) {
        doc.setFont('helvetica', 'bold').setTextColor(...BRAND)
        doc.text(String(v), M + tc * (j + 1) + tc / 2, y + 4.5, { align: 'center' })
      }
    })
    y += 6.5
  })
  y += 4
  doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(...MUTED)
  doc.text('Los números son raciones por tiempo de comida, con el reparto estándar del plan.', M, y)
  y += 8

  /* Nota al pie */
  doc.setFillColor(...CANVAS)
  doc.roundedRect(M, y, W, 16, 2, 2, 'F')
  y += 5.5
  doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(...INK)
  doc.text('Notas de tu coach', M + 4, y)
  y += 5
  doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(...MUTED)
  doc.text(
    'Estas raciones son el punto de partida de tu plan: síguelas tal como quedaron',
    M + 4, y,
  )
  y += 4.5
  doc.text('repartidas y ajusta cualquier duda con tu coach por WhatsApp.', M + 4, y)

  /* Pie de página */
  doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...MUTED)
  doc.text('Entrenamiento · Tu plan diario', M, 288)
  doc.text('Página 1 de 1', 210 - M, 288, { align: 'right' })

  return doc
}
