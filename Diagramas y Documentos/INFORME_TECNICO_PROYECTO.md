# Informe Técnico del Proyecto: AeroRoute (Sistema de Rutas Aéreas y Autómatas Ponderados)

Este documento contiene la inspección técnica exhaustiva y formal del código fuente, arquitectura, estructuras de datos y lógica matemática del repositorio **AeroRoute**, estructurado para la elaboración del Informe Final del curso de **Lenguajes Formales y Autómatas**.

---

## 1. Stack Tecnológico y Arquitectura

### Lenguaje de Programación y Dependencias
* **Backend:** **Python 3** (compatible con Python 3.9+).
  * **Dependencias externas:** **Ninguna (Zero External Dependencies)**. Todo el backend está desarrollado utilizando exclusivamente la biblioteca estándar de Python:
    * `http.server` (`ThreadingHTTPServer`, `BaseHTTPRequestHandler`): Servidor HTTP concurrente multihilo.
    * `urllib.parse` (`urlparse`, `parse_qs`): Descomposición y análisis de URLs y cadenas de consulta (*query strings*).
    * `json`: Serialización y deserialización de datos para la API REST.
    * `pathlib` (`Path`): Resolución de rutas absolutas y relativas del sistema de archivos de forma agnóstica al SO.
    * `heapq`: Implementación del montículo binario (*min-heap*) para la cola de prioridad del algoritmo de Dijkstra.
    * `typing` (`Dict`, `List`, `Tuple`, `Union`, `Optional`): Tipado estático formal de estructuras de datos.
    * `math` (`isfinite`): Validaciones de valores numéricos finitos para distancias.
* **Frontend:**
  * **HTML5:** Estructura semántica sin frameworks (`web/index.html`).
  * **CSS3:** Hoja de estilos personalizada (`web/estilos.css`) con variables de tema oscuro (*Dark Mode*), maquetación mediante CSS Grid y Flexbox, y tipografías web (`DM Sans` y `Outfit` vía Google Fonts).
  * **JavaScript:** JavaScript Vanilla moderno (ES6+, `"use strict"`) sin transpiladores ni frameworks externos (`web/app.js`).
* **Librerías de Renderizado de Grafos y Mapas:**
  1. **Motor Principal (Web/SIG):** **Leaflet.js v1.9.4** cargado vía CDN (`https://unpkg.com/leaflet@1.9.4/dist/leaflet.js` y `leaflet.css`), utilizando capas de teselas (*tile layers*) oscuras provistas por CartoDB (`CartoDB Dark Matter`). Utiliza `L.divIcon` para los nodos/aeropuertos y `L.polyline` para aristas y rutas resaltadas.
  2. **Motor de Contingencia (Fallback Local):** Implementado en el elemento `<canvas id="mapa-local">` mediante la API **2D Canvas de HTML5**. Se activa automáticamente cuando la librería Leaflet no está disponible o falla su carga desde CDN; renderiza proyecciones geográficas locales, masas continentales vectoriales (`MASAS_TERRESTRES`), nodos circulares, líneas de conexiones y el desplazamiento de la aeronave.

### Estructura de Carpetas y Responsabilidad de Módulos

```text
Proyecto Final/
├── aeropuertos.py       # Modelo OOP del grafo de aeropuertos, validación de códigos y aristas.
├── automata.py          # Definición formal del autómata, alfabeto, topología base y validación de cadenas.
├── dijkstra.py          # Implementación del algoritmo de Dijkstra con cola de prioridad binaria (heapq).
├── markov.py            # Modelo estocástico matricial (Cadenas de Markov) para predicción de retrasos.
├── main.py              # Orquestador del sistema y servidor HTTP local con API REST.
├── README.md            # Identificador del proyecto (# Conexiones-de-vuelo-AeroRoute).
└── web/
    ├── app.js           # Lógica del cliente: consumo de API, control de Leaflet/Canvas y animación.
    ├── estilos.css      # Reglas visuales, estilos de pines, resplandor de aristas y panel de control.
    └── index.html       # Interfaz gráfica de usuario con panel de control y visor geográfico.
```

