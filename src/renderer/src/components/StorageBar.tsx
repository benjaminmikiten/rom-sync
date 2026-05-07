import React from 'react'

interface Props {
  available: number
  total: number
  projectedAdd: number
}

function fmt(bytes: number): string {
  return `${(bytes / 1_073_741_824).toFixed(2)} GB`
}

export function StorageBar({ available, total, projectedAdd }: Props): React.JSX.Element {
  const used = total - available
  const projectedUsed = used + projectedAdd
  const overflow = projectedUsed > total
  const usedPct = Math.min((used / total) * 100, 100)
  const addPct = Math.min((projectedAdd / total) * 100, 100 - usedPct)

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#888', marginBottom: 6 }}>
        <span>Used: {fmt(used)}</span>
        <span>After sync: {fmt(projectedUsed)}</span>
        <span>Total: {fmt(total)}</span>
      </div>
      <div style={{ height: 12, background: '#2a2a2a', borderRadius: 6, overflow: 'hidden', display: 'flex' }}>
        <div style={{ width: `${usedPct}%`, background: '#4a9eff' }} />
        <div style={{ width: `${addPct}%`, background: overflow ? '#f44336' : '#4caf50' }} />
      </div>
      {overflow && (
        <div style={{ color: '#f44336', fontSize: 12, marginTop: 6 }}>
          Insufficient space: need {fmt(projectedAdd)}, only {fmt(available)} available
        </div>
      )}
    </div>
  )
}
