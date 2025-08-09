import os
import re
import random
from pathlib import Path

# Parse lots of languages, but you can trim for speed if needed
SUPPORTED_EXTENSIONS = ('.py', '.js', '.ts', '.tsx', '.jsx', '.java', '.cpp', '.c', '.h', '.cs')
IGNORE_DIRS = {'node_modules', '.git', '__pycache__', 'build', 'dist', '.next', '.expo', '.gradle'}

PATTERNS = {
    "class": [re.compile(r'\bclass\s+([A-Z][A-Za-z0-9_]*)')],
    "function": [
        re.compile(r'\bdef\s+([a-zA-Z_][A-Za-z0-9_]*)'),
        re.compile(r'\bfunction\s+([a-zA-Z_][A-Za-z0-9_]*)'),
        re.compile(r'([a-zA-Z_][A-Za-z0-9_]*)\s*\([^)]*\)\s*\{'),
    ],
    "import": [
        re.compile(r'\bimport\s+([a-zA-Z0-9_.\-\/@]+)'),
        re.compile(r'\bfrom\s+([a-zA-Z0-9_.\-\/@]+)\s+import'),
        re.compile(r'\brequire\([\'"](.+?)[\'"]\)'),
        re.compile(r'#include\s+[<"](.+?)[>"]'),
    ],
    "extends": [
        re.compile(r'\bclass\s+\w+\s+extends\s+(\w+)'),
        re.compile(r'\bclass\s+\w+\s*\((\w+)\)'),
    ]
}

def parse_file(filepath: str, repo_root: str):
    nodes = []
    links = []
    rel_path = str(Path(filepath).relative_to(repo_root))

    # File node
    file_node = {"id": rel_path, "type": "file"}
    nodes.append(file_node)

    try:
        with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
            content = f.read()

        # Classes
        for pattern in PATTERNS["class"]:
            for match in pattern.findall(content):
                cid = f"{rel_path}::{match}"
                nodes.append({"id": cid, "type": f"class:{match}"})
                links.append({"source": rel_path, "target": cid})

        # Functions
        for pattern in PATTERNS["function"]:
            for match in pattern.findall(content):
                name = match.strip()
                if name:
                    fid = f"{rel_path}::{name}"
                    nodes.append({"id": fid, "type": f"function:{name}"})
                    links.append({"source": rel_path, "target": fid})

        # Imports (internal or external)
        for pattern in PATTERNS["import"]:
            for match in pattern.findall(content):
                imp = match.strip()
                if not imp:
                    continue
                target = resolve_import(imp, repo_root)
                node_type = "external:" + imp if target == imp else "file"
                nodes.append({"id": target, "type": node_type})
                links.append({"source": rel_path, "target": target})

        # Extends/inheritance
        for pattern in PATTERNS["extends"]:
            for match in pattern.findall(content):
                base = match.strip()
                if base:
                    nodes.append({"id": base, "type": f"class:{base}"})
                    links.append({"source": rel_path, "target": base})

    except Exception as e:
        print(f"Error parsing {filepath}: {e}")

    return nodes, links

def resolve_import(import_path: str, repo_root: str) -> str:
    """
    Try to resolve import to a file in the repo.
    If not found, return the original string (treated as external).
    """
    # Relative-like or bare module names → try common resolutions
    candidates = []

    # if './foo' or '../bar' or 'src/foo'
    if import_path.startswith(('.', '/', '@')):
        base = import_path
    else:
        # bare module (react, axios, etc.) → it will be external
        return import_path

    # Try with extensions
    if not base.endswith(tuple(SUPPORTED_EXTENSIONS)):
        for ext in SUPPORTED_EXTENSIONS:
            candidates.append(base.replace('.', '/') + ext)
        # Index files
        for ext in SUPPORTED_EXTENSIONS:
            candidates.append(os.path.join(base.replace('.', '/'), f"index{ext}"))
    else:
        candidates.append(base)

    for p in candidates:
        full = Path(repo_root) / p
        if full.exists():
            return str(full.relative_to(repo_root))

    return import_path  # external

def build_graph(repo_path: str):
    all_nodes = {}   # id -> node
    all_links = []

    for root, dirs, files in os.walk(repo_path):
        dirs[:] = [d for d in dirs if d not in IGNORE_DIRS]
        for file in files:
            if file.endswith(SUPPORTED_EXTENSIONS):
                filepath = os.path.join(root, file)
                nodes, links = parse_file(filepath, repo_path)

                for n in nodes:
                    nid = n["id"]
                    if nid not in all_nodes:
                        # random initial position so things don't stack
                        n["x"] = random.uniform(-600, 600)
                        n["y"] = random.uniform(-600, 600)
                        n["z"] = random.uniform(-600, 600)
                        all_nodes[nid] = n
                all_links.extend(links)

    # Deduplicate links (optional)
    seen = set()
    deduped_links = []
    for l in all_links:
        key = (l["source"], l["target"])
        if key not in seen:
            seen.add(key)
            deduped_links.append(l)

    return {"nodes": list(all_nodes.values()), "links": deduped_links}
