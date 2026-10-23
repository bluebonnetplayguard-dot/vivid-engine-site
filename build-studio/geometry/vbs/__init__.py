"""Vivid Build Studio geometry engine. The AI writes the Model Spec; this package builds exact geometry from it."""
from .model import build, load, Model, Element, SpecError, with_parameter  # noqa: F401