* `main.py`: Orquesta la aplicación. Inicializa la red con coordenadas geográficas globales (`AEROPUERTOS`), instancia el servidor `ThreadingHTTPServer` en el puerto `8000`, expone los endpoints `/api/red` y `/api/ruta`, e integra secuencialmente Dijkstra, la validación del autómata y las cadenas de Markov.
* `aeropuertos.py`: Define la clase `GrafoAeropuertos`. Proporciona métodos para registrar nodos y vuelos con tipado fuerte y validaciones sintácticas.
* `automata.py`: Define el conjunto de símbolos terminales (`ALFABETO`), la topología base del grafo (`grafo`) y las funciones formales `validar_ruta` y `calcular_peso_ruta`.
* `dijkstra.py`: Contiene la función `calcular_dijkstra`, utilidades para visualización en consola y tests unitarios directos.
* `markov.py`: Implementa álgebra matricial nativa (sin NumPy) para calcular las probabilidades de transición de estados de vuelo (*A tiempo*, *Retrasado*, *Cancelado*) tras $n$ períodos.

### Tipo de Grafo y Estructuración en Memoria
* **Tipo de Grafo:** **Grafo Dirigido Ponderado (Dígrafo con pesos)**. Cada arista posee dirección definida $u \to v$ y un peso $w(u, v) > 0$. Aunque el método `registrar_vuelo` en `aeropuertos.py` acepta un argumento opcional `bidireccional=True`, la topología oficial de la red propuesta en `automata.py` y desplegada en `main.py` es estrictamente dirigida (las conexiones son unidireccionales a menos que se defina explícitamente el arco inverso).
* **Estructura en Memoria:** **Lista de Adyacencia implementada mediante Diccionarios Anidados (*Hash Maps* encadenados):**
  $$\text{grafo}: \text{Dict}[\text{str}, \text{Dict}[\text{str}, \text{float}]]$$
  * **Nivel 1 (Clave externa):** Código IATA del nodo origen (ej. `"GUA"`).
  * **Nivel 2 (Clave interna):** Código IATA del nodo destino vecino (ej. `"SAL"`).
  * **Valor numérico:** Distancia en kilómetros en formato decimal/flotante (ej. `200.0`).
  * En `dijkstra.py`, la función `_obtener_vecinos` normaliza el acceso soportando tanto diccionarios anidados como listas de tuplas `List[Tuple[str, float]]`.

---

## 2. Requerimientos Funcionales (Entradas, Procesos y Salidas)

### Entradas
* **Definición de la Red (Nodos, Aristas y Pesos):** 
  * En la arquitectura actual, **no existe captura de archivos externos (JSON, CSV, TXT) ni formularios de inserción en la UI** para crear nuevos nodos/aristas en caliente. La topología está **precargada en el código fuente** en el diccionario `grafo` de `automata.py` y mapeada con coordenadas en el diccionario `AEROPUERTOS` de `main.py`.
  * Programáticamente, la clase `GrafoAeropuertos` admite la entrada vía métodos:
    * `registrar_aeropuerto(codigo: str, nombre: str)`
    * `registrar_vuelo(origen: str, destino: str, distancia_km: float, bidireccional: bool = False)`
* **Parámetros de Consulta del Usuario:**
  * **Modo Web:** Mediante el formulario `<form id="form-vuelos">`:
    1. `origen`: Cadena seleccionada en `<select id="origen">` (ej. `"GUA"`).
    2. `destino`: Cadena seleccionada en `<select id="destino">` (ej. `"MAD"`).
    3. `estado`: Estado de partida para Markov en `<select id="estado">` (`"A tiempo"`, `"Retrasado"` o `"Cancelado"`).
    4. `periodos`: Número entero en `<select id="periodos">` ($1 \le \text{períodos} \le 6$ en la UI, hasta 20 permitido por el backend).
    * *Formato HTTP exacto:* Petición `GET` a `/api/ruta?origen=GUA&destino=MAD&estado=A%20tiempo&periodos=3`.
  * **Modo Consola:** Mediante la función interactiva `solicitar_y_calcular(grafo)` en `dijkstra.py`, solicitando cadenas por teclado con `input()`.

### Procesos y Validaciones
1. **Normalización y Sintaxis de Identificadores:**
   * La función `_normalizar_codigo(codigo)` valida que el código sea de tipo `str`, no vacío, compuesto por exactamente 3 caracteres ASCII (`len == 3`), estrictamente alfabéticos (`isalpha()`) y transformados a mayúsculas. *(Nota: En `main.py`, se gestiona una excepción controlada para el nodo `"BR"`, permitiendo registrarlo directamente en el diccionario del grafo)*.
