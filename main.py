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


# Ubicaciones para mostrar los aeropuertos en el mapa.
# CHI y BR se representan con ciudades de referencia.

AEROPUERTOS = {
    "GUA": {
        "nombre": "La Aurora - Guatemala",
        "lat": 14.5833,
        "lng": -90.5275
    },
    "SAL": {
        "nombre": "El Salvador - San Salvador",
        "lat": 13.4409,
        "lng": -89.0557
    },
    "MEX": {
        "nombre": "Ciudad de México",
        "lat": 19.4361,
        "lng": -99.0719
    },
    "MIA": {
        "nombre": "Miami - Estados Unidos",
        "lat": 25.7954,
        "lng": -80.2906
    },
    "JFK": {
        "nombre": "John F. Kennedy - Nueva York",
        "lat": 40.6413,
        "lng": -73.7781
    },
    "LAX": {
        "nombre": "Los Ángeles",
        "lat": 33.9416,
        "lng": -118.4085
    },
    "MAD": {
        "nombre": "Madrid - España",
        "lat": 40.4983,
        "lng": -3.5676
    },
    "PTY": {
        "nombre": "Tocumen - Panamá",
        "lat": 9.0714,
        "lng": -79.3835
    },
    "CHI": {
        "nombre": "Chile - Santiago",
        "lat": -33.3929,
        "lng": -70.7858
    },
    "BR": {
        "nombre": "Brasil - São Paulo",
        "lat": -23.4356,
        "lng": -46.4731
    }
}

# INTEGRACIÓN DEL GRAFO

def construir_red():
    red = GrafoAeropuertos()

    for codigo in GRAFO_PROPUESTA:

        if codigo not in AEROPUERTOS:
            raise RuntimeError(
                f"Faltan coordenadas para {codigo}"
            )

        nombre = AEROPUERTOS[codigo]["nombre"]

        if len(codigo) == 3:
            red.registrar_aeropuerto(codigo, nombre)
        else:
            # BR tiene dos letras en la propuesta.
            red.aeropuertos[codigo] = nombre
            red.grafo[codigo] = {}

    for origen, destinos in GRAFO_PROPUESTA.items():

        for destino, distancia in destinos.items():

            if len(origen) == 3 and len(destino) == 3:
                red.registrar_vuelo(
                    origen,
                    destino,
                    distancia
                )
            else:
                red.grafo[origen][destino] = float(distancia)

    return red


RED = construir_red()