
# Alfabeto: codigos de los aeropuertos
ALFABETO = [
    "GUA", "SAL", "MEX", "MIA", "JFK",
    "LAX", "MAD", "PTY", "CHI", "BR"
]


def validar_ruta(ruta, origen, destino, grafo):

    # Verificar que la ruta no este vacia
    if not ruta:
        return False, "La ruta esta vacia."

    # Verificar que los aeropuertos existan
    for aeropuerto in ruta:
        if aeropuerto not in ALFABETO:
            return False, "El aeropuerto no pertenece al alfabeto."

        if aeropuerto not in grafo:
            return False, "El aeropuerto no existe en el grafo."

    # Verificar el aeropuerto de origen
    if ruta[0] != origen:
        return False, "La ruta no comienza en el origen indicado."

    # Verificar el aeropuerto de destino
    if ruta[-1] != destino:
        return False, "La ruta no termina en el destino indicado."

    # Verificar las transiciones entre aeropuertos
    for i in range(len(ruta) - 1):

        actual = ruta[i]
        siguiente = ruta[i + 1]

        if siguiente not in grafo[actual]:
            return False, "No existe vuelo de " + actual + " a " + siguiente

    return True, "La ruta es valida."


def calcular_peso_ruta(ruta, grafo):

    distancia_total = 0

    for i in range(len(ruta) - 1):

        actual = ruta[i]
        siguiente = ruta[i + 1]

        if actual not in grafo:
            return None

        if siguiente not in grafo[actual]:
            return None

        distancia_total = distancia_total + grafo[actual][siguiente]

    return distancia_total

from automata import validar_ruta, calcular_peso_ruta

grafo = {
    "GUA": {
        "SAL": 200,
        "MEX": 1060,
        "PTY": 1350
    },

    "SAL": {
        "MEX": 1250,
        "MIA": 1650
    },

    "MEX": {
        "MIA": 2060,
        "LAX": 2500
    },

    "MIA": {
        "JFK": 1760,
        "MAD": 7100
    },

    "JFK": {
        "MAD": 5760
    },

    "LAX": {
        "JFK": 3980
    },

    "PTY": {
        "MIA": 1860,
        "MAD": 8200,
        "CHI": 10300
    },

    "CHI": {
        "GUA": 9750,
        "BR": 11810
    },

    "BR": {
        "MIA": 9500,
        "MEX": 15802
    },

    "MAD": {}
}

origen = "GUA"
destino = "MAD"

ruta = ["GUA", "SAL", "MIA", "MAD"]

print("===== AEROROUTE =====")
print("Validacion de ruta mediante automata")

valida, mensaje = validar_ruta(
    ruta, origen, destino, grafo
)

print("Ruta:", " -> ".join(ruta))
print("Resultado:", mensaje)

if valida:
    distancia = calcular_peso_ruta(ruta, grafo)
    print("Distancia total:", distancia, "km")

print("=====================")