2. **Validación de Aristas y Pesos:**
   * En `aeropuertos.py`:
     * No se permiten lazos hacia el mismo nodo (`origen == destino`).
     * Ambos aeropuertos deben existir previamente en el catálogo de nodos.
     * La distancia debe ser convertible a punto flotante, debe ser finita (`math.isfinite(distancia)`) y **estrictamente mayor que cero** (`distancia > 0`). Se rechazan pesos negativos o nulos.
     * Detección de duplicados: Se rechaza si la arista ya existe en el diccionario de adyacencia.
3. **Validaciones en la Búsqueda de Rutas (`consultar_ruta` en `main.py`):**
   * Comprueba que tanto `origen` como `destino` existan en `RED.grafo`.
   * Comprueba que `origen != destino`.
   * Comprueba que el estado pertenezca a `ESTADOS` y que $1 \le \text{períodos} \le 20$.
   * **Conectividad:** Si Dijkstra no encuentra un camino finito (la distancia al destino permanece como `float("inf")`), se aborta el proceso y se emite un error: `"No existe una ruta de {origen} hacia {destino}."`.
4. **Validación Formal por el Autómata (`validar_ruta` en `automata.py`):**
   * Verifica que la ruta no sea nula.
   * Verifica que cada elemento de la secuencia pertenezca al `ALFABETO` formal y esté presente en el grafo.
   * Verifica que el primer estado sea exactamente el estado de partida (`ruta[0] == origen`).
   * Verifica que el último estado sea el estado final (`ruta[-1] == destino`).
   * Verifica la existencia de cada transición $\delta(q_i, q_{i+1})$; si alguna conexión intermedia no existe en el diccionario, se rechaza la cadena.
5. **Comprobación Cruzada de Pesos:**
   * El sistema calcula de forma independiente el peso de la cadena mediante `calcular_peso_ruta` y lo compara contra la distancia obtenida por Dijkstra (`abs(peso_validado - distancia) > 1e-6`); si difieren, la operación se cancela.

### Salidas
* **Salida de la API Web (JSON):**
  ```json
  {
    "origen": "GUA",
    "destino": "MAD",
    "ruta": ["GUA", "SAL", "MIA", "MAD"],
    "escalas": ["SAL", "MIA"],
    "distancia_total": 8950.0,
    "tramos": [
      {"origen": "GUA", "destino": "SAL", "distancia": 200.0},
      {"origen": "SAL", "destino": "MIA", "distancia": 1650.0},
      {"origen": "MIA", "destino": "MAD", "distancia": 7100.0}
    ],
    "validacion": {
      "valida": true,
      "mensaje": "La ruta es valida."
    },
    "prediccion": {
      "estado_inicial": "A tiempo",
      "periodos": 3,
      "historial": [ ... ],
      "probabilidades_finales": {
        "A tiempo": 0.587,
        "Retrasado": 0.289,
        "Cancelado": 0.124
      },
      "estado_mas_probable": "A tiempo"
    }
  }
  ```
* **Salida Visual en Pantalla (Interfaz Web):**
  * **Tarjetas de Métricas:** Valores actualizados de *Ruta más corta* (ej. `8,950 km`) y *Escalas* (ej. `2`).
  * **Panel Lateral:** Resumen con insignias de nodos (`GUA ➜ SAL ➜ MIA ➜ MAD`), etiqueta de estado `"✓ RUTA VÁLIDA"`, desglose tramo por tramo numerado con kilometraje individual y barras de progreso porcentuales con la distribución de probabilidades de Markov.
  * **Visualizador Geográfico:** Trazo de polilínea continua color turquesa resplandeciente (`#5cf2d4`), activación de la clase visual `.ruta` en los marcadores de los aeropuertos del itinerario, ajuste automático de la vista del mapa (`fitBounds`) y animación vectorial continua de un avión rotando según el ángulo de cada tramo.
* **Salida en Consola (Modo Terminal):**
  Desglose en texto con encabezados formateados, lista separada por flechas (`->`), conteo de escalas, distancia total formateada con separadores de miles y desglose tramo a tramo.

---

## 3. Flujo para Casos de Uso (Basado en la UI/Lógica actual)

### Caso de Uso 1: Definir / Cargar Grafo

