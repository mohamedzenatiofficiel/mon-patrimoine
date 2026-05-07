const COLORS = [
  '#818cf8', '#fb923c', '#a78bfa', '#34d399', '#f472b6',
  '#60a5fa', '#fbbf24', '#4ade80', '#f87171', '#38bdf8',
  '#e879f9', '#2dd4bf', '#facc15', '#c084fc', '#86efac',
]

const fmtVal = v =>
  new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(v) + ' €'

export default function CashflowSankey({ data, height = 380 }) {
  if (!data?.nodes?.length || !data?.links?.length) return null

  const { nodes, links } = data
  const W = 960
  const H = height
  const NODE_W = 18
  const V_PAD = 10
  const MARGIN_LEFT = 110
  const MARGIN_RIGHT = 200
  const MARGIN_V = 10

  // Assign columns: source nodes get col 0, then BFS propagates
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
  const byCol = Array.from({ length: numCols }, () => [])
  nodes.forEach((_, i) => { if (col[i] >= 0) byCol[col[i]].push(i) })

  // Node values
  const nodeVal = nodes.map((_, i) => {
    const out = links.filter(l => l.source === i).reduce((s, l) => s + l.value, 0)
    const inp = links.filter(l => l.target === i).reduce((s, l) => s + l.value, 0)
    return out || inp
  })

  // Column X positions
  const innerW = W - MARGIN_LEFT - MARGIN_RIGHT - NODE_W
  const colX = Array.from({ length: numCols }, (_, c) =>
    MARGIN_LEFT + (numCols === 1 ? 0 : (c * innerW) / (numCols - 1))
  )

  // Node Y positions and heights
  const nodeY = new Array(nodes.length)
  const nodeH = new Array(nodes.length)

  byCol.forEach(colIdxs => {
    const totalVal = colIdxs.reduce((s, i) => s + nodeVal[i], 0)
    const usedPad = V_PAD * (colIdxs.length - 1)
    const availH = H - 2 * MARGIN_V - usedPad
    let y = MARGIN_V
    colIdxs.forEach(i => {
      nodeH[i] = Math.max(6, (nodeVal[i] / totalVal) * availH)
      nodeY[i] = y
      y += nodeH[i] + V_PAD
    })
  })

  // Bezier link paths with per-node offset tracking
  const srcUsed = new Array(nodes.length).fill(0)
  const tgtUsed = new Array(nodes.length).fill(0)

  const linkPaths = links.map(link => {
    const { source, target, value } = link
    const sx = colX[col[source]] + NODE_W
    const tx = colX[col[target]]

    const sF0 = srcUsed[source] / nodeVal[source]
    const sF1 = (srcUsed[source] + value) / nodeVal[source]
    srcUsed[source] += value
    const tF0 = tgtUsed[target] / nodeVal[target]
    const tF1 = (tgtUsed[target] + value) / nodeVal[target]
    tgtUsed[target] += value

    const sy0 = nodeY[source] + sF0 * nodeH[source]
    const sy1 = nodeY[source] + sF1 * nodeH[source]
    const ty0 = nodeY[target] + tF0 * nodeH[target]
    const ty1 = nodeY[target] + tF1 * nodeH[target]
    const cx = (sx + tx) / 2

    return {
      d: `M${sx},${sy0} C${cx},${sy0} ${cx},${ty0} ${tx},${ty0} L${tx},${ty1} C${cx},${ty1} ${cx},${sy1} ${sx},${sy1}Z`,
      color: COLORS[target % COLORS.length],
    }
  })

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${W} ${H}`}
      style={{ overflow: 'visible', display: 'block' }}
    >
      {linkPaths.map((p, i) => (
        <path key={i} d={p.d} fill={p.color} fillOpacity={0.3} stroke="none" />
      ))}
      {nodes.map((node, i) => {
        if (col[i] < 0) return null
        const x = colX[col[i]]
        const y = nodeY[i]
        const h = nodeH[i]
        const isFirst = col[i] === 0
        const labelX = isFirst ? x - 8 : x + NODE_W + 8
        const anchor = isFirst ? 'end' : 'start'
        return (
          <g key={i}>
            <rect
              x={x} y={y} width={NODE_W} height={h}
              fill={COLORS[i % COLORS.length]}
              rx={3}
            />
            <text
              x={labelX}
              y={y + h / 2}
              textAnchor={anchor}
              dominantBaseline="middle"
              fontSize={11}
              fill="var(--text)"
              fontFamily="inherit"
            >
              {node.name}: {fmtVal(nodeVal[i])}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
