from git import Repo

def clone_repo(url: str, path: str):
    Repo.clone_from(url, path)