Debido a que el grafo es estructuralmente estático en la versión actual, el proceso de "carga" es un flujo automatizado de inicialización del sistema distribuido entre el servidor y el cliente:

1. **Ejecución del Servidor:** El operador arranca el backend con `python main.py`.
2. **Construcción en Memoria:** Se invoca automáticamente la función `construir_red()`, la cual:
   * Instancia un objeto `red = GrafoAeropuertos()`.
   * Itera sobre `GRAFO_PROPUESTA` (importado desde `automata.py`), corrobora que cada nodo cuente con metadatos de latitud/longitud en `AEROPUERTOS` y registra los nodos.
   * Registra las 18 conexiones dirigidas con sus distancias.
   * Asigna la red compilada a la variable global `RED`.
   * Inicia el bucle de escucha HTTP en `127.0.0.1:8000`.
3. **Carga en el Navegador:** El usuario ingresa a `http://127.0.0.1:8000`.
4. **Ciclo de Vida Frontend:**
   * El evento `DOMContentLoaded` ejecuta la función `iniciar()`.
   * Se ejecuta `inicializarMapa()`, montando la capa CartoDB sobre Leaflet (o el Canvas de respaldo).
   * Se dispara la petición asíncrona `await pedirJSON("/api/red")`.
   * El servidor ejecuta `datos_red()` y retorna la lista completa de nodos, aristas y estados.
   * Se ejecuta `llenarSelects()`: puebla las opciones de `<select id="origen">` y `<select id="destino">` y actualiza los indicadores numéricos (10 Aeropuertos, 18 Conexiones).
   * Se ejecuta `pintarRed()`: itera sobre la red y dibuja los pines de los aeropuertos y las líneas tenues punteadas correspondientes a las aristas base.
   * Se dispara la primera consulta por defecto (`GUA` a `MAD`).

### Caso de Uso 2: Calcular Ruta Más Corta

1. **Interacción del Usuario:**
   * En el panel lateral, el usuario despliega el selector **Aeropuerto de salida** (`#origen`) y selecciona el nodo inicial (ej. `"GUA"`).
   * Despliega el selector **Aeropuerto de llegada** (`#destino`) y selecciona el nodo objetivo (ej. `"MAD"`).
   * *(Opcional)* Hace clic en el botón `⇅` (`#intercambiar`) para invertir origen y destino, o modifica el estado inicial y períodos de predicción.
   * Presiona el botón principal **"Buscar mejor ruta ➜"** (`#calcular`).
2. **Disparo y Validaciones en el Cliente:**
   * El evento `submit` del formulario ejecuta `buscarRuta()`.
   * Se deshabilita el botón `#calcular` para evitar peticiones concurrentes y se detiene cualquier animación previa (`detenerAnimacion()`).
   * Se emite una petición asíncrona `fetch` con los parámetros serializados a `/api/ruta`.
3. **Procesamiento en el Servidor (`main.py`):**
   * El método `AeroRouteHandler.do_GET` parsea la URL y transfiere los parámetros a `consultar_ruta()`.
   * Se verifica que los códigos existan en el grafo y que `origen != destino`.
   * Se ejecuta `calcular_dijkstra(RED.grafo, origen, destino)` en `dijkstra.py`. Si no hay conexión alcanzable, retorna `None` y el servidor lanza `ValueError`.
   * Se somete el recorrido a `validar_ruta(recorrido, origen, destino, RED.grafo)` en `automata.py`.
   * Se verifica que la distancia acumulada coincida con `calcular_peso_ruta`.
   * Se simulan las transiciones estocásticas en `markov.py`.
   * Se serializa la respuesta JSON con código de estado HTTP 200.
