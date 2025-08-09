from fastapi import FastAPI, Request, HTTPException, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os
import shutil
import uuid
import subprocess
import hmac
import hashlib
from parser import build_graph, build_graph_incremental

# ===== Config =====
TEMP_DIR = "/tmp/dev-graph-temp"
os.makedirs(TEMP_DIR, exist_ok=True)
GITHUB_SECRET = os.getenv("GITHUB_SECRET", "mysecret")
REPO_DIR = os.path.join(TEMP_DIR, "live-repo")

# ===== App setup =====
app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # You can lock this down later
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Connected WebSocket clients
ws_clients: list[WebSocket] = []

class RepoRequest(BaseModel):
    url: str

@app.post("/ingest")
def ingest_repo(request: RepoRequest):
    # Fresh clone to live-repo
    if os.path.exists(REPO_DIR):
        shutil.rmtree(REPO_DIR)
    try:
        subprocess.check_call(["git", "clone", "--depth", "1", request.url, REPO_DIR])
        graph = build_graph(REPO_DIR)
        return graph
    except subprocess.CalledProcessError as e:
        return {"error": f"git clone failed: {e}"}

# ===== WebSocket for live updates =====
@app.websocket("/updates")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    ws_clients.append(ws)
    try:
        while True:
            await ws.receive_text()  # keep alive
    except:
        ws_clients.remove(ws)

# ===== GitHub webhook for push events =====
@app.post("/webhook")
async def github_webhook(request: Request):
    # Verify signature
    body = await request.body()
    sig = request.headers.get("X-Hub-Signature-256")
    mac = "sha256=" + hmac.new(GITHUB_SECRET.encode(), body, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(sig, mac):
        raise HTTPException(status_code=403, detail="Invalid signature")

    payload = await request.json()
    print(f"Push event: {payload.get('ref')}")
    
    # Pull latest
    subprocess.run(["git", "-C", REPO_DIR, "pull"], check=True)

    # Changed files only
    changed_files = []
    for commit in payload.get("commits", []):
        for f in commit.get("modified", []) + commit.get("added", []):
            changed_files.append(f)

    # Incremental update
    graph = build_graph_incremental(REPO_DIR, changed_files)

    # Broadcast to all connected WS clients
    for client in ws_clients:
        await client.send_json(graph)

    return {"status": "ok"}
