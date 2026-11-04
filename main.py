"""AeroRoute - Integración web del proyecto."""

import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from math import isfinite
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from aeropuertos import GrafoAeropuertos, normalizar_codigo
from dijkstra import calcular_dijkstra
from automata import grafo as GRAFO_PROPUESTA
from automata import sincronizar_alfabeto, validar_ruta, calcular_peso_ruta
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

        red.registrar_aeropuerto(codigo, nombre)

    for origen, destinos in GRAFO_PROPUESTA.items():

        for destino, distancia in destinos.items():

            red.registrar_vuelo(
                origen,
                destino,
                distancia
            )

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

# EDICIÓN DEL GRAFO EN MEMORIA

def _numero(datos, clave, etiqueta):
    """Convierte un campo JSON a float y rechaza valores no finitos."""

    if clave not in datos:
        raise ValueError(f"Falta el campo '{clave}'.")

    valor = datos[clave]

    if isinstance(valor, bool):
        raise ValueError(f"{etiqueta} debe ser un número válido.")

    try:
        numero = float(valor)

    except (TypeError, ValueError, OverflowError):
        raise ValueError(
            f"{etiqueta} debe ser un número válido."
        ) from None

    if not isfinite(numero):
        raise ValueError(f"{etiqueta} debe ser un número finito.")

    return numero


def agregar_aeropuerto(datos):
    """Valida y registra un aeropuerto nuevo en la red activa."""

    if "codigo" not in datos:
        raise ValueError("Falta el campo 'codigo'.")

    codigo = normalizar_codigo(datos["codigo"])

    if codigo in RED.grafo:
        raise ValueError(f"El aeropuerto '{codigo}' ya está registrado.")

    if "nombre" not in datos:
        raise ValueError("Falta el campo 'nombre'.")

    nombre = datos["nombre"]

    if not isinstance(nombre, str) or not nombre.strip():
        raise ValueError("El nombre del aeropuerto no puede estar vacío.")

    nombre = nombre.strip()

    if len(nombre) > 120:
        raise ValueError("El nombre del aeropuerto es demasiado largo.")

    lat = _numero(datos, "lat", "La latitud")

    if "lon" in datos:
        clave_lon = "lon"
    elif "lng" in datos:
        clave_lon = "lng"
    else:
        raise ValueError("Falta el campo 'lon'.")

    lon = _numero(datos, clave_lon, "La longitud")

    if not -90 <= lat <= 90:
        raise ValueError("La latitud debe estar entre -90 y 90.")

    if not -180 <= lon <= 180:
        raise ValueError("La longitud debe estar entre -180 y 180.")

    # Registrar primero en el grafo: si algo falla, AEROPUERTOS no cambia.

    RED.registrar_aeropuerto(codigo, nombre)

    AEROPUERTOS[codigo] = {
        "nombre": nombre,
        "lat": lat,
        "lng": lon
    }

    sincronizar_alfabeto(RED.grafo)

    return {
        "mensaje": f"Aeropuerto {codigo} agregado correctamente.",
        "aeropuerto": {
            "codigo": codigo,
            **AEROPUERTOS[codigo]
        },
        "total_aeropuertos": len(RED.grafo),
        "total_conexiones": sum(
            len(destinos) for destinos in RED.grafo.values()
        ),
        "red": datos_red()
    }


def agregar_vuelo(datos):
    """Valida y registra o actualiza una conexión de vuelo."""

    for clave in ("origen", "destino"):
        if clave not in datos:
            raise ValueError(f"Falta el campo '{clave}'.")

    origen = normalizar_codigo(datos["origen"])
    destino = normalizar_codigo(datos["destino"])

    if origen == destino:
        raise ValueError("El origen y el destino deben ser diferentes.")

    for codigo in (origen, destino):
        if codigo not in RED.grafo:
            raise ValueError(f"El aeropuerto '{codigo}' no está registrado.")

    for clave in ("distancia", "distancia_km", "peso"):
        if clave in datos:
            clave_distancia = clave
            break
    else:
        raise ValueError("Falta el campo 'distancia'.")

    distancia = _numero(
        datos,
        clave_distancia,
        "La distancia"
    )

    if distancia <= 0:
        raise ValueError("La distancia debe ser mayor que cero.")

    bidireccional = datos.get("bidireccional", False)

    if not isinstance(bidireccional, bool):
        raise ValueError(
            "El campo 'bidireccional' debe ser verdadero o falso."
        )

    actualizado = RED.registrar_vuelo(
        origen,
        destino,
        distancia,
        bidireccional=bidireccional,
        actualizar=True
    )

    accion = "actualizada" if actualizado else "agregada"

    return {
        "mensaje": (
            f"Conexión {origen} -> {destino} {accion} correctamente."
        ),
        "actualizado": actualizado,
        "vuelo": {
            "origen": origen,
            "destino": destino,
            "distancia": distancia,
            "bidireccional": bidireccional
        },
        "total_aeropuertos": len(RED.grafo),
        "total_conexiones": sum(
            len(destinos) for destinos in RED.grafo.values()
        ),
        "red": datos_red()
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

    def leer_json(self):

        tipo = self.headers.get("Content-Type", "")

        if tipo and "application/json" not in tipo.lower():
            raise ValueError(
                "El cuerpo debe enviarse como application/json."
            )

        longitud_texto = self.headers.get("Content-Length")

        if longitud_texto is None:
            raise ValueError("Falta la longitud del contenido.")

        try:
            longitud = int(longitud_texto)

        except (TypeError, ValueError):
            raise ValueError(
                "La longitud del contenido no es válida."
            ) from None

        if longitud <= 0:
            raise ValueError("El cuerpo JSON está vacío.")

        if longitud > 1_000_000:
            raise ValueError("El cuerpo JSON es demasiado grande.")

        cuerpo = self.rfile.read(longitud)

        try:
            datos = json.loads(cuerpo.decode("utf-8"))

        except (UnicodeDecodeError, json.JSONDecodeError):
            raise ValueError(
                "El cuerpo no contiene un JSON válido."
            ) from None

        if not isinstance(datos, dict):
            raise ValueError("El JSON debe ser un objeto.")

        return datos

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

    def do_POST(self):

        peticion = urlparse(self.path)

        rutas = {
            "/api/aeropuerto": agregar_aeropuerto,
            "/api/vuelo": agregar_vuelo
        }

        if peticion.path not in rutas:

            self.responder_json(404, {
                "error": "Recurso no encontrado."
            })

            return

        try:

            datos = self.leer_json()

            resultado = rutas[peticion.path](datos)

            if peticion.path == "/api/aeropuerto":
                estado = 201
            else:
                estado = 200 if resultado.get("actualizado") else 201

            self.responder_json(estado, resultado)

        except (ValueError, TypeError) as error:

            self.responder_json(400, {
                "error": str(error)
            })

        except Exception as error:

            self.responder_json(500, {
                "error": f"Error interno del servidor: {error}"
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


