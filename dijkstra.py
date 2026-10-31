"""
Archivo: dijkstra.py
Descripción: Módulo de búsqueda de rutas aéreas óptimas mediante el algoritmo de Dijkstra.
"""

import heapq
from typing import Dict, List, Tuple, Union, Optional

# Tipo flexible para soportar distintas estructuras que Nando defina en aeropuertos.py
GrafoTipo = Dict[str, Union[Dict[str, float], List[Tuple[str, float]]]]


def _obtener_vecinos(grafo: GrafoTipo, nodo: str) -> List[Tuple[str, float]]:
    """
    Normaliza la obtención de vecinos y pesos sin importar si el grafo
    usa diccionarios anidados o listas de tuplas (destino, distancia).
    """
    conexiones = grafo.get(nodo, {})
    if isinstance(conexiones, dict):
        return list(conexiones.items())
    elif isinstance(conexiones, list):
        return conexiones
    return []


def calcular_dijkstra(
    grafo: GrafoTipo, origen: str, destino: str
) -> Tuple[Optional[float], List[str], List[str]]:
    """
    Implementa el algoritmo de Dijkstra para encontrar la ruta aérea más corta.

    Parámetros:
        grafo: Estructura de adyacencia con aeropuertos y distancias en km.
        origen: Código IATA del aeropuerto de salida (ej. 'GUA').
        destino: Código IATA del aeropuerto de llegada (ej. 'MAD').

    Retorna:
        Tupla (distancia_total, recorrido_completo, escalas)
        Si no existe ruta válida, retorna (None, [], []).
    """
    origen = origen.strip().upper()
    destino = destino.strip().upper()

    if origen not in grafo or destino not in grafo:
        return None, [], []

    if origen == destino:
        return 0.0, [origen], []

    # Inicialización de distancias mínimas y registro de predecesores
    distancias: Dict[str, float] = {aeropuerto: float("inf") for aeropuerto in grafo}
    predecesores: Dict[str, Optional[str]] = {aeropuerto: None for aeropuerto in grafo}
    distancias[origen] = 0.0

    # Cola de prioridad: almacena tuplas (distancia_acumulada, aeropuerto_actual)
    cola_prioridad: List[Tuple[float, str]] = [(0.0, origen)]
    visitados = set()

    while cola_prioridad:
        distancia_actual, actual = heapq.heappop(cola_prioridad)

        if actual in visitados:
            continue
        visitados.add(actual)

        # Si llegamos al aeropuerto destino, terminamos la búsqueda
        if actual == destino:
            break

        for vecino, peso in _obtener_vecinos(grafo, actual):
            if vecino not in grafo or vecino in visitados:
                continue

            nueva_distancia = distancia_actual + peso
            if nueva_distancia < distancias.get(vecino, float("inf")):
                distancias[vecino] = nueva_distancia
                predecesores[vecino] = actual
                heapq.heappush(cola_prioridad, (nueva_distancia, vecino))

    # Verificar si el destino fue alcanzado
    if distancias[destino] == float("inf"):
        return None, [], []

    # Reconstrucción del recorrido desde el destino hacia el origen
    recorrido: List[str] = []
    nodo_actual: Optional[str] = destino
    while nodo_actual is not None:
        recorrido.append(nodo_actual)
        nodo_actual = predecesores[nodo_actual]
    recorrido.reverse()

    # Las escalas corresponden a los aeropuertos intermedios (excluyendo origen y destino)
    escalas = recorrido[1:-1]

    return distancias[destino], recorrido, escalas


def mostrar_ruta_optima(grafo: GrafoTipo, origen: str, destino: str) -> Optional[Dict]:
    """
    Recibe el origen y destino, ejecuta el cálculo de Dijkstra, muestra en consola
    el detalle del recorrido, escalas y distancia total, y retorna los datos estructurados
    para facilitar la integración con main.py y automata.py.
    """
    origen = origen.strip().upper()
    destino = destino.strip().upper()

    print("\n" + "=" * 55)
    print(f"  BÚSQUEDA DE RUTA ÓPTIMA: {origen} -> {destino}")
    print("=" * 55)

    if origen not in grafo:
        print(f"[!] Error: El aeropuerto de origen '{origen}' no está registrado.")
        return None
    if destino not in grafo:
        print(f"[!] Error: El aeropuerto de destino '{destino}' no está registrado.")
        return None

    distancia_total, recorrido, escalas = calcular_dijkstra(grafo, origen, destino)

    if distancia_total is None or not recorrido:
        print(f"[!] No existe una ruta aérea disponible entre {origen} y {destino}.")
        return None

    # Formateo del recorrido y escalas
    ruta_formateada = " -> ".join(recorrido)
    print(f"• Recorrido más corto : {ruta_formateada}")

    if escalas:
        print(f"• Escalas necesarias  : {len(escalas)} ({', '.join(escalas)})")
    else:
        print("• Escalas necesarias  : Ninguna (Vuelo directo)")

    print(f"• Distancia total     : {distancia_total:,.2f} km")

    # Desglose tramo por tramo
    if len(recorrido) > 1:
        print("\nDetalle de tramos:")
        for i in range(len(recorrido) - 1):
            salida = recorrido[i]
            llegada = recorrido[i + 1]
            dist_tramo = dict(_obtener_vecinos(grafo, salida)).get(llegada, 0.0)
            print(f"  {i + 1}. {salida} -> {llegada}: {dist_tramo:,.2f} km")

    print("=" * 55 + "\n")

    return {
        "origen": origen,
        "destino": destino,
        "recorrido": recorrido,
        "escalas": escalas,
        "distancia_total": distancia_total,
    }


def solicitar_y_calcular(grafo: GrafoTipo) -> Optional[Dict]:
    """
    Función interactiva lista para ser invocada directamente desde el menú en main.py.
    """
    origen = input("Ingrese el código del aeropuerto de origen (ej. GUA): ").strip().upper()
    destino = input("Ingrese el código del aeropuerto de destino (ej. MAD): ").strip().upper()
    return mostrar_ruta_optima(grafo, origen, destino)


# =====================================================================
# Bloque de prueba independiente (se ejecuta solo al correr dijkstra.py)
# =====================================================================
if __name__ == "__main__":
    # Grafo de prueba simulando la estructura de aeropuertos.py (Nando)
    grafo_prueba = {
        "GUA": {"MEX": 1055.0, "MIA": 1645.0, "PTY": 1350.0},
        "MEX": {"GUA": 1055.0, "MIA": 2055.0, "MAD": 9065.0},
        "MIA": {"GUA": 1645.0, "MEX": 2055.0, "MAD": 7105.0},
        "PTY": {"GUA": 1350.0, "MIA": 1860.0, "MAD": 8150.0},
        "MAD": {"MEX": 9065.0, "MIA": 7105.0, "PTY": 8150.0},
    }

    print("--- PRUEBA DEL MÓDULO DIJKSTRA ---")
    # Caso 1: Ruta con escala óptima (GUA -> MIA -> MAD es más corto que GUA -> MEX -> MAD)
    mostrar_ruta_optima(grafo_prueba, "GUA", "MAD")

    # Caso 2: Vuelo directo
    mostrar_ruta_optima(grafo_prueba, "GUA", "MEX")