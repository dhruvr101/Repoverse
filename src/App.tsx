import React, { useState } from 'react';
import GraphViewer, { GraphNode, GraphLink } from './components/GraphViewer';

type GraphData = {
  nodes: GraphNode[];
  links: GraphLink[];
};

function App() {
  const [repoUrl, setRepoUrl] = useState('');
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

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
      console.log('ingest response:', data);
      if (!data?.nodes || !data?.links) throw new Error('Bad payload from backend');
      if ((data as any).error) throw new Error((data as any).error);
      setGraphData(data as GraphData);
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

      {err && (
        <div style={{ padding: '0.5rem 1rem', background: '#7a2222' }}>
          {err}
        </div>
      )}

      {graphData && (
        <>
          <div style={{ position: 'absolute', top: 10, right: 10, zIndex: 10, display: 'flex', gap: 8 }}>
            <button onClick={reset} style={{ padding: '0.5rem 0.8rem', borderRadius: 6, border: 'none' }}>
              New Repo
            </button>
          </div>
          <GraphViewer nodes={graphData.nodes} links={graphData.links} />
        </>
      )}
    </div>
  );
}

export default App;
