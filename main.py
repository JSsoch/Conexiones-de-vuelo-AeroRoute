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

# INFORMACIÓN PARA LA PÁGINA

def datos_red():

    conexiones = []

    for origen, destinos in RED.grafo.items():

        for destino, distancia in destinos.items():

            conexiones.append({
                "origen": origen,
                "destino": destino,
                "distancia": distancia
            })

    aeropuertos = []

    for codigo in RED.grafo:

        aeropuerto = {
            "codigo": codigo,
            **AEROPUERTOS[codigo]
        }

        aeropuertos.append(aeropuerto)

    return {
        "aeropuertos": aeropuertos,
        "conexiones": conexiones,
        "total_aeropuertos": len(RED.grafo),
        "total_conexiones": len(conexiones),
        "estados": ESTADOS,
        "matriz_markov": MATRIZ_TRANSICION
    }

# CÁLCULO DE RUTAS

def consultar_ruta(
    origen,
    destino,
    estado="A tiempo",
    periodos=3
):

    origen = origen.strip().upper()
    destino = destino.strip().upper()

    if origen not in RED.grafo or destino not in RED.grafo:
        raise ValueError(
            "Selecciona dos aeropuertos registrados."
        )

    if origen == destino:
        raise ValueError(
            "El origen y el destino deben ser diferentes."
        )

    if estado not in ESTADOS:
        raise ValueError(
            "El estado inicial no es válido."
        )

    if not 1 <= periodos <= 20:
        raise ValueError(
            "Selecciona entre 1 y 20 períodos."
        )

    # DIJKSTRA - RUTA MÁS CORTA

    distancia, recorrido, escalas = calcular_dijkstra(
        RED.grafo,
        origen,
        destino
    )

    if distancia is None or not recorrido:
        raise ValueError(
            f"No existe una ruta de {origen} hacia {destino}."
        )

    # AUTÓMATA - VALIDACIÓN DE RUTA

    es_valida, mensaje = validar_ruta(
        recorrido,
        origen,
        destino,
        RED.grafo
    )

    if not es_valida:
        raise ValueError(
            f"El autómata rechazó la ruta: {mensaje}"
        )

    peso_validado = calcular_peso_ruta(
        recorrido,
        RED.grafo
    )

    if (
        peso_validado is None
        or abs(peso_validado - distancia) > 0.000001
    ):
        raise ValueError(
            "La distancia del autómata no coincide con Dijkstra."
        )
