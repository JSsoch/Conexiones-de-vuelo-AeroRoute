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

    # MARKOV - PREDICCIÓN DEL VUELO

    historial = calcular_probabilidades_periodos(
        estado_inicial=estado,
        periodos=periodos
    )

    ultimo = historial[-1]

    # PREPARAR LOS TRAMOS DEL AVIÓN


    tramos = []

    for i in range(len(recorrido) - 1):

        aeropuerto_actual = recorrido[i]
        aeropuerto_siguiente = recorrido[i + 1]

        tramos.append({
            "origen": aeropuerto_actual,
            "destino": aeropuerto_siguiente,
            "distancia": RED.grafo[
                aeropuerto_actual
            ][aeropuerto_siguiente]
        })

    return {
        "origen": origen,
        "destino": destino,
        "ruta": recorrido,
        "escalas": escalas,
        "distancia_total": distancia,
        "tramos": tramos,

        "validacion": {
            "valida": es_valida,
            "mensaje": mensaje
        },

        "prediccion": {
            "estado_inicial": estado,
            "periodos": periodos,
            "historial": historial,
            "probabilidades_finales": ultimo["probabilidades"],
            "estado_mas_probable": ultimo["estado_mas_probable"]
        }
    }

# SERVIDOR WEB

class AeroRouteHandler(BaseHTTPRequestHandler):

    def responder(self, status, contenido, tipo):

        self.send_response(status)

        self.send_header("Content-Type", tipo)

        self.send_header(
            "Content-Length",
            str(len(contenido))
        )

        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")

        self.end_headers()
        self.wfile.write(contenido)

    def responder_json(self, status, datos):

        contenido = json.dumps(
            datos,
            ensure_ascii=False
        ).encode("utf-8")

        self.responder(
            status,
            contenido,
            "application/json; charset=utf-8"
        )

    def do_GET(self):

        peticion = urlparse(self.path)

        archivos = {
            "/": (
                WEB / "index.html",
                "text/html; charset=utf-8"
            ),

            "/web/estilos.css": (
                WEB / "estilos.css",
                "text/css; charset=utf-8"
            ),

            "/web/app.js": (
                WEB / "app.js",
                "application/javascript; charset=utf-8"
            )
        }

        # Entregar HTML, CSS y JavaScript.

        if peticion.path in archivos:

            archivo, tipo = archivos[peticion.path]

            if not archivo.is_file():

                self.responder_json(500, {
                    "error": f"Falta el archivo {archivo.name}."
                })

                return

            self.responder(
                200,
                archivo.read_bytes(),
                tipo
            )

            return

        # API que muestra los aeropuertos y conexiones.

        if peticion.path == "/api/red":

            self.responder_json(
                200,
                datos_red()
            )

            return

        # API para calcular rutas.

        if peticion.path == "/api/ruta":

            parametros = parse_qs(peticion.query)

            try:

                origen = parametros.get(
                    "origen", [""]
                )[0]

                destino = parametros.get(
                    "destino", [""]
                )[0]

                estado = parametros.get(
                    "estado", ["A tiempo"]
                )[0]

                periodos = int(
                    parametros.get("periodos", ["3"])[0]
                )

                resultado = consultar_ruta(
                    origen,
                    destino,
                    estado,
                    periodos
                )

                self.responder_json(200, resultado)

            except (ValueError, TypeError) as error:

                self.responder_json(400, {
                    "error": str(error)
                })

            return

        self.responder_json(404, {
            "error": "Recurso no encontrado."
        })

# INICIO DEL SISTEMA


def main():

    host = "127.0.0.1"
    puerto = 8000

    servidor = ThreadingHTTPServer(
        (host, puerto),
        AeroRouteHandler
    )

    print("=" * 55)
    print("AEROROUTE - SISTEMA WEB DE VUELOS")
    print("=" * 55)

    print(f"Aeropuertos: {len(RED.grafo)}")

    print(
        "Conexiones:",
        sum(len(v) for v in RED.grafo.values())
    )

    print(
        f"Página web: http://{host}:{puerto}"
    )

    print("Presiona Ctrl+C para finalizar.")
    print("=" * 55)

    try:
        servidor.serve_forever()

    except KeyboardInterrupt:
        print("\nServidor finalizado.")

    finally:
        servidor.server_close()


if __name__ == "__main__":
    main()


