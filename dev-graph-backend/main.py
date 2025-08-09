from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os
import shutil
import uuid
import subprocess
from parser import build_graph

class RepoRequest(BaseModel):
    url: str

app = FastAPI()

# Keep CORS simple/stable
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:3000", "http://127.0.0.1:3000", "*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

TEMP_DIR = "/tmp/dev-graph-temp"
os.makedirs(TEMP_DIR, exist_ok=True)

@app.post("/ingest")
def ingest_repo(request: RepoRequest):
    repo_id = str(uuid.uuid4())
    repo_dir = os.path.join(TEMP_DIR, repo_id)

    try:
        subprocess.check_call(["git", "clone", "--depth", "1", request.url, repo_dir])
        graph = build_graph(repo_dir)
        return graph
    except subprocess.CalledProcessError as e:
        return {"error": f"git clone failed: {e}"}
    finally:
        shutil.rmtree(repo_dir, ignore_errors=True)
