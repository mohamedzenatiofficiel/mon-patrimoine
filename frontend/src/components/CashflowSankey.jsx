const fmt = v =>
  new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(v) + ' €'

const CAT_COLORS = [
  '#c084fc', '#fb923c', '#818cf8', '#2dd4bf',
  '#f472b6', '#60a5fa', '#fbbf24', '#4ade80',
  '#f87171', '#38bdf8',
]
const COL0_COLOR = '#6366f1'
const COL1_COLOR = '#64748b'
const RESTE_COLOR = '#475569'

// ── Layout helpers ────────────────────────────────────────────────────
function computeYPositions(byCol, nodeVal, H, MARGIN_V, V_PAD) {
  const nodeY = {}
  const nodeH = {}
  byCol.forEach(colIdxs => {
    const totalVal = colIdxs.reduce((s, i) => s + (nodeVal[i] ?? 0), 0)
    const usedPad  = V_PAD * (colIdxs.length - 1)
    const availH   = H - 2 * MARGIN_V - usedPad
    let y = MARGIN_V
    colIdxs.forEach(i => {
      nodeH[i] = Math.max(4, totalVal > 0 ? (nodeVal[i] / totalVal) * availH : 4)
      nodeY[i] = y
      y += nodeH[i] + V_PAD
    })
  })
  return { nodeY, nodeH }
}