4. **Renderizado del Resultado en Pantalla:**
   * Se ejecuta `presentarResultados(resultado)`:
     * Muestra la distancia kilométrica en `#distancia-principal` y el número de escalas en `#cantidad-escalas`.
     * Aplica la clase CSS `.sello.verde` al elemento `#sello-validacion` mostrando el texto `"✓ RUTA VÁLIDA"`.
     * Renderiza la cadena de nodos y la lista desglosada tramo a tramo en `#tramos`.
     * Genera dinámicamente las barras de probabilidad de Markov.
   * Se ejecuta `actualizarMapaRuta(resultado)`:
     * Limpia la capa gráfica anterior (`capaRuta.clearLayers()`).
     * Traza la polilínea turquesa brillante sobre los puntos coordenados de la ruta óptima.
     * Alterna la clase CSS `.ruta` en los pines de los aeropuertos involucrados para encender su resplandor.
     * Ajusta el visor geográfico con `mapa.fitBounds(puntos)`.
     * Instancia el marcador del avión en el primer nodo.
   * Se ejecuta `iniciarVuelo()`:
     * Habilita los controles de reproducción (`#pausa` y `#reiniciar`).
     * Inicia el bucle de animación con `requestAnimationFrame(animar)`, desplazando el avión tramo a tramo con interpolación lineal y rotación angular.
   * *Manejo de Errores:* Si no existe conexión (ej. `MAD` hacia `GUA`), el backend retorna HTTP 400 con un mensaje descriptivo; el frontend lo captura en el bloque `catch`, actualiza el mensaje de error en rojo, limpia las líneas del mapa y coloca el sello en `"Sin ruta"`.

---

## 4. Mapeo del Modelo Formal (Autómatas y Lenguajes Formales)

El sistema modela la red de transporte aéreo formalmente como un **Autómata Finito Determinista Ponderado (WFA - *Weighted Finite Automaton*)** definido por la séxtupla:
$$A = (Q, \Sigma, \delta, q_0, F, w)$$

| Componente Formal | Definición Matemática en el Proyecto | Implementación Exacta en el Código |
| :--- | :--- | :--- |
| **Estados ($Q$)** | Conjunto finito de vértices que representan los aeropuertos de la red: <br>$Q = \{\text{GUA}, \text{SAL}, \text{MEX}, \text{MIA}, \text{JFK}, \text{LAX}, \text{MAD}, \text{PTY}, \text{CHI}, \text{BR}\}$ | Claves del diccionario `grafo` en `automata.py`, `self.grafo` en `aeropuertos.py` y catálogo `AEROPUERTOS` en `main.py`. Cada estado posee atributos asociados como nombre, latitud y longitud. |
| **Alfabeto ($\Sigma$)** | Conjunto finito de símbolos de entrada que representan los identificadores de destino permitidos en las transiciones. | Lista explícita `ALFABETO` en `automata.py`: <br>`ALFABETO = ["GUA", "SAL", "MEX", "MIA", "JFK", "LAX", "MAD", "PTY", "CHI", "BR"]`. |
| **Transiciones ($\delta$)** | Función de transición parcial $\delta: Q \times \Sigma \to Q$, donde $\delta(u, v) = v \iff$ existe un vuelo directo desde el aeropuerto $u$ hasta el aeropuerto $v$. | Diccionario anidado `grafo[actual]`. En la función `validar_ruta`, se evalúa explícitamente: <br>`if siguiente not in grafo[actual]: return False, ...`. Si no existe la clave, la transición es indefinida y la máquina rechaza la cadena. |
| **Estado Inicial ($q_0$)** | Nodo de partida del itinerario de vuelo ($q_0 \in Q$). | Parámetro `origen` seleccionado dinámicamente por el usuario. Validado en `validar_ruta`: <br>`if ruta[0] != origen: return False, ...`. |
| **Estados de Aceptación ($F$)** | Conjunto unitario que define el destino deseado ($F = \{ \text{destino} \} \subseteq Q$). | Parámetro `destino` provisto en la consulta. Validado en `validar_ruta`: <br>`if ruta[-1] != destino: return False, ...`. |
| **Función de Peso ($w$)** | Función de valoración sobre las transiciones $w: Q \times \Sigma \to \mathbb{R}^+$. Opera sobre el semianillo tropical $(\mathbb{R}^+ \cup \{\infty\}, \min, +)$. | Valor flotante almacenado en `grafo[actual][siguiente]` (distancia en km). Es un **peso simple escalar** (distancia euclidiana/geográfica positiva), no multicriterio. |

### Aceptación de Cadenas ($L(A)$) y Evaluación de Caminos
* **Definición del Lenguaje:** Una cadena $w_r = q_0 q_1 q_2 \dots q_k \in \Sigma^+$ es aceptada por el autómata ($w_r \in L(A)$) si y sólo si modela un camino continuo, conexo y válido en el dígrafo desde el origen hasta el destino:
  1. $q_0 = \text{origen}$.
  2. $q_k = \text{destino} \in F$.
  3. Para todo $i \in \{0, 1, \dots, k-1\}$, se cumple que $\delta(q_i, q_{i+1})$ está definida en el grafo ($q_{i+1} \in \text{grafo}[q_i]$).
