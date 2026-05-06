import sys
import os
import traceback

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import FastAPI

app = FastAPI()

_import_error = None
try:
    from backend.api.main import app as _real_app
    app = _real_app
except Exception as e:
    _import_error = traceback.format_exc()

@app.get("/_debug")
def debug():
    return {"sys_path": sys.path, "error": _import_error, "cwd": os.getcwd()}
