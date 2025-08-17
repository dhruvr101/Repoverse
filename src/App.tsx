import React, { useState, useEffect } from 'react';
import GraphViewer, { GraphNode, GraphLink } from './components/GraphViewer';
import { useCallback } from 'react';

type GraphData = {
  nodes: GraphNode[];
  links: GraphLink[];
};

function App() {
  const [repoUrl, setRepoUrl] = useState('');
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [code, setCode] = useState<string>('');
  const [codeLoading, setCodeLoading] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);
  // Fetch code for a node (file or file::symbol)
  const fetchCode = useCallback(async (node: GraphNode) => {
    setCode('');
    setCodeError(null);
    setCodeLoading(true);
    try {
      // For now, only support file nodes (id = path)
      let filePath = node.id.split('::')[0];
      const res = await fetch(`http://127.0.0.1:8000/code?path=${encodeURIComponent(filePath)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setCode(data.code || '');
    } catch (e: any) {
      setCodeError(e?.message || 'Unknown error');
    } finally {
      setCodeLoading(false);
    }
  }, []);

  const handleIngest = async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch('http://127.0.0.1:8000/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: repoUrl }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data?.nodes || !data?.links) throw new Error('Bad payload from backend');
      if ((data as any).error) throw new Error((data as any).error);
      setGraphData(data as GraphData);

      // Connect WS after initial load
      const ws = new WebSocket("ws://127.0.0.1:8000/updates");
      ws.onmessage = (event) => {
        const update = JSON.parse(event.data);
        setGraphData(update);
      };
    } catch (e: any) {
      setErr(e?.message || 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setGraphData(null);
    setRepoUrl('');
    setErr(null);
  };

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#111', color: 'white' }}>
      {!graphData && (
        <div style={{ padding: '1rem', backgroundColor: '#222', display: 'flex', gap: '0.5rem' }}>
          <input
            type="text"
            placeholder="Paste GitHub repo URL"
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            style={{
              flex: 1,
              padding: '0.6rem',
              background: '#333',
              color: 'white',
              border: '1px solid #555',
              borderRadius: '6px'
            }}
          />
          <button
            onClick={handleIngest}
            disabled={loading || !repoUrl.trim()}
            style={{ padding: '0.6rem 1rem', background: '#555', color: 'white', border: 'none', borderRadius: '6px' }}
          >
            {loading ? 'Processing…' : 'Generate Graph'}
          </button>
        </div>
      )}

      {err && <div style={{ padding: '0.5rem 1rem', background: '#7a2222' }}>{err}</div>}

      {graphData && (
        <>
          <div style={{ position: 'absolute', top: 10, right: 10, zIndex: 10, display: 'flex', gap: 8 }}>
            <button onClick={reset} style={{ padding: '0.5rem 0.8rem', borderRadius: 6, border: 'none' }}>
              New Repo
            </button>
          </div>
          <div style={{ display: 'flex', height: '100vh', width: '100vw' }}>
            <div style={{ flex: 2, minWidth: 0 }}>
              <GraphViewer
                nodes={graphData.nodes}
                links={graphData.links}
                onNodeSelect={async (node: GraphNode) => {
                  setSelectedNode(node);
                  await fetchCode(node);
                }}
                selectedNode={selectedNode}
              />
            </div>
            <div style={{ flex: 1, minWidth: 0, background: '#181828', color: '#eaeafd', borderLeft: '1px solid #333', padding: 0, display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '10px 16px', borderBottom: '1px solid #333', fontWeight: 700, fontSize: 16 }}>
                {selectedNode ? selectedNode.id : 'No node selected'}
              </div>
              <div style={{ flex: 1, overflow: 'auto', fontFamily: 'monospace', fontSize: 13, padding: 16 }}>
                {codeLoading && <div>Loading code…</div>}
                {codeError && <div style={{ color: '#ff6b6b' }}>{codeError}</div>}
                {!codeLoading && !codeError && code && (
                  <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{code}</pre>
                )}
                {!codeLoading && !codeError && !code && <div style={{ opacity: 0.7 }}>No code to display.</div>}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default App;
