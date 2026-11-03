"""AeroRoute - Integración web del proyecto."""

import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from aeropuertos import GrafoAeropuertos
from dijkstra import calcular_dijkstra
from automata import grafo as GRAFO_PROPUESTA
from automata import validar_ruta, calcular_peso_ruta
from markov import (
    ESTADOS,
    MATRIZ_TRANSICION,
    calcular_probabilidades_periodos
)

BASE = Path(__file__).resolve().parent
WEB = BASE / "web"