* **Verificación Computacional:** La función `validar_ruta` procesa la cadena como un reconocedor formal de estados. Si la cadena es aceptada, `calcular_peso_ruta` computa la suma ponderada de la cadena:
  $$W(w_r) = \sum_{i=0}^{k-1} w(q_i, q_{i+1})$$
  En `main.py`, se asegura la consistencia teórica garantizando que $W(w_r)$ sea exactamente igual al costo mínimo computado por el algoritmo de Dijkstra.

---

## 5. Algoritmo de Ruta Óptima y Estructuras de Datos

### Nombre del Algoritmo y Ubicación
* **Algoritmo:** **Algoritmo de Dijkstra** (para caminos mínimos en grafos dirigidos con aristas de costo no negativo).
* **Archivo:** `dijkstra.py`.
* **Función:** `calcular_dijkstra(grafo, origen, destino)`.

### Explicación Paso a Paso de la Implementación
1. **Normalización e Inicialización:**
   * Normaliza los códigos de origen y destino con `.strip().upper()`.
   * Verifica existencia en el grafo; si el origen o destino no existen, retorna `(None, [], [])`. Si `origen == destino`, retorna `(0.0, [origen], [])`.
   * Inicializa la tabla de distancias mínimas como un diccionario `distancias: Dict[str, float]` asignando `float("inf")` a todos los nodos y `distancias[origen] = 0.0`.
   * Inicializa la tabla de rutas como un diccionario de punteros hacia atrás `predecesores: Dict[str, Optional[str]]` asignando `None` a todos los nodos.
2. **Cola de Prioridad (Montículo Binario):**
   * Emplea el módulo estándar **`heapq`** de Python, operando sobre una lista de tuplas `(distancia_acumulada, aeropuerto_actual)`. Se inicializa con `cola_prioridad = [(0.0, origen)]`.
   * Mantiene un conjunto de nodos evaluados `visitados = set()`.
3. **Exploración y Relajación de Aristas:**
   * Extrae repetidamente el nodo no visitado con menor distancia acumulada mediante `heapq.heappop(cola_prioridad)`.
   * Aplica eliminación perezosa (*lazy deletion*): si el nodo extraído ya se encuentra en `visitados`, se ignora (`continue`).
   * **Optimización de Parada Temprana (*Early Termination*):** Si `actual == destino`, se interrumpe la búsqueda inmediatamente con `break`, evitando procesar el resto del grafo.
   * Itera sobre los adyacentes obtenidos por `_obtener_vecinos(grafo, actual)`. Si `nueva_distancia < distancias.get(vecino, float("inf"))`, se actualiza la distancia en el diccionario, se registra el predecesor (`predecesores[vecino] = actual`) y se inserta la nueva tupla en el montículo mediante `heapq.heappush`.
4. **Reconstrucción del Camino Óptimo:**
   * Comprueba si el destino fue alcanzado (`distancias[destino] != float("inf")`).
   * Reconstruye el itinerario retrocediendo desde el destino hacia el origen a través de la cadena de `predecesores` en un bucle `while nodo_actual is not None:`.
   * Invierte la lista con `recorrido.reverse()` para obtener el orden cronológico.
   * Extrae las escalas intermedias mediante la operación de particionado (*slicing*): `escalas = recorrido[1:-1]`.

### Fragmento de Código Exacto de la Función Principal

```python
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
```

### Visualización y Resaltado de la Ruta
* **Renderizado de la Red Base:**
  * En Leaflet, se agregan marcadores `L.marker` con iconos HTML (`L.divIcon`) en las coordenadas geográficas de cada nodo.
  * Todas las aristas de la red se dibujan en una capa independiente (`sistema.capaConexiones`) mediante `L.polyline` con estilo discreto: color `#376b84`, grosor de 1.2px, opacidad baja de 0.53 y patrón de puntos discontinuos `dashArray: "3 6"`.
