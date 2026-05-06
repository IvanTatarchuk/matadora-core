from fastapi import FastAPI

_app = FastAPI()

@_app.get("/api/ping")
def ping():
    return {"pong": True}

from mangum import Mangum
handler = Mangum(_app, lifespan="off")
