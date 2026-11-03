"use strict";
// AEROROUTE - MAPA OPENSTREETMAP

const $ = (id) => document.getElementById(id);

const formatoNumero = (n) =>
    Number(n).toLocaleString("es-GT", {
        maximumFractionDigits: 0
    });

const COLORES = {
    "A tiempo": "prob-a-tiempo",
    "Retrasado": "prob-retrasado",
    "Cancelado": "prob-cancelado"
};


// VARIABLES DEL SISTEMA

const estado = {
    red: null,
    mapa: null,
    pines: new Map(),

    capaConexiones: null,
    capaRuta: null,

    avion: null,
    ruta: null,

    segmento: 0,
    progreso: 0,

    activo: false,
    completado: false,

    tiempoAnterior: null,
    frame: null,
    solicitud: 0
};

// COMUNICACIÓN CON PYTHON

async function pedirJSON(url) {

    const respuesta = await fetch(url);
    const datos = await respuesta.json();

    if (!respuesta.ok) {
        throw new Error(
            datos.error || "Error del servidor."
        );
    }

    return datos;
}


function mensaje(texto, tipo = "") {

    $("mensaje").textContent = texto;
    $("mensaje").className = "mensaje " + tipo;
}

// MAPA REAL CON OPENSTREETMAP

function inicializarMapa() {

    if (typeof L === "undefined") {
        throw new Error(
            "No cargó Leaflet. Comprueba tu conexión a Internet."
        );
    }

    estado.mapa = L.map("mapa", {

        zoomControl: false,

        minZoom: 2,
        maxZoom: 19,

        worldCopyJump: true,
        preferCanvas: true
    });

    L.control.zoom({
        position: "bottomright"
    }).addTo(estado.mapa);

    // CAPA DE OPENSTREETMAP
    // NO NECESITA API KEY

    const mapaBase = L.tileLayer(

        "https://tile.openstreetmap.org/{z}/{x}/{y}.png",

        {
            minZoom: 2,
            maxZoom: 19,

            attribution:
                '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }
    );


    // Detectar errores de carga del mapa.

    mapaBase.on("tileerror", () => {

        $("mapa-estado").textContent =
            "No se cargó una imagen del mapa. " +
            "Revisa la conexión a Internet.";
    });

    mapaBase.addTo(estado.mapa);


    // Capas de conexiones y ruta óptima.

    estado.capaConexiones = L.layerGroup()
        .addTo(estado.mapa);

    estado.capaRuta = L.layerGroup()
        .addTo(estado.mapa);


    // Vista inicial.

    estado.mapa.setView([14, -67], 3);
}

// INFORMACIÓN DE AEROPUERTOS

function aeropuerto(codigo) {

    const a = estado.red.aeropuertos.find(
        (x) => x.codigo === codigo
    );

    if (!a) {
        throw new Error(
            `No existe el aeropuerto ${codigo}.`
        );
    }

    return a;
}


function coordenada(codigo) {

    const a = aeropuerto(codigo);

    return [a.lat, a.lng];
}

// MOSTRAR AEROPUERTOS

function mostrarRed() {

    const limites = [];

    for (const a of estado.red.aeropuertos) {

        const punto = [a.lat, a.lng];

        limites.push(punto);

        const icono = L.divIcon({

            className: "aeropuerto-punto",

            iconSize: [27, 40],
            iconAnchor: [13, 13],

            html: `
                <div class="pin-punto"></div>
                <span class="pin-codigo">
                    ${a.codigo}
                </span>
            `
        });


        // Crear marcador.

        const pin = L.marker(
            punto,
            { icon: icono }
        ).addTo(estado.mapa);


        // Información emergente del aeropuerto.

        const nombre = document.createElement("div");

        nombre.textContent = a.nombre;

        const titulo = document.createElement("strong");

        titulo.textContent = a.codigo;

        const popup = document.createElement("div");

        popup.append(
            titulo,
            document.createElement("br"),
            nombre
        );

        pin.bindPopup(popup);

        estado.pines.set(a.codigo, pin);
    }

    // DIBUJAR CONEXIONES

    for (const vuelo of estado.red.conexiones) {

        L.polyline(
            [
                coordenada(vuelo.origen),
                coordenada(vuelo.destino)
            ],

            {
                color: "#376b84",

                weight: 1.4,
                opacity: 0.65,

                dashArray: "3 6",

                interactive: false
            }

        ).addTo(estado.capaConexiones);
    }


    // Mostrar todos los aeropuertos.

    estado.mapa.fitBounds(
        limites,
        { padding: [35, 35] }
    );
}

// LLENAR SELECTORES

function llenarSelectores() {

    for (const id of ["origen", "destino"]) {

        const selector = $(id);

        selector.replaceChildren();

        for (const a of estado.red.aeropuertos) {

            const opcion =
                document.createElement("option");

            opcion.value = a.codigo;

            opcion.textContent =
                `${a.codigo} · ${a.nombre}`;

            selector.appendChild(opcion);
        }
    }


    // Valores iniciales.

    $("origen").value = "GUA";
    $("destino").value = "MAD";

    $("estado").replaceChildren();


    // Estados de Markov.

    for (const nombre of estado.red.estados) {

        const opcion =
            document.createElement("option");

        opcion.value = nombre;
        opcion.textContent = nombre;

        $("estado").appendChild(opcion);
    }


    $("cantidad-aeropuertos").textContent =
        estado.red.total_aeropuertos;

    $("cantidad-conexiones").textContent =
        estado.red.total_conexiones;
}

// MOSTRAR RUTA ÓPTIMA EN EL MAPA

function mostrarRutaEnMapa(resultado) {

    estado.capaRuta.clearLayers();

    const puntos = resultado.ruta.map(coordenada);


    // Brillo de la ruta.

    L.polyline(puntos, {

        color: "#29d4f8",

        weight: 9,
        opacity: 0.17,

        interactive: false

    }).addTo(estado.capaRuta);


    // Línea de la ruta.

    L.polyline(puntos, {

        color: "#5cf2d4",

        weight: 3.6,
        opacity: 0.95,

        interactive: false

    }).addTo(estado.capaRuta);


    // Resaltar aeropuertos del recorrido.

    for (const [codigo, pin] of estado.pines) {

        const circulo = pin.getElement()
            ?.querySelector(".pin-punto");

        if (circulo) {

            circulo.classList.toggle(
                "ruta",
                resultado.ruta.includes(codigo)
            );
        }
    }


    // Centrar el mapa en la ruta.

    estado.mapa.fitBounds(puntos, {

        paddingTopLeft: [90, 90],

        paddingBottomRight: [70, 55],

        maxZoom: 5
    });

    // ICONO DEL AVIÓN

    const iconoAvion = L.divIcon({

        className: "avion-marcador",

        iconSize: [38, 38],
        iconAnchor: [19, 19],

        html: `
            <span class="avion-svg">

                <svg viewBox="0 0 40 40"
                     aria-hidden="true">

                    <circle
                        class="halo"
                        cx="20"
                        cy="20"
                        r="17"
                    />

                    <path d="
                        M20 2
                        c-1.6 0-2.7 2.3-2.7 4.5
                        v11.3
                        L5.5 25
                        v4
                        l11.8-3.5
                        v7.1
                        L13 35
                        v2.5
                        l7-1.8
                        7 1.8
                        V35
                        l-4.3-2.4
                        v-7.1
                        L34.5 29
                        v-4
                        l-11.8-7.2
                        V6.5
                        C22.7 4.3 21.6 2 20 2
                        Z
                    "/>

                </svg>

            </span>
        `
    });


    estado.avion = L.marker(

        puntos[0],

        {
            icon: iconoAvion,

            zIndexOffset: 1000,

            interactive: false
        }

    ).addTo(estado.capaRuta);
}

// RESULTADOS DE DIJKSTRA Y MARKOV

function mostrarResultados(r) {

    $("distancia-principal").textContent =
        formatoNumero(r.distancia_total);

    $("cantidad-escalas").textContent =
        r.escalas.length;

    $("mapa-ruta-texto").textContent =
        `${r.origen} → ${r.destino}`;

    $("mapa-estado").textContent =
        `${r.tramos.length} tramos · ` +
        `${formatoNumero(r.distancia_total)} km`;

    $("sello-validacion").className =
        "sello verde";

    $("sello-validacion").textContent =
        "✓ RUTA VÁLIDA";

    // RECORRIDO

    const resumen = $("resumen-ruta");

    resumen.replaceChildren();

    const codigos =
        document.createElement("div");

    codigos.className = "ruta-codigos";


    r.ruta.forEach((codigo, i) => {

        if (i) {

            const flecha =
                document.createElement("i");

            flecha.textContent = "➜";

            codigos.appendChild(flecha);
        }

        const etiqueta =
            document.createElement("span");

        etiqueta.textContent = codigo;

        codigos.appendChild(etiqueta);
    });


    const descripcion =
        document.createElement("span");

    descripcion.className = "ruta-detalle";

    descripcion.textContent =
        (
            r.escalas.length

                ? `Escalas: ${r.escalas.join(", ")}`

                : "Vuelo directo"

        ) + ` · ${formatoNumero(r.distancia_total)} km`;

    resumen.append(codigos, descripcion);

    // TRAMOS

    $("tramos").replaceChildren();

    r.tramos.forEach((tramo, i) => {

        const fila =
            document.createElement("div");

        fila.className = "tramo-item";

        const n =
            document.createElement("span");

        n.className = "tramo-num";

        n.textContent = i + 1;

        const ruta =
            document.createElement("b");

        ruta.textContent =
            `${tramo.origen} → ${tramo.destino}`;

        const km =
            document.createElement("small");

        km.textContent =
            `${formatoNumero(tramo.distancia)} km`;

        fila.append(n, ruta, km);

        $("tramos").appendChild(fila);
    });

    // MARKOV

    const caja = $("prediccion");

    caja.className = "";

    caja.replaceChildren();

    const barras =
        document.createElement("div");

    barras.className = "prob-bloque";


    for (const nombre of estado.red.estados) {

        const porcentaje =
            100 *
            r.prediccion.probabilidades_finales[nombre];

        const bloque =
            document.createElement("div");

        const etiquetas =
            document.createElement("div");

        etiquetas.className = "prob-etiquetas";

        const texto =
            document.createElement("span");

        texto.textContent = nombre;

        const valor =
            document.createElement("strong");

        valor.textContent =
            `${porcentaje.toFixed(2)}%`;

        etiquetas.append(texto, valor);


        const pista =
            document.createElement("div");

        pista.className = "prob-pista";

        const relleno =
            document.createElement("div");

        relleno.className =
            `prob-relleno ${COLORES[nombre] || ""}`;

        relleno.style.width = `${porcentaje}%`;

        pista.appendChild(relleno);

        bloque.append(etiquetas, pista);

        barras.appendChild(bloque);
    }


    const conclusion =
        document.createElement("div");

    conclusion.className =
        "prediccion-resumen";

    conclusion.textContent =
        `Período ${r.prediccion.periodos}: ` +
        `estado más probable ` +
        `${r.prediccion.estado_mas_probable}.`;

    caja.append(barras, conclusion);
}

// DETENER ANIMACIÓN

function detenerAnimacion() {

    if (estado.frame !== null) {

        cancelAnimationFrame(estado.frame);
    }

    estado.frame = null;

    estado.activo = false;

    estado.tiempoAnterior = null;
}

// DURACIÓN DEL TRAMO

function duracionTramo() {

    const km =
        estado.ruta.tramos[estado.segmento].distancia;

    return Math.max(
        1850,
        Math.min(4700, km * 0.95)
    );
}

// COLOCAR EL AVIÓN

function colocarAvion() {

    if (!estado.ruta || !estado.avion) {
        return;
    }

    const origen = coordenada(
        estado.ruta.ruta[estado.segmento]
    );

    const destino = coordenada(
        estado.ruta.ruta[estado.segmento + 1]
    );

    const t = estado.progreso;


    // Movimiento del avión entre dos puntos.

    estado.avion.setLatLng([

        origen[0] +
        (destino[0] - origen[0]) * t,

        origen[1] +
        (destino[1] - origen[1]) * t

    ]);


    // Orientación del avioncito.

    const p1 = estado.mapa.latLngToLayerPoint(origen);

    const p2 = estado.mapa.latLngToLayerPoint(destino);

    const angulo = Math.atan2(

        p2.x - p1.x,

        -(p2.y - p1.y)

    ) * 180 / Math.PI;


    const svg = estado.avion.getElement()
        ?.querySelector(".avion-svg");

    if (svg) {

        svg.style.transform =
            `rotate(${angulo}deg)`;
    }


    // Información del tramo actual.

    $("tramo-actual").textContent =
        `${estado.ruta.ruta[estado.segmento]}` +
        ` → ` +
        `${estado.ruta.ruta[estado.segmento + 1]}`;

    $("estado-animacion").textContent =
        `Tramo ${estado.segmento + 1} de ` +
        `${estado.ruta.tramos.length} · ` +
        `${Math.round(t * 100)}% recorrido`;
}

// ANIMAR EL AVIÓN

function animar(timestamp) {

    if (!estado.activo || !estado.ruta) {
        return;
    }

    if (estado.tiempoAnterior === null) {

        estado.tiempoAnterior = timestamp;
    }

    const delta = Math.min(
        70,
        timestamp - estado.tiempoAnterior
    );

    estado.tiempoAnterior = timestamp;


    // Avanzar en el recorrido.

    estado.progreso +=

        delta *
        Number($("velocidad").value) /
        duracionTramo();


    // Verificar llegada al siguiente aeropuerto.

    if (estado.progreso >= 1) {

        estado.segmento++;

        estado.progreso = 0;


        // Llegada al destino final.

        if (
            estado.segmento >=
            estado.ruta.tramos.length
        ) {

            estado.segmento =
                estado.ruta.tramos.length - 1;

            estado.progreso = 1;

            colocarAvion();

            detenerAnimacion();

            estado.completado = true;

            $("pausa").disabled = true;

            $("pausa").textContent = "✓ Llegó";

            $("estado-animacion").textContent =
                `Llegada a ${estado.ruta.destino}`;

            mensaje(
                "El avión llegó a su destino.",
                "ok"
            );

            return;
        }
    }


    colocarAvion();

    estado.frame =
        requestAnimationFrame(animar);
}

// INICIAR VUELO

function iniciarVuelo() {

    if (!estado.ruta) {
        return;
    }

    detenerAnimacion();

    estado.segmento = 0;
    estado.progreso = 0;

    estado.completado = false;
    estado.activo = true;


    $("pausa").disabled = false;

    $("reiniciar").disabled = false;

    $("pausa").textContent = "❚❚ Pausar";


    colocarAvion();

    estado.frame =
        requestAnimationFrame(animar);
}

// PAUSAR O CONTINUAR

function pausarOContinuar() {

    if (estado.activo) {

        detenerAnimacion();

        $("pausa").textContent =
            "▶ Continuar";

        $("estado-animacion").textContent =
            "Vuelo en pausa";

    } else if (
        estado.ruta &&
        !estado.completado
    ) {

        estado.activo = true;

        estado.tiempoAnterior = null;

        $("pausa").textContent =
            "❚❚ Pausar";

        estado.frame =
            requestAnimationFrame(animar);
    }
}

// BUSCAR RUTA

async function buscarRuta() {

    const solicitud = ++estado.solicitud;

    detenerAnimacion();

    $("calcular").disabled = true;

    mensaje("Calculando la mejor ruta...");


    const parametros = new URLSearchParams({

        origen: $("origen").value,

        destino: $("destino").value,

        estado: $("estado").value,

        periodos: $("periodos").value
    });


    try {

        const resultado = await pedirJSON(
            `/api/ruta?${parametros}`
        );

        if (solicitud !== estado.solicitud) {
            return;
        }

        estado.ruta = resultado;

        mostrarResultados(resultado);

        mostrarRutaEnMapa(resultado);

        iniciarVuelo();

        mensaje(
            `Ruta encontrada: ${resultado.ruta.join(" → ")}`,
            "ok"
        );

    } catch (error) {

        if (solicitud !== estado.solicitud) {
            return;
        }

        estado.ruta = null;
        estado.avion = null;

        estado.capaRuta.clearLayers();

        $("pausa").disabled = true;
        $("reiniciar").disabled = true;

        $("distancia-principal").textContent = "—";
        $("cantidad-escalas").textContent = "—";

        $("mapa-ruta-texto").textContent =
            "Ruta no disponible";

        $("mapa-estado").textContent =
            error.message;

        $("sello-validacion").className =
            "sello gris";

        $("sello-validacion").textContent =
            "Sin ruta";

        $("resumen-ruta").textContent =
            "No existe una ruta para esos aeropuertos.";

        $("tramos").replaceChildren();

        $("prediccion").textContent =
            "No hay predicción para esta ruta.";

        $("tramo-actual").textContent =
            "Vuelo no disponible";

        $("estado-animacion").textContent =
            error.message;

        mensaje(error.message, "error");

    } finally {

        if (solicitud === estado.solicitud) {

            $("calcular").disabled = false;
        }
    }
}

// INICIAR AEROROUTE

async function iniciar() {

    // Buscar ruta.

    $("form-vuelos").addEventListener(
        "submit",
        (e) => {

            e.preventDefault();

            buscarRuta();
        }
    );


    // Intercambiar aeropuertos.

    $("intercambiar").addEventListener(
        "click",
        () => {

            const anterior = $("origen").value;

            $("origen").value =
                $("destino").value;

            $("destino").value =
                anterior;
        }
    );


    // Mostrar u ocultar conexiones.

    $("mostrar-red").addEventListener(
        "change",
        (e) => {

            if (!estado.mapa) {
                return;
            }

            if (e.target.checked) {

                estado.capaConexiones.addTo(
                    estado.mapa
                );

            } else {

                estado.mapa.removeLayer(
                    estado.capaConexiones
                );
            }
        }
    );


    // Controles del vuelo.

    $("pausa").addEventListener(
        "click",
        pausarOContinuar
    );

    $("reiniciar").addEventListener(
        "click",
        iniciarVuelo
    );


    // Cargar mapa y datos.

    try {

        inicializarMapa();

        estado.red = await pedirJSON("/api/red");

        llenarSelectores();

        mostrarRed();

        await buscarRuta();

    } catch (error) {

        mensaje(
            `No se pudo iniciar AeroRoute: ${error.message}`,
            "error"
        );

        $("mapa-estado").textContent =
            error.message;
    }
}


// EJECUTAR

document.addEventListener(
    "DOMContentLoaded",
    iniciar
);
