# Context Graph Blueprint — NexFlow Enterprise Reports

Internal reference for building interactive context graphs in future report deliverables.

---

## Node Types

| Type | Shape | Fill | Stroke | Icon | Size |
|------|-------|------|--------|------|------|
| **Repo** | Rounded rect | `#1a1a2e` | `#3b82f6` (blue) | Git branch | Scale by commit count |
| **Person** | Circle | `#1a1a2e` | `#8b5cf6` (purple) | Initials text | Scale by contribution weight |
| **Integration** | Diamond | `#1a1a2e` | `#30a46c` (green) | Service icon | Fixed 28px |
| **Risk** | Hexagon | `#2a1215` | `#e5484d` (red) | Warning | Pulse animation on critical |
| **Team/Group** | Dashed circle | transparent | `#8c8c8c` (muted) | — | Encloses child nodes |

### Design tokens (from report-html.ts CSS)
```
--fg: #0f0f0f    --red: #e5484d     --red-bg: #fff0f0
--fg2: #3a3a3a   --amber: #e5940c   --amber-bg: #fef6e7
--muted: #8c8c8c --green: #30a46c   --green-bg: #ebfaf1
--border: #e5e5ea --blue: #3b82f6   --blue-bg: #eef4ff
--surface: #f7f7f8 --purple: #8b5cf6 --purple-bg: #f3f0ff
Font: Inter 400/600/700/800/900
```

Dark theme canvas: `#0f0f14` with subtle radial gradient center `#15152a`.

---

## Edge Relationships

| Relationship | Style | Color | Label |
|---|---|---|---|
| **commits-to** (person→repo) | Solid, 2px | `#3b82f6` | commit count |
| **reviews** (person→person) | Dashed, 1.5px | `#8b5cf6` | review count |
| **depends-on** (repo→repo) | Solid, 1px | `#8c8c8c` | — |
| **feeds-data** (integration→repo) | Dotted, 1.5px | `#30a46c` | sync frequency |
| **risk-source** (risk→node) | Solid, 2.5px | `#e5484d` | risk label |
| **owns** (person→repo) | Solid, 1px | `#8b5cf6` opacity 0.4 | "owner" |

Edge width scales with weight (e.g., more commits = thicker line). Use `marker-end` arrowheads, 6px, matching edge color.

---

## Layout Principles

**Default: Force-directed** (D3 `forceSimulation`)
- `forceCenter` anchored to canvas center
- `forceManyBody` strength: -300 (repos), -150 (people), -80 (integrations)
- `forceLink` distance: 120px base, scaled by relationship strength
- `forceCollide` radius: node size + 20px padding
- Stabilize with `alphaDecay(0.02)`, stop at `alphaMin(0.001)`

**Alt: Hierarchical** (for org-chart or dependency views)
- Integrations top row → Repos middle → People bottom
- Use `d3.tree()` with `nodeSize([140, 80])`
- Curved links via `d3.linkVertical()`

**Clustering**: Group nodes by subsystem (e.g., RIZZ nodes cluster left, Daily.co cluster right). Use `forceX`/`forceY` with per-group target coordinates.

---

## SVG Implementation Pattern

Inline SVG in report HTML. No external JS dependencies for static reports — bake the final positions server-side. For interactive versions (enterprise dashboard), use D3.

