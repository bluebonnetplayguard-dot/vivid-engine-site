"""Geometry service API (FastAPI). Runs in Docker next to the NestJS backend; long jobs go through the queue.

    uvicorn app:app --host 0.0.0.0 --port 8090

The NestJS backend is the only caller (internal network). It handles auth, credits and storage, so
this service never sees user secrets and keeps no data between requests.
"""
from __future__ import annotations

from fractions import Fraction

from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel

from vbs import SpecError, build
from vbs import validate as validators
from vbs.drawing import SheetOptions, render_sheet
from vbs.viewer_export import to_viewer_json

app = FastAPI(title="Vivid Build Studio geometry", version="0.1.0")


class SpecIn(BaseModel):
    spec: dict


class SheetIn(BaseModel):
    spec: dict
    paper: str = "ANSI-A"
    scale: str = '1/4"=1\'-0"'
    orientation: str = "landscape"


def _build(spec: dict):
    try:
        return build(spec)
    except SpecError as e:
        raise HTTPException(status_code=422, detail=str(e))


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/build")
def build_model(body: SpecIn):
    model = _build(body.spec)
    report = validators.run(model)
    return {
        "log": model.log,
        "elements": len(model.elements),
        "viewer": to_viewer_json(model),
        "validation": {
            "ok": report.ok,
            "findings": [f.__dict__ for f in report.findings],
            "scenes": report.scenes(),
        },
    }


@app.post("/validate")
def validate_model(body: SpecIn):
    report = validators.run(_build(body.spec))
    return {"ok": report.ok, "findings": [f.__dict__ for f in report.findings], "scenes": report.scenes()}


@app.post("/sheet.pdf")
def sheet(body: SheetIn):
    model = _build(body.spec)
    pdf = render_sheet(model, SheetOptions(paper=body.paper, scale=body.scale, orientation=body.orientation))
    return Response(content=pdf, media_type="application/pdf")
