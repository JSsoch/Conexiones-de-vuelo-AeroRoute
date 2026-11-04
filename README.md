# ✈️ AeroRoute | Sistema Inteligente de Rutas Aéreas & Modelado Formal

<div align="center">

[![Python](https://img.shields.io/badge/Python-3.10%2B-blue?logo=python&logoColor=white)](https://www.python.org/)
[![JavaScript](https://img.shields.io/badge/JavaScript-ES6%2B-yellow?logo=javascript&logoColor=black)](https://developer.mozilla.org/es/docs/Web/JavaScript)
[![Leaflet](https://img.shields.io/badge/Cartography-Leaflet_SIG-199900?logo=leaflet&logoColor=white)](https://leafletjs.com/)
[![License](https://img.shields.io/badge/Academic-Proyecto_Final-orange)](#)
[![Design](https://img.shields.io/badge/UI_Design-Stitch_Voyage_Atelier-0d5869)](#)

**Plataforma de despacho de vuelos e ingeniería de itinerarios que integra Teoría de Autómatas Finitos Deterministas, Algoritmos de Caminos Mínimos (Dijkstra) y Procesos Estocásticos (Cadenas de Markov Discretas) con un visor cartográfico SIG interactivo.**

[Ver Características](#-características-principales) • [Fundamento Teórico](#-fundamentos-teóricos-y-modelado-formal) • [Arquitectura](#-arquitectura-del-sistema) • [Instalación](#-instalación-y-ejecución) • [API REST](#-especificación-de-la-api-rest)

</div>

---

## 📌 Descripción del Proyecto

**AeroRoute** es un proyecto académico de la asignatura **Lenguajes Formales y Autómatas** (Cuarto Semestre). Resuelve el problema integral de planificación y monitoreo de rutas aéreas internacionales mediante tres pilares teóricos fundamentales:

1. **Validación Formal de Cadenas mediante Autómatas Finitos Deterministas (AFD):** Asegura que cualquier itinerario seleccionado represente una cadena válida aceptada $w \in L(M)$ bajo una gramática regular de transiciones factibles.
2. **Optimización de Rutas con Dijkstra:** Calcula el itinerario de costo mínimo en un grafo dirigido ponderado $G = (V, E)$, minimizando la distancia ortodrómica real acumulada en kilómetros.
3. **Predicción Estocástica con Cadenas de Markov:** Modela la dinámica probabilística del estado operacional de un vuelo (A tiempo, Retrasado, Cancelado) a través de $k$ horizontes temporales mediante matrices de transición de Markov.

La plataforma cuenta con una interfaz web moderna diseñada bajo la estética **Voyage Atelier** (inspirada en Google Stitch y portales de vanguardia como Kayak/Booking), dotada de un visor geográfico SIG interactivo con animación cinemática y un **menú lateral desplegable (drawer)** para la gestión y mutación del grafo en memoria viva.

---

## 🚀 Características Principales

* **🗺️ Visor Cartográfico SIG a Ancho Completo:** Renderizado interactivo con Leaflet.js sobre proyección EPSG:3857/4326 con aerovías, nodos aeroportuarios, leyendas visuales y geodésicas ortodrómicas.
* **✈️ Animación Cinemática de Vuelos:** Simulación de trayectorias aéreas en tiempo real con rotación angular automática de la aeronave, selector de velocidad ($1\times, 2\times, 3\times$), botón de pausa/reanudación y telemetría en vivo (GS, FL, ETE).
* **📋 Menú Lateral Desplegable (Slide-Out Drawer):** Gestor flotante del grafo $G = (V, E)$ para registrar nuevos aeropuertos (vértices $v \in V$) y conexiones de vuelo (aristas $e \in E$) en memoria viva, con autocompletado de coordenadas por clic en el mapa.
* **🔍 Diagnóstico Inteligente de Rutas Inconexas:** Retroalimentación inmediata y badges de advertencia cuando no existe una trayectoria dirigida ($d = \infty$), sugiriendo conexiones alternativas.
* **⚡ Cero Dependencias Pesadas:** Motor backend desarrollado en **Python puro estándar** (`http.server`, `urllib`, `heapq`), sin necesidad de frameworks externos como Flask o FastAPI.
* **🎨 Interfaz Responsive y Accesible:** Diseño responsivo con paleta cromática cálida editorial (*Deep Ocean Teal*, *Warm Ochre Sun*, *Canvas Linen*), tipografías *Noto Serif* y *Plus Jakarta Sans*, y soporte nativo para atajos de teclado (<kbd>Esc</kbd> para cerrar drawer).

---

## 🧠 Fundamentos Teóricos y Modelado Formal

### 1. Autómata Finito Determinista (AFD)

El sistema formaliza la red de rutas aéreas como un autómata finito determinista $M$:

$$M = (Q, \Sigma, \delta, q_0, F)$$

* **Estados ($Q$):** Conjunto finito de aeropuertos registrados en el grafo activo:
  $$Q = \{ \text{GUA}, \text{SAL}, \text{MEX}, \text{MIA}, \text{JFK}, \text{LAX}, \text{MAD}, \text{PTY}, \text{CHI}, \text{BR}, \dots \}$$
* **Alfabeto ($\Sigma$):** Conjunto de códigos IATA normalizados correspondientes a las terminales disponibles.
* **Función de Transición ($\delta$):**
  $$\delta: Q \times \Sigma \to Q$$
  Donde $\delta(q_i, \sigma) = q_j$ está definida si y solo si existe una conexión de vuelo dirigida activa desde el aeropuerto $q_i$ hacia $q_j$ con código $\sigma = q_j$.
* **Estado Inicial ($q_0$):** Aeropuerto de origen seleccionado por el usuario.
* **Estados de Aceptación ($F$):** Conjunto unitario que contiene únicamente el aeropuerto de destino final:
  $$F = \{ q_{\text{destino}} \}$$
* **Lenguaje Aceptado ($L(M)$):** Un itinerario $w = a_1 a_2 \dots a_n$ es aceptado formalmente ($w \in L(M)$) si existe una secuencia continua de transiciones válidas desde $q_0$ hasta $q_{\text{destino}}$.

#### Gramática Regular Equivalente (Tipo 3 de Chomsky):
Para una ruta aceptada como $\text{GUA} \to \text{SAL} \to \text{MIA} \to \text{MAD}$, las reglas de producción regulares generadoras son:

$$S \to \text{SAL} \cdot A$$
$$A \to \text{MIA} \cdot B$$
$$B \to \text{MAD}$$

---

### 2. Algoritmo de Dijkstra sobre Grafos Ponderados

Dada la red modelada como un grafo dirigido ponderado $G = (V, E, w)$, donde los pesos representan distancias reales calculadas según la fórmula del **Haversine**:

$$w(u, v) = 2R \arcsin \left( \sqrt{\sin^2\left(\frac{\Delta \phi}{2}\right) + \cos(\phi_1)\cos(\phi_2)\sin^2\left(\frac{\Delta \lambda}{2}\right)} \right)$$

El algoritmo de Dijkstra determina la ruta que minimiza la suma acumulada de distancias:

$$\min \sum_{(u, v) \in \text{Ruta}} w(u, v)$$

* **Implementación:** Cola de prioridad basada en montículo binario (`heapq`).
* **Complejidad Temporal:** $\mathcal{O}(|E| + |V| \log |V|)$, garantizando tiempos de respuesta reactivos inferiores a 2 ms.
* **Detección de Inconexitud:** Si el destino no es alcanzable en el grafo dirigido, el algoritmo reporta distancia infinita ($d = \infty$), activando diagnósticos contextuales en la interfaz.

---

### 3. Cadenas de Markov de Tiempo Discreto

La puntualidad de la operación aérea se modela mediante un proceso estocástico con la propiedad markoviana sin memoria:

$$P(X_{n+1} = j \mid X_n = i, X_{n-1} = i_{n-1}, \dots, X_0 = i_0) = P(X_{n+1} = j \mid X_n = i)$$

* **Espacio de Estados:**
  $$S = \{ S_0: \text{A tiempo}, S_1: \text{Retrasado}, S_2: \text{Cancelado} \}$$

* **Matriz de Transición Estocástica ($P$):**
  Cada fila $i$ representa una distribución de probabilidad válida donde $\sum_{j} P_{ij} = 1.0$:

  $$P = \begin{pmatrix}
  0.75 & 0.20 & 0.05 \\
  0.35 & 0.50 & 0.15 \\
  0.15 & 0.30 & 0.55
  \end{pmatrix}$$

* **Predicción en $k$ Horizontes:**
  Dado un vector de estado inicial $\pi(0)$ (ej. vuelo puntual $\pi(0) = [1.0, 0.0, 0.0]$), el vector de probabilidades tras $k$ etapas se obtiene mediante multiplicación matricial:

  $$\pi(k) = \pi(0) \cdot P^k$$

---

## 🏛️ Arquitectura del Sistema

```
Proyecto Final/
├── aeropuertos.py       # Grafo conexo de aeropuertos, catálogo y validación IATA
├── automata.py          # Autómata Finito Determinista (AFD) y gramáticas regulares
├── dijkstra.py          # Algoritmo de Dijkstra con min-heap y extracción de escalas
├── markov.py            # Cadenas de Markov, potencias matriciales y convergencia
├── main.py              # Servidor HTTP multihilo nativo y API REST JSON
├── web/                 # Aplicación Web Frontend (SPA)
│   ├── index.html       # Estructura semántica, visor SIG y panel desplegable
│   ├── estilos.css      # Sistema de diseño Atelier v2.4 (Google Stitch FIDELITY)
│   └── app.js           # Orquestador del cliente: Leaflet, WebSocket/Fetch, animación
├── Diagramas y Documentos/
│   ├── Informe Final - Proyecto AeroRoute (Lenguajes Formales y Autómatas).docx
│   └── Informe Final - Proyecto AeroRoute (Lenguajes Formales y Autómatas).pdf
└── README.md            # Documentación técnica integral
```

---

## 💻 Instalación y Ejecución

### Prerrequisitos
* **Python 3.10** o superior instalado en el sistema.
* Un navegador web moderno (Google Chrome, Mozilla Firefox, Edge o Safari).
* *(Opcional)* Conexión a internet para cargar los mapas base de OpenStreetMap / CartoDB y fuentes de Google Fonts (la aplicación incluye modo de contingencia local si se trabaja offline).

### Pasos para Ejecutar

1. **Clonar el repositorio o descargar el proyecto:**
   ```bash
   git clone https://github.com/LuM-343/Conexiones-de-vuelo-AeroRoute.git
   cd Conexiones-de-vuelo-AeroRoute
   ```

2. **Iniciar el servidor local:**
   ```bash
   python main.py
   ```

3. **Abrir la plataforma en el navegador:**
   Ingresa a:
   ```text
   http://localhost:8000
   ```

4. **Para detener el servidor:**
   Presiona <kbd>Ctrl</kbd> + <kbd>C</kbd> en la terminal.

---

## 📡 Especificación de la API REST

El servidor `main.py` expone los siguientes endpoints JSON para integración:

| Método | Endpoint | Descripción | Parámetros / Cuerpo |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/red` | Retorna los aeropuertos, conexiones activas, métricas y estados de Markov. | Ninguno |
| `GET` | `/api/ruta` | Calcula el itinerario Dijkstra, valida por AFD y predice Markov. | `origen`, `destino`, `estado`, `periodos` |
| `POST` | `/api/aeropuerto` | Registra dinámicamente un nuevo vértice $v \in V$ en el grafo en memoria. | `{"codigo": "CUN", "nombre": "Cancún Intl", "lat": 21.03, "lon": -86.87}` |
| `POST` | `/api/vuelo` | Inserta una arista dirigida $e \in E$ ponderada entre dos aeropuertos. | `{"origen": "GUA", "destino": "CUN", "distancia": 820, "bidireccional": true}` |

---

## 📊 Red Aeroportuaria Base

El catálogo inicial cuenta con conexiones estratégicas intercontinentales:

| Código IATA | Aeropuerto / Terminal | Ubicación Geográfica |
| :---: | :--- | :--- |
| **GUA** | Aeropuerto Internacional La Aurora | Ciudad de Guatemala, Guatemala |
| **SAL** | Aeropuerto Internacional San Óscar Arnulfo Romero | San Salvador, El Salvador |
| **MEX** | Aeropuerto Internacional Benito Juárez | Ciudad de México, México |
| **MIA** | Miami International Airport | Miami, Estados Unidos |
| **JFK** | John F. Kennedy International Airport | Nueva York, Estados Unidos |
| **LAX** | Los Angeles International Airport | Los Ángeles, Estados Unidos |
| **MAD** | Aeropuerto Adolfo Suárez Madrid-Barajas | Madrid, España |
| **PTY** | Aeropuerto Internacional de Tocumen | Ciudad de Panamá, Panamá |
| **CHI** | Aeropuerto Internacional Arturo Merino Benítez | Santiago de Chile, Chile |
| **BR** | Aeropuerto Internacional de Galeão | Río de Janeiro, Brasil |

---

## 👨‍💻 Autores y Créditos

* **Asignatura:** Lenguajes Formales y Autómatas
* **Semestre:** Cuarto Semestre de Ingeniería de Sistemas
* **Diseño UI & Prototipado:** Google Stitch (*Atelier Voyage Theme*)

---

<div align="center">
<sub>Proyecto Final de Semestre • Facultad de Ingeniería de Sistemas • Lenguajes Formales y Autómatas</sub>
</div>