### Static (report embed)
```html
<div class="context-graph" style="background: #0f0f14; border-radius: 14px;
  padding: 24px; border: 1px solid #2a2a3e;">
  <svg viewBox="0 0 600 400" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <!-- Arrowhead -->
      <marker id="arrow-blue" viewBox="0 0 10 10" refX="9" refY="5"
        markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M 0 0 L 10 5 L 0 10 z" fill="#3b82f6"/>
      </marker>
      <!-- Glow filter for risk nodes -->
      <filter id="glow-red">
        <feGaussianBlur stdDeviation="3" result="blur"/>
        <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
    </defs>

    <!-- Edge -->
    <line x1="150" y1="200" x2="350" y2="120" stroke="#3b82f6"
      stroke-width="2" opacity="0.7" marker-end="url(#arrow-blue)"/>

    <!-- Repo node -->
    <g transform="translate(350,120)">
      <rect x="-50" y="-18" width="100" height="36" rx="8"
        fill="#1a1a2e" stroke="#3b82f6" stroke-width="1.5"/>
      <text text-anchor="middle" dy="4" fill="#e2e8f0"
        font-family="Inter" font-size="11" font-weight="600">cockpit</text>
    </g>

    <!-- Person node -->
    <g transform="translate(150,200)">
      <circle r="22" fill="#1a1a2e" stroke="#8b5cf6" stroke-width="1.5"/>
      <text text-anchor="middle" dy="4" fill="#e2e8f0"
        font-family="Inter" font-size="10" font-weight="700">NH</text>
    </g>

    <!-- Risk node -->
    <g transform="translate(450,260)" filter="url(#glow-red)">
      <polygon points="0,-20 17,-10 17,10 0,20 -17,10 -17,-10"
        fill="#2a1215" stroke="#e5484d" stroke-width="1.5"/>
      <text text-anchor="middle" dy="4" fill="#e5484d"
        font-family="Inter" font-size="8" font-weight="800">P0</text>
    </g>
  </svg>
</div>
```

### Interactive (D3, enterprise dashboard)
```js
const sim = d3.forceSimulation(nodes)
  .force("link", d3.forceLink(edges).id(d => d.id).distance(120))
  .force("charge", d3.forceManyBody().strength(d => d.type === "repo" ? -300 : -150))
  .force("center", d3.forceCenter(width / 2, height / 2))
  .force("collide", d3.forceCollide(d => d.radius + 20))
  .on("tick", render);

// Drag behavior
node.call(d3.drag()
  .on("start", d => { if (!d3.event.active) sim.alphaTarget(0.3).restart(); })
  .on("drag", d => { d.fx = d3.event.x; d.fy = d3.event.y; })
  .on("end", d => { if (!d3.event.active) sim.alphaTarget(0); d.fx = null; d.fy = null; })
);
```

### Tooltip pattern
```html
<div class="graph-tooltip" style="position: absolute; background: #1a1a2e;
  border: 1px solid #2a2a3e; border-radius: 8px; padding: 10px 14px;
  font-family: Inter; font-size: 11px; color: #e2e8f0; pointer-events: none;
  box-shadow: 0 4px 12px rgba(0,0,0,0.4);">
  <div style="font-weight: 700; margin-bottom: 4px;">resourceful-cockpit</div>
  <div style="color: #8c8c8c;">2 commits · 0 PRs · 1 contributor</div>
  <div style="color: #e5484d; font-weight: 600; margin-top: 4px;">⚠ No branch protection</div>
</div>
```

---

## Data Shape

```ts
interface GraphNode {
  id: string;
  type: "repo" | "person" | "integration" | "risk" | "group";
  label: string;
  weight: number;     // drives size
  color: string;      // override stroke color
  metadata?: Record<string, string | number>;
}

interface GraphEdge {
  source: string;
  target: string;
  type: "commits-to" | "reviews" | "depends-on" | "feeds-data" | "risk-source" | "owns";
  weight: number;     // drives thickness
  label?: string;
}

interface ContextGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  layout: "force" | "hierarchical";
  title?: string;
}
```

Build from `integrationData` in `report.content` — extract repos, contributors, connected integrations, and flagged risks from health score dimensions.

---

## Integration with Report HTML

Add after the health strip or as a standalone discovery card:

```html
<div class="discovery blue">
  <div class="disc-num">
    <span class="risk-pill info">Context Map</span>
  </div>
  <div class="disc-headline">How Your Systems Connect</div>
  <div class="disc-body">
    <!-- inline SVG graph here -->
  </div>
</div>
```

For print/PDF: pre-render positions server-side, output static SVG. No JS needed.