* **Técnica de Resaltado Visual de la Ruta Óptima (`actualizarMapaRuta`):**
  1. **Efecto Resplandor (*Glow*):** Dibuja una primera polilínea ancha en color cian translúcido (`color: "#29d4f8"`, `weight: 9`, `opacity: 0.15`).
  2. **Línea Principal Sólida:** Superpone una segunda polilínea nítida color turquesa fluorescente (`color: "#5cf2d4"`, `weight: 3.6`, `opacity: 0.95`).
  3. **Activación de Nodos en Ruta:** Recorre el mapa de marcadores (`sistema.pines`) y conmuta la clase CSS:
     ```javascript
     nodo.classList.toggle("ruta", resultado.ruta.includes(codigo));
     ```
     En `estilos.css`, los elementos `.pin-punto.ruta` cambian su fondo a `#54eccb` y proyectan una doble sombra incandescente (`box-shadow: 0 0 14px #54eccb, 0 0 28px #54eccb88`).
  4. **Enfoque de Cámara:** Ejecuta `sistema.mapa.fitBounds(puntos, { ... })` para encuadrar automáticamente el recorrido calculado.
  5. **Animación Dinámica:** Agrega un elemento SVG de aeronave en `sistema.capaRuta`, animado a lo largo de las coordenadas mediante cálculo trigonométrico del rumbo (`Math.atan2(dx, -dy) * 180 / Math.PI`) e interpolación continua.

---

## 6. Casos de Prueba y Ejemplos de Ejecución Reales

A continuación se presentan casos de prueba reales extraídos directamente de los datasets y bloques de prueba programados en el repositorio:

### Topología de la Red Principal (`automata.py` y `main.py`)
* **Nodos (10):** `GUA`, `SAL`, `MEX`, `MIA`, `JFK`, `LAX`, `MAD`, `PTY`, `CHI`, `BR`.
* **Aristas Dirigidas y Pesos (18):**
  * `GUA` $\to$ `SAL` (200 km), `MEX` (1060 km), `PTY` (1350 km)
  * `SAL` $\to$ `MEX` (1250 km), `MIA` (1650 km)
  * `MEX` $\to$ `MIA` (2060 km), `LAX` (2500 km)
  * `MIA` $\to$ `JFK` (1760 km), `MAD` (7100 km)
  * `JFK` $\to$ `MAD` (5760 km)
  * `LAX` $\to$ `JFK` (3980 km)
  * `PTY` $\to$ `MIA` (1860 km), `MAD` (8200 km), `CHI` (10300 km)
  * `CHI` $\to$ `GUA` (9750 km), `BR` (11810 km)
  * `BR` $\to$ `MIA` (9500 km), `MEX` (15802 km)
  * `MAD` $\to$ $\emptyset$ (nodo pozo, 0 salidas)

---

### Caso de Prueba Real 1: Ruta Transatlántica Multiescala (Predeterminada del Sistema)
* **Datos de Entrada:**
  * Nodo Origen ($q_0$): `"GUA"` (Ciudad de Guatemala)
  * Nodo Destino ($F$): `"MAD"` (Madrid, España)
  * Estado Inicial de Markov: `"A tiempo"`, Períodos: `3`
* **Cálculo de la Ruta Óptima:**
  * Rutas dirigidas posibles evaluadas por el algoritmo:
    1. $\text{GUA} \to \text{SAL} \to \text{MIA} \to \text{MAD} = 200 + 1650 + 7100 = \mathbf{8950\text{ km}}$ *(Óptima)*
    2. $\text{GUA} \to \text{SAL} \to \text{MIA} \to \text{JFK} \to \text{MAD} = 200 + 1650 + 1760 + 5760 = 9370\text{ km}$
    3. $\text{GUA} \to \text{MEX} \to \text{MIA} \to \text{MAD} = 1060 + 2060 + 7100 = 10220\text{ km}$
    4. $\text{GUA} \to \text{PTY} \to \text{MAD} = 1350 + 8200 = 9550\text{ km}$
    5. $\text{GUA} \to \text{PTY} \to \text{MIA} \to \text{MAD} = 1350 + 1860 + 7100 = 10310\text{ km}$