export default function CashflowSankey({ data, height = 420 }) {
  if (!data?.nodes?.length || !data?.links?.length) return null

  const { nodes, links } = data

  const W            = 960
  const H            = height
  const NODE_W_CAT   = 16  // col 2 categories
  const NODE_W_SUB   = 10  // col 3 subcategories
  const NODE_W_DEF   = 16  // col 0/1
  const V_PAD        = 8
  const MARGIN_LEFT  = 130
  const MARGIN_RIGHT = 210
  const MARGIN_V     = 14

  const getNodeW = (colIdx) => {
    if (colIdx === 2) return NODE_W_CAT
    if (colIdx === 3) return NODE_W_SUB
    return NODE_W_DEF
  }

  // ── Column assignment via BFS ────────────────────────────────────
  const inDeg = new Array(nodes.length).fill(0)
  links.forEach(l => inDeg[l.target]++)
  const col = nodes.map((_, i) => (inDeg[i] === 0 ? 0 : -1))
  let changed = true
  while (changed) {
    changed = false
    links.forEach(l => {
      if (col[l.source] >= 0 && col[l.target] !== col[l.source] + 1) {
        col[l.target] = col[l.source] + 1
        changed = true
      }
    })
  }
  const validCols = col.filter(c => c >= 0)
  if (!validCols.length) return null
  const numCols = Math.max(...validCols) + 1
  const byCol   = Array.from({ length: numCols }, () => [])
  nodes.forEach((_, i) => { if (col[i] >= 0) byCol[col[i]].push(i) })

  // ── Node values ──────────────────────────────────────────────────
  const nodeVal = nodes.map((_, i) => {
    const out = links.filter(l => l.source === i).reduce((s, l) => s + l.value, 0)
    const inp = links.filter(l => l.target === i).reduce((s, l) => s + l.value, 0)
    return out || inp
  })

  // ── Sort columns to avoid link crossings ─────────────────────────
  // Pass 1: compute initial Y positions
  let { nodeY, nodeH } = computeYPositions(byCol, nodeVal, H, MARGIN_V, V_PAD)

  // For each column c > 0, sort nodes by the Y-midpoint of their source node(s)
  for (let c = 1; c < numCols; c++) {
    byCol[c].sort((a, b) => {
      const srcA = links.filter(l => l.target === a).map(l => l.source)
      const srcB = links.filter(l => l.target === b).map(l => l.source)
      const midY = i => (nodeY[i] ?? 0) + (nodeH[i] ?? 0) / 2
      const avgA = srcA.length ? srcA.reduce((s, i) => s + midY(i), 0) / srcA.length : 0
      const avgB = srcB.length ? srcB.reduce((s, i) => s + midY(i), 0) / srcB.length : 0
      return avgA - avgB
    })
    // Recompute Y for this column after sorting
    const totalVal = byCol[c].reduce((s, i) => s + (nodeVal[i] ?? 0), 0)
    const usedPad  = V_PAD * (byCol[c].length - 1)
    const availH   = H - 2 * MARGIN_V - usedPad
    let y = MARGIN_V
    byCol[c].forEach(i => {
      nodeH[i] = Math.max(4, totalVal > 0 ? (nodeVal[i] / totalVal) * availH : 4)
      nodeY[i] = y
      y += nodeH[i] + V_PAD
    })
  }

  // ── Color assignment ─────────────────────────────────────────────
  const col2Nodes = byCol[2] ?? []
  const nodeColor = new Array(nodes.length).fill('#94a3b8')

  nodes.forEach((n, i) => {
    if (col[i] === 0) nodeColor[i] = COL0_COLOR
    if (col[i] === 1) nodeColor[i] = COL1_COLOR
  })
  // Assign distinct colors to col 2 categories (sorted order, no skips)
  col2Nodes.forEach((ni, idx) => {
    nodeColor[ni] = CAT_COLORS[idx % CAT_COLORS.length]
  })
  // Col 3 always inherits parent col-2 color
  nodes.forEach((_, i) => {
    if (col[i] === 3) {
      const parentLink = links.find(l => l.target === i && col[l.source] === 2)
      if (parentLink) nodeColor[i] = nodeColor[parentLink.source]
    }
  })

  // ── Column X positions ───────────────────────────────────────────
  const innerW = W - MARGIN_LEFT - MARGIN_RIGHT - NODE_W_DEF
  const colX   = Array.from({ length: numCols }, (_, c) =>
    MARGIN_LEFT + (numCols <= 1 ? 0 : (c * innerW) / (numCols - 1))
  )

  // ── Bézier link paths ────────────────────────────────────────────
  const srcUsed = new Array(nodes.length).fill(0)
  const tgtUsed = new Array(nodes.length).fill(0)

  const linkPaths = links.map(link => {
    const { source, target, value } = link
    const sx = colX[col[source]] + getNodeW(col[source])
    const tx = colX[col[target]]

    const sv = nodeVal[source]
    const tv = nodeVal[target]
    const sF0 = sv > 0 ? srcUsed[source] / sv : 0
    const sF1 = sv > 0 ? (srcUsed[source] + value) / sv : 0
    srcUsed[source] += value
    const tF0 = tv > 0 ? tgtUsed[target] / tv : 0
    const tF1 = tv > 0 ? (tgtUsed[target] + value) / tv : 0
    tgtUsed[target] += value

    const sy0 = nodeY[source] + sF0 * nodeH[source]
    const sy1 = nodeY[source] + sF1 * nodeH[source]
    const ty0 = nodeY[target] + tF0 * nodeH[target]
    const ty1 = nodeY[target] + tF1 * nodeH[target]
    const cx  = (sx + tx) / 2

    // Color = category color (col 2), inherited by subcategories
    const color = col[source] >= 2 ? nodeColor[source] : nodeColor[target]

    return {
      d: `M${sx},${sy0} C${cx},${sy0} ${cx},${ty0} ${tx},${ty0} L${tx},${ty1} C${cx},${ty1} ${cx},${sy1} ${sx},${sy1}Z`,
      color,
    }
  })

  // ── Render ───────────────────────────────────────────────────────
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow: 'visible', display: 'block' }}>
      {linkPaths.map((p, i) => (
        <path key={i} d={p.d} fill={p.color} fillOpacity={0.22} stroke={p.color} strokeOpacity={0.06} strokeWidth={1} />
      ))}

      {nodes.map((node, i) => {
        if (col[i] < 0) return null
        const x    = colX[col[i]]
        const y    = nodeY[i]
        const h    = nodeH[i]
        const midY = y + h / 2
        const nw   = getNodeW(col[i])
        const isLeft = col[i] === 0
        const lx   = isLeft ? x - 10 : x + nw + 10
        const anch = isLeft ? 'end' : 'start'
        const tall = h > 26

        const displayAmt = (col[i] <= 1 && data.salary) ? data.salary : nodeVal[i]

        return (
          <g key={i}>
            <rect x={x} y={y} width={nw} height={h} fill={nodeColor[i]} rx={3} />
            {tall ? (
              <>
                <text x={lx} y={midY - 7} textAnchor={anch} dominantBaseline="middle"
                  fontSize={11} fontWeight={500} fill="var(--text)" fontFamily="inherit">
                  {node.name}
                </text>
                <text x={lx} y={midY + 8} textAnchor={anch} dominantBaseline="middle"
                  fontSize={10} fill="var(--text3)" fontFamily="inherit">
                  {fmt(displayAmt)}
                </text>
              </>
            ) : (
              <text x={lx} y={midY} textAnchor={anch} dominantBaseline="middle"
                fontSize={11} fontWeight={500} fill="var(--text)" fontFamily="inherit">
                {node.name}
                <tspan fontSize={9.5} fontWeight={400} fill="var(--text3)" dx={6}>{fmt(displayAmt)}</tspan>
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}
