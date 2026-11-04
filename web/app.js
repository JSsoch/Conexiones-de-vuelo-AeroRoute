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

const sistema = {
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

async function pedirJSON(url, opciones = {}) {

    const respuesta = await fetch(url, opciones);

    let datos = {};

    try {
        datos = await respuesta.json();
    } catch (error) {
        datos = {};
    }

    if (!respuesta.ok) {
        throw new Error(
            datos.error ||
            `Error del servidor (${respuesta.status}).`
        );
    }

    return datos;
}


async function enviarJSON(url, datos) {

    return pedirJSON(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(datos)
    });
}


function mensaje(texto, tipo = "") {

    $("mensaje").textContent = texto;
    $("mensaje").className = "mensaje " + tipo;
}


function mensajeEditor(texto, tipo = "") {

    $("mensaje-editor").textContent = texto;
    $("mensaje-editor").className =
        "mensaje-editor " + tipo;
}

// MAPA REAL CON OPENSTREETMAP

function inicializarMapa() {

    if (typeof L === "undefined") {
        throw new Error(
            "No cargó Leaflet. Comprueba tu conexión a Internet."
        );
    }

    sistema.mapa = L.map("mapa", {

        zoomControl: false,

        minZoom: 2,
        maxZoom: 19,

        worldCopyJump: true,
        preferCanvas: true
    });

    L.control.zoom({
        position: "bottomright"
    }).addTo(sistema.mapa);

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

    mapaBase.addTo(sistema.mapa);


    // Capas de conexiones y ruta óptima.

    sistema.capaConexiones = L.layerGroup()
        .addTo(sistema.mapa);

    sistema.capaRuta = L.layerGroup()
        .addTo(sistema.mapa);


    // Vista inicial.

    sistema.mapa.setView([14, -67], 3);


    // Autocompletar coordenadas del formulario de nodos.

    sistema.mapa.on("click", (e) => {

        $("nueva-lat").value =
            e.latlng.lat.toFixed(4);

        $("nueva-lon").value =
            e.latlng.lng.toFixed(4);

        const panel =
            document.querySelector(".panel-edicion");

        if (panel) {
            panel.open = true;
        }

        mensajeEditor(
            "Coordenadas capturadas. " +
            "Completa el código y el nombre.",
            "ok"
        );
    });
}

// INFORMACIÓN DE AEROPUERTOS