* **Resultado Obtenido:**
  * **Ruta Óptima:** `["GUA", "SAL", "MIA", "MAD"]`
  * **Escalas:** `["SAL", "MIA"]` (2 escalas)
  * **Costo Total (Distancia):** `8,950.00 km`
  * **Detalle de Tramos:**
    1. `GUA` $\to$ `SAL`: 200.00 km
    2. `SAL` $\to$ `MIA`: 1,650.00 km
    3. `MIA` $\to$ `MAD`: 7,100.00 km
  * **Validación Formal del Autómata:** Cadena aceptada (`True`, `"La ruta es valida."`).
  * **Consistencia de Peso:** Coincidencia exacta ($8950.00 - 8950.00 = 0.0$).
  * **Predicción Estocástica (Markov):**
    * Período 1: A tiempo: 75.00%, Retrasado: 20.00%, Cancelado: 5.00%
    * Período 2: A tiempo: 64.00%, Retrasado: 26.50%, Cancelado: 9.50%
    * Período 3: A tiempo: 58.70%, Retrasado: 28.90%, Cancelado: 12.40%
    * Predicción final: **"A tiempo"** (58.70% de probabilidad).

---

### Caso de Prueba Real 2: Ruta Norteamérica Este (Conexión Continental)
* **Datos de Entrada:**
  * Nodo Origen ($q_0$): `"GUA"` (Ciudad de Guatemala)
  * Nodo Destino ($F$): `"JFK"` (Nueva York, EE. UU.)
* **Cálculo de la Ruta Óptima:**
  * Alternativa vía SAL/MIA: $\text{GUA} \to \text{SAL} \to \text{MIA} \to \text{JFK} = 200 + 1650 + 1760 = \mathbf{3610\text{ km}}$ *(Óptima)*
  * Alternativa vía MEX/LAX: $\text{GUA} \to \text{MEX} \to \text{LAX} \to \text{JFK} = 1060 + 2500 + 3980 = 7540\text{ km}$
  * Alternativa vía PTY: $\text{GUA} \to \text{PTY} \to \text{MIA} \to \text{JFK} = 1350 + 1860 + 1760 = 4970\text{ km}$
* **Resultado Obtenido:**
  * **Ruta Óptima:** `["GUA", "SAL", "MIA", "JFK"]`
  * **Escalas:** `["SAL", "MIA"]` (2 escalas)
  * **Costo Total (Distancia):** `3,610.00 km`
  * **Detalle de Tramos:**
    1. `GUA` $\to$ `SAL`: 200.00 km
    2. `SAL` $\to$ `MIA`: 1,650.00 km
    3. `MIA` $\to$ `JFK`: 1,760.00 km
  * **Validación Formal del Autómata:** Cadena aceptada (`True`, `"La ruta es valida."`).

---

### Caso de Prueba Adicional 3: Conexión Directa vs. Escala
* **Datos de Entrada:**
  * Nodo Origen ($q_0$): `"PTY"` (Panamá)
  * Nodo Destino ($F$): `"MAD"` (Madrid, España)
* **Cálculo y Comparación:**
  * Alternativa directa: $\text{PTY} \to \text{MAD} = \mathbf{8200\text{ km}}$ *(Óptima)*
  * Alternativa con escala: $\text{PTY} \to \text{MIA} \to \text{MAD} = 1860 + 7100 = 8960\text{ km}$
* **Resultado Obtenido:**
  * **Ruta Óptima:** `["PTY", "MAD"]`
  * **Escalas:** `[]` (Vuelo directo, 0 escalas)
  * **Costo Total:** `8,200.00 km`
  * **Validación Formal:** Cadena aceptada (`True`).

---

### Caso de Prueba 4: Inalcanzabilidad por Dirección de Aristas (Prueba Negativa)
* **Datos de Entrada:**
  * Nodo Origen ($q_0$): `"MAD"`
  * Nodo Destino ($F$): `"GUA"`
* **Traza de Ejecución y Manejo de Excepciones:**
  * `MAD` posee un diccionario de adyacencia vacío (`"MAD": {}`), por lo que no existen transiciones de salida definidas.
  * La cola de prioridad se vacía sin alcanzar el destino; `distancias["GUA"]` permanece como `float("inf")`.
  * La función `calcular_dijkstra` retorna `(None, [], [])`.
  * La función `consultar_ruta` en `main.py` captura el retorno y lanza:
    ```text
    ValueError: No existe una ruta de MAD hacia GUA.
    ```
  * El servidor HTTP retorna un código de estado `400 Bad Request` con el mensaje JSON `{"error": "No existe una ruta de MAD hacia GUA."}`.
  * La interfaz gráfica muestra el sello de validación en gris (`"Sin ruta"`), deshabilita los controles de animación y notifica el error en la barra de mensajes.
