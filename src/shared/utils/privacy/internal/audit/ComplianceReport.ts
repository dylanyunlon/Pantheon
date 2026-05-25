import type { AuditSummary, AuditLog } from "./AuditLog"
import type { PiiFieldCategory } from "../PiiCacheKey"

export interface ComplianceViolation {
  fieldPath: string
  category: PiiFieldCategory
  value: string
  source: string
  severity: "critical" | "warning" | "info"
  description: string
  detectedAt: number
}

export interface ComplianceReport {
  generatedAt: number
  scanDurationMs: number
  totalFieldsScanned: number
  totalViolationsFound: number
  violations: ComplianceViolation[]
  auditSummary: AuditSummary
  complianceScore: number
  recommendations: string[]
}

export function generateComplianceReport(
  auditLog: AuditLog,
  violations: ComplianceViolation[],
  totalFieldsScanned: number,
  scanStartTime: number,
): ComplianceReport {
  const auditSummary = auditLog.getSummary()
  const criticalCount = violations.filter(v => v.severity === "critical").length
  const warningCount = violations.filter(v => v.severity === "warning").length

  let complianceScore = 100
  complianceScore -= criticalCount * 20
  complianceScore -= warningCount * 5
  complianceScore = Math.max(0, Math.min(100, complianceScore))

  const recommendations: string[] = []
  if (criticalCount > 0) {
    recommendations.push("Critical PII leaks detected. Enable scrubbing for all export paths.")
  }
  if (warningCount > 0) {
    recommendations.push("Review warning-level fields for potential PII exposure.")
  }
  if (auditSummary.totalOperations === 0) {
    recommendations.push("No scrub operations recorded. Verify privacy scrubber is active.")
  }
  if (complianceScore === 100) {
    recommendations.push("Full compliance. Continue monitoring with periodic scans.")
  }

  const categoryViolations = new Map<string, number>()
  for (const v of violations) {
    categoryViolations.set(v.category, (categoryViolations.get(v.category) || 0) + 1)
  }
  for (const [category, count] of categoryViolations) {
    if (count > 3) {
      recommendations.push(
        `High frequency of ${category} violations (${count}). Consider adding field-level rules.`
      )
    }
  }

  return {
    generatedAt: Date.now(),
    scanDurationMs: Date.now() - scanStartTime,
    totalFieldsScanned,
    totalViolationsFound: violations.length,
    violations,
    auditSummary,
    complianceScore,
    recommendations,
  }
}

export function formatComplianceReport(report: ComplianceReport): string {
  const lines: string[] = []
  lines.push(`Privacy Compliance Report`)
  lines.push(`Generated: ${new Date(report.generatedAt).toISOString()}`)
  lines.push(`Score: ${report.complianceScore}/100`)
  lines.push(`Fields Scanned: ${report.totalFieldsScanned}`)
  lines.push(`Violations: ${report.totalViolationsFound}`)
  lines.push(`Scan Duration: ${report.scanDurationMs}ms`)
  lines.push(``)
  if (report.violations.length > 0) {
    lines.push(`Violations:`)
    for (const v of report.violations) {
      lines.push(`  [${v.severity.toUpperCase()}] ${v.fieldPath} (${v.category}): ${v.description}`)
    }
    lines.push(``)
  }
  lines.push(`Recommendations:`)
  for (const r of report.recommendations) {
    lines.push(`  - ${r}`)
  }
  return lines.join("\n")
}
