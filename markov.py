

ESTADOS = ["A tiempo", "Retrasado", "Cancelado"]

# Matriz de transicion P[origen][destino] (cada fila suma 1.0)
MATRIZ_TRANSICION = [
    [0.75, 0.20, 0.05],  # Desde: A tiempo
    [0.35, 0.50, 0.15],  # Desde: Retrasado
    [0.15, 0.30, 0.55],  # Desde: Cancelado
]


def validar_matriz(matriz):
    n = len(ESTADOS)
    if len(matriz) != n:
        return False
    for fila in matriz:
        if len(fila) != n or any(p < 0 or p > 1 for p in fila):
            return False
        if abs(sum(fila) - 1.0) > 1e-6:
            return False
    return True


def obtener_vector_inicial(estado_inicial):
    # Acepta nombre de estado ("A tiempo"), indice (0..2) o vector [p0, p1, p2]
    if isinstance(estado_inicial, list) and len(estado_inicial) == len(ESTADOS):
        if any(p < 0 or p > 1 for p in estado_inicial) or abs(sum(estado_inicial) - 1.0) > 1e-6:
            raise ValueError("El vector de probabilidades inicial debe sumar 1.0.")
        return list(estado_inicial)

    if isinstance(estado_inicial, int) and 0 <= estado_inicial < len(ESTADOS):
        indice = estado_inicial
    elif isinstance(estado_inicial, str):
        estados_norm = [e.lower() for e in ESTADOS]
        clave = estado_inicial.strip().lower()
        if clave not in estados_norm:
            raise ValueError(f"Estado invalido: '{estado_inicial}'. Use: {', '.join(ESTADOS)}")
        indice = estados_norm.index(clave)
    else:
        raise ValueError("El estado inicial debe ser nombre, indice o vector de probabilidades.")

    vector = [0.0] * len(ESTADOS)
    vector[indice] = 1.0
    return vector


def multiplicar_vector_matriz(vector, matriz):
    n = len(matriz)
    return [
        sum(vector[i] * matriz[i][j] for i in range(n))
        for j in range(n)
    ]


def multiplicar_matrices(m1, m2):
    n = len(m1)
    return [
        [sum(m1[i][k] * m2[k][j] for k in range(n)) for j in range(n)]
        for i in range(n)
    ]


def potencia_matriz(matriz, periodos):
    # Calcula P^n para obtener probabilidades de transicion en n periodos
    n = len(matriz)
    resultado = [[1.0 if i == j else 0.0 for j in range(n)] for i in range(n)]
    base = [fila[:] for fila in matriz]
    exp = periodos

    while exp > 0:
        if exp % 2 == 1:
            resultado = multiplicar_matrices(resultado, base)
        base = multiplicar_matrices(base, base)
        exp //= 2

    return resultado


def calcular_probabilidades_periodos(estado_inicial="A tiempo", periodos=3, matriz=MATRIZ_TRANSICION):
    if periodos < 1:
        raise ValueError("El numero de periodos debe ser al menos 1.")
    if not validar_matriz(matriz):
        raise ValueError("La matriz de transicion no es valida (cada fila debe sumar 1.0).")

    vector_actual = obtener_vector_inicial(estado_inicial)
    resultados = []

    for periodo in range(1, periodos + 1):
        vector_actual = multiplicar_vector_matriz(vector_actual, matriz)
        probabilidades = {ESTADOS[i]: round(vector_actual[i], 6) for i in range(len(ESTADOS))}
        estado_probable = max(probabilidades, key=probabilidades.get)
        resultados.append({
            "periodo": periodo,
            "probabilidades": probabilidades,
            "estado_mas_probable": estado_probable,
        })

    return resultados


def mostrar_matriz_transicion(matriz=MATRIZ_TRANSICION):
    print("\n" + "=" * 58)
    print("  MATRIZ DE TRANSICION DE ESTADOS DE VUELO")
    print("=" * 58)
    encabezado = f"{'Estado actual':<15}" + "".join(f"{e:>14}" for e in ESTADOS)
    print(encabezado)
    print("-" * 58)
    for i, estado in enumerate(ESTADOS):
        fila_txt = "".join(f"{matriz[i][j] * 100:>13.1f}%" for j in range(len(ESTADOS)))
        print(f"{estado:<15}{fila_txt}")
    print("=" * 58)


def mostrar_prediccion(estado_inicial="A tiempo", periodos=3, ruta=None, matriz=MATRIZ_TRANSICION):
    # Funcion principal para mostrar resultados y retornar datos estructurados a main.py
    historial = calcular_probabilidades_periodos(estado_inicial, periodos, matriz)
    final = historial[-1]
    vector_ini = obtener_vector_inicial(estado_inicial)
    estado_txt = (
        ESTADOS[vector_ini.index(1.0)]
        if vector_ini.count(1.0) == 1 and vector_ini.count(0.0) == len(ESTADOS) - 1
        else str(estado_inicial)
    )

    print("\n" + "=" * 58)
    print("  PREDICCION DE ESTADO DE VUELOS (CADENAS DE MARKOV)")
    print("=" * 58)
    if ruta:
        print(f"- Ruta evaluada  : {' -> '.join(ruta)}")
    print(f"- Estado inicial : {estado_txt}")
    print(f"- Periodos       : {periodos}")
    print("-" * 58)
    print(f"{'Periodo':<10}" + "".join(f"{e:>16}" for e in ESTADOS))
    print("-" * 58)

    for item in historial:
        probs = item["probabilidades"]
        fila = "".join(f"{probs[e] * 100:>15.2f}%" for e in ESTADOS)
        print(f"{item['periodo']:<10}{fila}")

    print("-" * 58)
    prob_max = final["probabilidades"][final["estado_mas_probable"]] * 100
    print(f"- Prediccion final (periodo {periodos}): {final['estado_mas_probable']} ({prob_max:.2f}%)")
    print("=" * 58 + "\n")

    return {
        "estado_inicial": estado_txt,
        "periodos": periodos,
        "ruta": ruta,
        "historial": historial,
        "probabilidades_finales": final["probabilidades"],
        "estado_mas_probable": final["estado_mas_probable"],
    }


def solicitar_y_predecir(ruta=None):
    # Funcion interactiva lista para invocarse desde el menu principal en main.py
    print("\nEstados disponibles: 1) A tiempo  2) Retrasado  3) Cancelado")
    opcion = input("Seleccione el estado actual del vuelo (1-3) [1]: ").strip() or "1"

    mapa_opciones = {"1": "A tiempo", "2": "Retrasado", "3": "Cancelado"}
    estado_inicial = mapa_opciones.get(opcion, opcion)

    periodos_default = max(1, len(ruta) - 1) if ruta and len(ruta) > 1 else 3
    entrada_periodos = input(f"Ingrese la cantidad de periodos a predecir [{periodos_default}]: ").strip()

    try:
        periodos = int(entrada_periodos) if entrada_periodos else periodos_default
        return mostrar_prediccion(estado_inicial=estado_inicial, periodos=periodos, ruta=ruta)
    except ValueError as err:
        print(f"[!] Error: {err}")
        return None


if __name__ == "__main__":
    mostrar_matriz_transicion()
    mostrar_prediccion(estado_inicial="A tiempo", periodos=4, ruta=["GUA", "MIA", "MAD"])
