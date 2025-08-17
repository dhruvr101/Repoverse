import React, { useRef, useEffect, useMemo, useState } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import * as THREE from 'three';

export type GraphNode = {
  id: string;
  type: string;
  x?: number;
  y?: number;
  z?: number;
};

export type GraphLink = { source: string; target: string };

type Props = {
  nodes: GraphNode[];
  links: GraphLink[];
  onNodeSelect?: (node: GraphNode) => void;
  selectedNode?: GraphNode | null;
};

/**
 * GraphViewer (upgraded)
 * - Bright, consistent palette by `type`
 * - Node size = log(degree) so hotspots pop
 * - Hover + click highlight (neighbors + incident edges)
 * - Click to focus subgraph (1-hop neighborhood); click background to reset
 * - Smoothed link lengths to cluster related types
 * - Glow-y 3D spheres for better depth perception
 * - Legend for types (so it’s not “random dots”)
 */
export default function GraphViewer({ nodes, links, onNodeSelect, selectedNode }: Props) {
  const fgRef = useRef<any>(null);

  // ---- Color palette (high-contrast, vibrant) ----
  const PALETTE = [
    '#ff6b6b', // coral red
    '#ffd93d', // amber
    '#6bcB77', // mint green
    '#4d96ff', // bright blue
    '#bc6ff1', // violet
    '#ff8e3c', // tangerine
    '#2cd3e1', // cyan
    '#f72585', // magenta
    '#00f5d4', // aqua
    '#9ef01a', // lime
    '#f15bb5', // pink
    '#ffea00', // yellow
  ];

  // Map each type to a stable color
  const typeColor = useMemo(() => {
    const types = Array.from(new Set(nodes.map(n => n.type))).sort();
    const map = new Map<string, string>();
    types.forEach((t, i) => map.set(t, PALETTE[i % PALETTE.length]));
    return map;
  }, [nodes]);

  const getTypeColor = (type: string) => typeColor.get(type) || '#cccccc';

  // ---- Degree / adjacency for usefulness ----
  const { degreeMap, neighborsMap } = useMemo(() => {
    const deg = new Map<string, number>();
    const nbrs = new Map<string, Set<string>>();
    nodes.forEach(n => {
      deg.set(n.id, 0);
      nbrs.set(n.id, new Set());
    });
    links.forEach(l => {
      const s = typeof l.source === 'string' ? l.source : (l.source as any).id;
      const t = typeof l.target === 'string' ? l.target : (l.target as any).id;
      deg.set(s, (deg.get(s) || 0) + 1);
      deg.set(t, (deg.get(t) || 0) + 1);
      nbrs.get(s)?.add(t);
      nbrs.get(t)?.add(s);
    });
    return { degreeMap: deg, neighborsMap: nbrs };
  }, [nodes, links]);

  // ---- Interaction state ----
  const [hoverNode, setHoverNode] = useState<GraphNode | null>(null);
  const [internalSelectedNode, setInternalSelectedNode] = useState<GraphNode | null>(null);
  // Use controlled selectedNode if provided
  const selNode = selectedNode !== undefined ? selectedNode : internalSelectedNode;

  // Precompute highlight sets for hover/selection
  const { highlightNodes, highlightLinks } = useMemo(() => {
    const hNodes = new Set<string>();
    const hLinks = new Set<string>(); // key = "source->target"
    const pushNode = (id: string) => hNodes.add(id);
    const pushLink = (a: string, b: string) => hLinks.add(`${a}->${b}`);

    const seed = selNode || hoverNode;
    if (seed) {
      pushNode(seed.id);
      (neighborsMap.get(seed.id) || new Set()).forEach(n => {
        pushNode(n);
        pushLink(seed.id, n);
        pushLink(n, seed.id);
      });
    }
    return { highlightNodes: hNodes, highlightLinks: hLinks };
  }, [hoverNode, selectedNode, neighborsMap]);

  // Optionally filter to 1-hop neighborhood when selected (focus mode)
  const focusedData = useMemo(() => {
    if (!selNode) return { nodes, links };
    const keep = new Set<string>([selNode.id, ...(neighborsMap.get(selNode.id) || new Set())]);
    const fNodes = nodes.filter(n => keep.has(n.id));
    const fLinks = links.filter(l => {
      const s = typeof l.source === 'string' ? l.source : (l.source as any).id;
      const t = typeof l.target === 'string' ? l.target : (l.target as any).id;
      return keep.has(s) && keep.has(t);
    });
    return { nodes: fNodes, links: fLinks };
  }, [nodes, links, selNode, neighborsMap]);

  // Zoom to fit after render
useEffect(() => {
  if (fgRef.current && focusedData.nodes.length > 0) {
    setTimeout(() => {
      // 600ms animation, 150 extra world units padding
      fgRef.current.zoomToFit(600, 100);
    }, 350);
  }
}, [focusedData.nodes.length, focusedData.links.length]);

  // Nicer link distances: shorter for same-type, longer cross-type to create structure
  useEffect(() => {
    if (!fgRef.current) return;
    const linkForce = fgRef.current.d3Force('link');
    if (linkForce && linkForce.distance) {
      linkForce.distance((l: any) => {
        const sType = (typeof l.source === 'object' ? l.source.type : nodes.find(n => n.id === l.source)?.type) || '';
        const tType = (typeof l.target === 'object' ? l.target.type : nodes.find(n => n.id === l.target)?.type) || '';
        const base = 40;
        const bump = sType === tType ? 0 : 40;
        return base + bump;
      });
    }
  }, [nodes, links]);

  // Label with useful info
  const nodeLabel = (n: GraphNode) => {
    const deg = degreeMap.get(n.id) || 0;
    return `${n.id}\nType: ${n.type}\nDegree: ${deg}`;
  };

  // Node size = log(degree) + baseline
  const nodeVal = (n: GraphNode) => {
    const d = degreeMap.get(n.id) || 0;
    return 3 + Math.log2(1 + d) * 3;
  };

  // Custom 3D node (glow sphere + sprite text)
  const nodeThreeObject = (n: GraphNode) => {
    const color = new THREE.Color(getTypeColor(n.type));
    const group = new THREE.Group();

    // Sphere
    const geo = new THREE.SphereGeometry(4, 16, 16);
    const mat = new THREE.MeshPhongMaterial({
      color,
      emissive: color.clone().multiplyScalar(0.3),
      shininess: 80,
      specular: new THREE.Color('#ffffff')
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.scale.setScalar(nodeVal(n) / 4); // scale to val
    group.add(mesh);

    // Subtle glow (transparent billboard)
    const glowGeo = new THREE.SphereGeometry(6, 16, 16);
    const glowMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.15,
      depthWrite: false
    });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    glow.scale.setScalar(nodeVal(n) / 3);
    group.add(glow);

    return group;
  };

  // Dynamic colors (highlighted nodes pop)
  const nodeColor = (n: GraphNode) => {
    const base = getTypeColor(n.type);
    if (selectedNode && n.id === selectedNode.id) return '#ffffff';
    if (highlightNodes.has(n.id)) return base;
    // dim non-neighborhood nodes while hovering/selected
    if (hoverNode || selectedNode) return '#3a3a4d';
    return base;
  };

  // Link styling
  const linkColor = (l: any) => {
    const s = typeof l.source === 'string' ? l.source : l.source.id;
    const t = typeof l.target === 'string' ? l.target : l.target.id;
    const sType = typeof l.source === 'object' ? l.source.type : nodes.find(n => n.id === s)?.type;
    const tType = typeof l.target === 'object' ? l.target.type : nodes.find(n => n.id === t)?.type;

    // If highlighted, use bright white
    if (highlightLinks.has(`${s}->${t}`) || highlightLinks.has(`${t}->${s}`)) return 'rgba(255,255,255,0.95)';

    // Otherwise blend source/target colors; dim if not in neighborhood
    const c1 = new THREE.Color(getTypeColor(sType || ''));
    const c2 = new THREE.Color(getTypeColor(tType || ''));
    const blended = c1.lerp(c2, 0.5).getStyle();
    if (hoverNode || selectedNode) return 'rgba(90,90,110,0.25)';
    return blended;
  };

  const linkWidth = (l: any) => {
    const s = typeof l.source === 'string' ? l.source : l.source.id;
    const t = typeof l.target === 'string' ? l.target : l.target.id;
    return highlightLinks.has(`${s}->${t}`) || highlightLinks.has(`${t}->${s}`) ? 2.5 : 0.6;
  };

  const linkDirectionalParticles = (l: any) => {
    const s = typeof l.source === 'string' ? l.source : l.source.id;
    const t = typeof l.target === 'string' ? l.target : l.target.id;
    return highlightLinks.has(`${s}->${t}`) || highlightLinks.has(`${t}->${s}`) ? 4 : 0;
  };

  // Legend data
  const legend = useMemo(() => {
    return Array.from(new Set(nodes.map(n => n.type)))
      .sort()
      .map(t => ({ type: t, color: getTypeColor(t) }));
  }, [nodes, typeColor]);

  // UI: small overlay controls
  const [showLegend, setShowLegend] = useState(true);

  return (
    <div style={{ position: 'relative' }}>
      <ForceGraph3D
        ref={fgRef}
        width={window.innerWidth}
        height={window.innerHeight}
        graphData={focusedData}
        nodeId="id"
        nodeLabel={nodeLabel as any}
        nodeVal={nodeVal as any}
        nodeColor={nodeColor as any}
        nodeThreeObject={nodeThreeObject as any}
        linkColor={linkColor as any}
        linkWidth={linkWidth as any}
        linkDirectionalParticles={linkDirectionalParticles as any}
        linkDirectionalParticleSpeed={0.01}
        linkOpacity={0.5}
        d3VelocityDecay={0.22}
        warmupTicks={200}
        cooldownTicks={600}
        backgroundColor="#0b0b14"
        onNodeHover={(n: any) => setHoverNode(n || null)}
        onNodeClick={(n: any, event: any) => {
          if (onNodeSelect) {
            onNodeSelect(n);
          } else {
            setInternalSelectedNode(n);
          }
          // smooth zoom to the node
          const distance = 160;
          const distRatio = 1 + distance / Math.hypot(n.x || 0, n.y || 0, n.z || 0);
          fgRef.current.cameraPosition(
            { x: (n.x || 0) * distRatio, y: (n.y || 0) * distRatio, z: (n.z || 0) * distRatio },
            { x: n.x || 0, y: n.y || 0, z: n.z || 0 },
            800
          );
        }}
        onBackgroundClick={() => {
          if (onNodeSelect) {
            onNodeSelect(null as any);
          } else {
            setInternalSelectedNode(null);
          }
        }}
      />

      {/* Top-left controls */}
      <div
        style={{
          position: 'absolute',
          top: 12,
          left: 12,
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          zIndex: 2
        }}
      >
        <button
          onClick={() => {
            if (onNodeSelect) {
              onNodeSelect(null as any);
            } else {
              setInternalSelectedNode(null);
            }
          }}
          style={{
            padding: '6px 10px',
            borderRadius: 10,
            border: '1px solid #3a3a4d',
            background: '#141424',
            color: '#eaeafd',
            cursor: 'pointer'
          }}
          title="Reset focus to full graph"
        >
          Reset View
        </button>
        <button
          onClick={() => setShowLegend(s => !s)}
          style={{
            padding: '6px 10px',
            borderRadius: 10,
            border: '1px solid #3a3a4d',
            background: '#141424',
            color: '#eaeafd',
            cursor: 'pointer'
          }}
        >
          {showLegend ? 'Hide Legend' : 'Show Legend'}
        </button>
      </div>

      {/* Legend */}
      {showLegend && legend.length > 0 && (
        <div
          style={{
            position: 'absolute',
            top: 54,
            left: 12,
            padding: 10,
            borderRadius: 12,
            background: 'rgba(15,15,28,0.9)',
            border: '1px solid #2a2a3d)',
            color: '#d9d9f5',
            maxHeight: '60vh',
            overflow: 'auto',
            zIndex: 2,
            minWidth: 180
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 6, opacity: 0.9 }}>Node Types</div>
          {legend.map(({ type, color }) => (
            <div key={type} style={{ display: 'flex', alignItems: 'center', margin: '4px 0' }}>
              <div
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 6,
                  marginRight: 8,
                  background: color,
                  boxShadow: `0 0 8px ${color}`
                }}
              />
              <span style={{ fontSize: 12 }}>{type}</span>
            </div>
          ))}
          <div style={{ marginTop: 8, fontSize: 11, opacity: 0.7 }}>
            • Size = node degree (hotspots = bigger)
            <br />• Hover = highlight neighborhood
            <br />• Click = focus 1-hop subgraph
          </div>
        </div>
      )}

      {/* Bottom-left hint when focused */}
      {selNode && (
        <div
          style={{
            position: 'absolute',
            bottom: 12,
            left: 12,
            padding: '8px 10px',
            borderRadius: 10,
            background: 'rgba(20,20,36,0.9)',
            color: '#bfc1ff',
            border: '1px solid #3a3a4d',
            zIndex: 2,
          }}
        >
          Focused on <b>{selNode.id}</b> — showing 1-hop neighborhood. Click background or “Reset View” to exit.
        </div>
      )}
    </div>
  );
}