function aeropuerto(codigo) {

    const a = sistema.red.aeropuertos.find(
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

function pintarRed() {

    const limites = [];

    for (const a of sistema.red.aeropuertos) {

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
        ).addTo(sistema.mapa);


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

        sistema.pines.set(a.codigo, pin);
    }

    // DIBUJAR CONEXIONES

    for (const vuelo of sistema.red.conexiones) {

        L.polyline(
            [
                coordenada(vuelo.origen),
                coordenada(vuelo.destino)
            ],

            {
                color: "#6CA3A2",

                weight: 1.4,
                opacity: 0.65,

                dashArray: "3 6",

                interactive: false
            }

        ).addTo(sistema.capaConexiones);
    }


    // Mostrar todos los aeropuertos.

    sistema.mapa.fitBounds(
        limites,
        { padding: [35, 35] }
    );
}

// LIMPIAR EL MAPA Y LOS RESULTADOS

function limpiarMapa() {

    if (sistema.mapa) {

        for (const pin of sistema.pines.values()) {
            sistema.mapa.removeLayer(pin);
        }

        if (sistema.capaConexiones) {
            sistema.capaConexiones.clearLayers();
        }

        if (sistema.capaRuta) {
            sistema.capaRuta.clearLayers();
        }
    }

    sistema.pines.clear();

    sistema.avion = null;
    sistema.ruta = null;

    sistema.segmento = 0;
    sistema.progreso = 0;
    sistema.completado = false;
}


function limpiarResultados() {

    $("distancia-principal").textContent = "—";
    $("cantidad-escalas").textContent = "—";

    $("sello-validacion").className = "sello gris";
    $("sello-validacion").textContent = "Sin calcular";

    $("resumen-ruta").textContent =
        "El recorrido aparecerá aquí.";

    $("tramos").replaceChildren();

    $("prediccion").className = "prediccion-vacia";
    $("prediccion").textContent =
        "Calcula una ruta para ver las probabilidades.";

    $("mapa-ruta-texto").textContent =
        "Selecciona una ruta";

    $("mapa-estado").textContent =
        "Red actualizada. Busca una nueva ruta.";

    $("tramo-actual").textContent = "Vuelo preparado";

    $("estado-animacion").textContent =
        "Busca una ruta para comenzar";

    mensaje("Red actualizada. Busca una nueva ruta.", "ok");

    $("calcular").disabled = false;
    $("pausa").disabled = true;
    $("reiniciar").disabled = true;
    $("pausa").textContent = "❚❚ Pausar";
}


// RECARGAR LA RED DESPUÉS DE UNA EDICIÓN

async function actualizarRed(red) {

    // Los endpoints de edición devuelven la red completa.
    // Si no viene en la respuesta, se consulta de nuevo.

    const datos = red || await pedirJSON("/api/red");

    // Invalidar cualquier búsqueda de ruta que siga en curso.

    sistema.solicitud++;

    detenerAnimacion();

    sistema.red = datos;

    limpiarMapa();
    limpiarResultados();
    llenarSelectores();

    // En modo Leaflet se redibuja la red completa.

    if (sistema.mapa && typeof L !== "undefined") {
        pintarRed();
    }
}

// LLENAR SELECTORES

function llenarSelector(selector, anterior, defecto) {

    selector.replaceChildren();

    for (const a of sistema.red.aeropuertos) {

        const opcion =
            document.createElement("option");

        opcion.value = a.codigo;

        opcion.textContent =
            `${a.codigo} · ${a.nombre}`;

        selector.appendChild(opcion);
    }

    const disponibles = Array.from(
        selector.options,
        (opcion) => opcion.value
    );

    if (anterior && disponibles.includes(anterior)) {

        selector.value = anterior;

    } else if (defecto && disponibles.includes(defecto)) {

        selector.value = defecto;

    } else if (disponibles.length) {

        selector.value = disponibles[0];
    }
}


function llenarSelectores() {

    const anteriores = {
        origen: $("origen").value,
        destino: $("destino").value,
        aristaOrigen: $("arista-origen").value,
        aristaDestino: $("arista-destino").value
    };

    llenarSelector($("origen"), anteriores.origen, "GUA");
    llenarSelector($("destino"), anteriores.destino, "MAD");

    llenarSelector(
        $("arista-origen"),
        anteriores.aristaOrigen,
        "GUA"
    );

    llenarSelector(
        $("arista-destino"),
        anteriores.aristaDestino,
        "MEX"
    );


    // Evitar que una conexión use el mismo aeropuerto dos veces.

    if ($("arista-origen").value === $("arista-destino").value) {

        const alterno = sistema.red.aeropuertos.find(
            (a) => a.codigo !== $("arista-origen").value
        );

        if (alterno) {
            $("arista-destino").value = alterno.codigo;
        }
    }

    $("estado").replaceChildren();


    // Estados de Markov.

    for (const nombre of sistema.red.estados) {

        const opcion =
            document.createElement("option");

        opcion.value = nombre;
        opcion.textContent = nombre;

        $("estado").appendChild(opcion);
    }


    $("cantidad-aeropuertos").textContent =
        sistema.red.total_aeropuertos;

    $("cantidad-conexiones").textContent =
        sistema.red.total_conexiones;
}

// MOSTRAR RUTA ÓPTIMA EN EL MAPA

function mostrarRutaEnMapa(resultado) {

    sistema.capaRuta.clearLayers();

    const puntos = resultado.ruta.map(coordenada);


    // Brillo de la ruta.

    L.polyline(puntos, {

        color: "#29d4f8",

        weight: 9,
        opacity: 0.17,

        interactive: false

    }).addTo(sistema.capaRuta);


    // Línea de la ruta.

    L.polyline(puntos, {

        color: "#EA9940",

        weight: 3.6,
        opacity: 0.95,

        interactive: false

    }).addTo(sistema.capaRuta);


    // Resaltar aeropuertos del recorrido.

    for (const [codigo, pin] of sistema.pines) {

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

    sistema.mapa.fitBounds(puntos, {

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


    sistema.avion = L.marker(

        puntos[0],

        {
            icon: iconoAvion,

            zIndexOffset: 1000,

            interactive: false
        }

    ).addTo(sistema.capaRuta);
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


    for (const nombre of sistema.red.estados) {

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

    if (sistema.frame !== null) {

        cancelAnimationFrame(sistema.frame);
    }

    sistema.frame = null;

    sistema.activo = false;

    sistema.tiempoAnterior = null;
}

// DURACIÓN DEL TRAMO

function duracionTramo() {

    const km =
        sistema.ruta.tramos[sistema.segmento].distancia;

    return Math.max(
        1850,
        Math.min(4700, km * 0.95)
    );
}

// COLOCAR EL AVIÓN

function colocarAvion() {

    if (!sistema.ruta || !sistema.avion) {
        return;
    }

    const origen = coordenada(
        sistema.ruta.ruta[sistema.segmento]
    );

    const destino = coordenada(
        sistema.ruta.ruta[sistema.segmento + 1]
    );

    const t = sistema.progreso;


    // Movimiento del avión entre dos puntos.

    sistema.avion.setLatLng([

        origen[0] +
        (destino[0] - origen[0]) * t,

        origen[1] +
        (destino[1] - origen[1]) * t

    ]);


    // Orientación del avioncito.

    const p1 = sistema.mapa.latLngToLayerPoint(origen);

    const p2 = sistema.mapa.latLngToLayerPoint(destino);

    const angulo = Math.atan2(

        p2.x - p1.x,

        -(p2.y - p1.y)

    ) * 180 / Math.PI;


    const svg = sistema.avion.getElement()
        ?.querySelector(".avion-svg");

    if (svg) {

        svg.style.transform =
            `rotate(${angulo}deg)`;
    }


    // Información del tramo actual.

    $("tramo-actual").textContent =
        `${sistema.ruta.ruta[sistema.segmento]}` +
        ` → ` +
        `${sistema.ruta.ruta[sistema.segmento + 1]}`;

    $("estado-animacion").textContent =
        `Tramo ${sistema.segmento + 1} de ` +
        `${sistema.ruta.tramos.length} · ` +
        `${Math.round(t * 100)}% recorrido`;
}

// ANIMAR EL AVIÓN

function animar(timestamp) {

    if (!sistema.activo || !sistema.ruta) {
        return;
    }

    if (sistema.tiempoAnterior === null) {

        sistema.tiempoAnterior = timestamp;
    }

    const delta = Math.min(
        70,
        timestamp - sistema.tiempoAnterior
    );

    sistema.tiempoAnterior = timestamp;


    // Avanzar en el recorrido.

    sistema.progreso +=

        delta *
        Number($("velocidad").value) /
        duracionTramo();


    // Verificar llegada al siguiente aeropuerto.

    if (sistema.progreso >= 1) {

        sistema.segmento++;

        sistema.progreso = 0;


        // Llegada al destino final.

        if (
            sistema.segmento >=
            sistema.ruta.tramos.length
        ) {

            sistema.segmento =
                sistema.ruta.tramos.length - 1;

            sistema.progreso = 1;

            colocarAvion();

            detenerAnimacion();

            sistema.completado = true;

            $("pausa").disabled = true;

            $("pausa").textContent = "✓ Llegó";

            $("estado-animacion").textContent =
                `Llegada a ${sistema.ruta.destino}`;

            mensaje(
                "El avión llegó a su destino.",
                "ok"
            );

            return;
        }
    }


    colocarAvion();

    sistema.frame =
        requestAnimationFrame(animar);
}

// INICIAR VUELO

function iniciarVuelo() {

    if (!sistema.ruta) {
        return;
    }

    detenerAnimacion();

    sistema.segmento = 0;
    sistema.progreso = 0;

    sistema.completado = false;
    sistema.activo = true;


    $("pausa").disabled = false;

    $("reiniciar").disabled = false;

    $("pausa").textContent = "❚❚ Pausar";


    colocarAvion();

    sistema.frame =
        requestAnimationFrame(animar);
}

// PAUSAR O CONTINUAR

function pausarOContinuar() {

    if (sistema.activo) {

        detenerAnimacion();

        $("pausa").textContent =
            "▶ Continuar";

        $("estado-animacion").textContent =
            "Vuelo en pausa";

    } else if (
        sistema.ruta &&
        !sistema.completado
    ) {

        sistema.activo = true;

        sistema.tiempoAnterior = null;

        $("pausa").textContent =
            "❚❚ Pausar";

        sistema.frame =
            requestAnimationFrame(animar);
    }
}

// BUSCAR RUTA

async function buscarRuta() {

    const solicitud = ++sistema.solicitud;

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

        const tInicio = performance.now();
        const resultado = await pedirJSON(
            `/api/ruta?${parametros}`
        );

        const relTiempo = $("tiempo-computo");
        if (relTiempo) {
            relTiempo.textContent = `${(performance.now() - tInicio).toFixed(1)} ms`;
        }

        if (solicitud !== sistema.solicitud) {
            return;
        }

        sistema.ruta = resultado;

        mostrarResultados(resultado);

        mostrarRutaEnMapa(resultado);

        iniciarVuelo();

        mensaje(
            `Ruta encontrada: ${resultado.ruta.join(" → ")}`,
            "ok"
        );

    } catch (error) {

        const relTiempo = $("tiempo-computo");
        if (relTiempo) {
            relTiempo.textContent = `${(performance.now() - tInicio).toFixed(1)} ms`;
        }

        if (solicitud !== sistema.solicitud) {
            return;
        }

        sistema.ruta = null;
        sistema.avion = null;

        sistema.capaRuta.clearLayers();

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

        if (solicitud === sistema.solicitud) {

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

            if (!sistema.mapa) {
                return;
            }

            if (e.target.checked) {

                sistema.capaConexiones.addTo(
                    sistema.mapa
                );

            } else {

                sistema.mapa.removeLayer(
                    sistema.capaConexiones
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


    // Editor del grafo: nuevo aeropuerto.

    $("form-nodo").addEventListener(
        "submit",
        async (e) => {

            e.preventDefault();

            const formulario = e.currentTarget;

            const boton = formulario.querySelector(
                'button[type="submit"]'
            );

            boton.disabled = true;

            mensajeEditor("Registrando aeropuerto...");

            const codigo =
                $("nuevo-codigo").value.trim().toUpperCase();

            try {

                const respuesta = await enviarJSON(
                    "/api/aeropuerto",
                    {
                        codigo,

                        nombre:
                            $("nuevo-nombre").value.trim(),

                        lat: Number($("nueva-lat").value),

                        lon: Number($("nueva-lon").value)
                    }
                );

                await actualizarRed(respuesta.red);

                // Dejar el nodo listo para su primera conexión.

                $("arista-origen").value = codigo;

                formulario.reset();

                mensajeEditor(
                    respuesta.mensaje ||
                    `Aeropuerto ${codigo} agregado.`,
                    "ok"
                );

            } catch (error) {

                mensajeEditor(error.message, "error");

            } finally {

                boton.disabled = false;
            }
        }
    );


    // Editor del grafo: nueva conexión.

    $("form-arista").addEventListener(
        "submit",
        async (e) => {

            e.preventDefault();

            const boton = e.currentTarget.querySelector(
                'button[type="submit"]'
            );

            boton.disabled = true;

            mensajeEditor("Registrando conexión...");

            const datos = {
                origen: $("arista-origen").value,

                destino: $("arista-destino").value,

                distancia:
                    Number($("arista-distancia").value),

                bidireccional:
                    $("arista-bidireccional").checked
            };

            try {

                const respuesta = await enviarJSON(
                    "/api/vuelo",
                    datos
                );

                await actualizarRed(respuesta.red);

                // Preparar el planificador con la conexión creada.

                $("origen").value = datos.origen;
                $("destino").value = datos.destino;

                $("arista-distancia").value = "";
                $("arista-bidireccional").checked = false;

                mensajeEditor(
                    respuesta.mensaje ||
                    `Conexión ${datos.origen} -> ` +
                    `${datos.destino} registrada.`,
                    "ok"
                );

            } catch (error) {

                mensajeEditor(error.message, "error");

            } finally {

                boton.disabled = false;
            }
        }
    );


    // Cargar mapa y datos.

    try {

        inicializarMapa();

        sistema.red = await pedirJSON("/api/red");

        llenarSelectores();

        pintarRed();

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
