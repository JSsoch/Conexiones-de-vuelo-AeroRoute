"use strict";

// VARIABLES GENERALES

const $ = (id) => document.getElementById(id);

const formatoNumero = (numero) => {
    return Number(numero).toLocaleString("es-GT", {
        maximumFractionDigits: 0
    });
};

const ESTADO_COLORES = {
    "A tiempo": "prob-a-tiempo",
    "Retrasado": "prob-retrasado",
    "Cancelado": "prob-cancelado"
};

const sistema = {
    red: null,
    mapa: null,
    canvas: null,

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
    frame: null
};

// COMUNICACIÓN CON PYTHON

async function pedirJSON(url) {

    const respuesta = await fetch(url);

    const datos = await respuesta.json();

    if (!respuesta.ok) {
        throw new Error(
            datos.error || "Error en el servidor."
        );
    }

    return datos;
}


function setMensaje(texto, tipo = "") {

    $("mensaje").textContent = texto;

    $("mensaje").className = "mensaje " + tipo;
}

// INICIALIZAR MAPA

function inicializarMapa() {

    // Si Leaflet no está disponible,
    // utilizamos un mapa vectorial local.

    if (typeof L === "undefined") {

        $("mapa-fallback").hidden = false;

        sistema.canvas = $("mapa-local").getContext("2d");

        $("mapa-estado").textContent =
            "Mapa vectorial ilustrativo";

        return;
    }

    sistema.mapa = L.map("mapa", {
        zoomControl: false,
        minZoom: 2,
        worldCopyJump: true,
        preferCanvas: true
    });

    L.control.zoom({
        position: "bottomright"
    }).addTo(sistema.mapa);

    L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
        {
            maxZoom: 18,
            attribution: "&copy; OpenStreetMap &copy; CARTO",
            subdomains: "abcd"
        }
    ).addTo(sistema.mapa);

    sistema.capaConexiones = L.layerGroup()
        .addTo(sistema.mapa);

    sistema.capaRuta = L.layerGroup()
        .addTo(sistema.mapa);

    sistema.mapa.setView([12, -63], 3);
}

// COORDENADAS DE AEROPUERTOS

function coordenada(codigo) {

    const aeropuerto = sistema.red.aeropuertos.find(
        a => a.codigo === codigo
    );

    return [
        aeropuerto.lat,
        aeropuerto.lng
    ];
}

// MOSTRAR AEROPUERTOS Y CONEXIONES


function pintarRed() {

    if (!sistema.mapa) {
        dibujarMapaLocal();
        return;
    }

    const limites = [];

    for (const aeropuerto of sistema.red.aeropuertos) {

        const ubicacion = [
            aeropuerto.lat,
            aeropuerto.lng
        ];

        limites.push(ubicacion);

        const icono = L.divIcon({
            className: "aeropuerto-punto",

            iconSize: [27, 40],
            iconAnchor: [13, 13],

            html: `
                <div class="pin-punto"></div>
                <span class="pin-codigo">
                    ${aeropuerto.codigo}
                </span>
            `
        });

        const pin = L.marker(
            ubicacion,
            { icon: icono }
        ).addTo(sistema.mapa);

        pin.bindPopup(`
            <strong>${aeropuerto.codigo}</strong>
            <br>
            ${aeropuerto.nombre}
        `);

        sistema.pines.set(
            aeropuerto.codigo,
            pin
        );
    }

    // Dibujar todas las conexiones del grafo.

    for (const conexion of sistema.red.conexiones) {

        L.polyline(
            [
                coordenada(conexion.origen),
                coordenada(conexion.destino)
            ],
            {
                color: "#376b84",
                weight: 1.2,
                opacity: 0.53,
                dashArray: "3 6",
                interactive: false
            }
        ).addTo(sistema.capaConexiones);
    }

    sistema.mapa.fitBounds(limites, {
        padding: [35, 35]
    });
}

// LLENAR LOS SELECTORES

function llenarSelects() {

    const aeropuertos = sistema.red.aeropuertos;

    for (const id of ["origen", "destino"]) {

        const select = $(id);

        select.replaceChildren();

        aeropuertos.forEach(a => {

            const opcion = document.createElement("option");

            opcion.value = a.codigo;

            opcion.textContent =
                `${a.codigo} - ${a.nombre}`;

            select.appendChild(opcion);
        });
    }

    $("origen").value = "GUA";
    $("destino").value = "MAD";

    $("estado").replaceChildren();

    sistema.red.estados.forEach(nombre => {

        const opcion = document.createElement("option");

        opcion.value = nombre;
        opcion.textContent = nombre;

        $("estado").appendChild(opcion);
    });

    $("cantidad-aeropuertos").textContent =
        sistema.red.total_aeropuertos;

    $("cantidad-conexiones").textContent =
        sistema.red.total_conexiones;
}

// DIBUJAR LA RUTA MÁS CORTA

function actualizarMapaRuta(resultado) {

    if (!sistema.mapa) {
        dibujarMapaLocal();
        return;
    }

    sistema.capaRuta.clearLayers();

    const puntos = resultado.ruta.map(coordenada);

    // Efecto de brillo sobre la ruta.

    L.polyline(puntos, {
        color: "#29d4f8",
        weight: 9,
        opacity: 0.15,
        interactive: false
    }).addTo(sistema.capaRuta);

    // Línea principal de la ruta.

    L.polyline(puntos, {
        color: "#5cf2d4",
        weight: 3.6,
        opacity: 0.95,
        interactive: false
    }).addTo(sistema.capaRuta);

    // Marcar los aeropuertos del recorrido.

    for (const [codigo, pin] of sistema.pines) {

        const nodo = pin.getElement()?.querySelector(
            ".pin-punto"
        );

        if (nodo) {
            nodo.classList.toggle(
                "ruta",
                resultado.ruta.includes(codigo)
            );
        }
    }

    sistema.mapa.fitBounds(puntos, {
        paddingTopLeft: [90, 90],
        paddingBottomRight: [70, 55],
        maxZoom: 5
    });

    // Crear el avioncito.

    const iconoAvion = L.divIcon({
        className: "avion-marcador",

        iconSize: [38, 38],
        iconAnchor: [19, 19],

        html: `
            <span class="avion-svg">
                <svg viewBox="0 0 40 40">
                    <circle class="halo"
                            cx="20"
                            cy="20"
                            r="17"/>

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
            zIndexOffset: 1000,
            interactive: false,
            icon: iconoAvion
        }
    ).addTo(sistema.capaRuta);
}

// MOSTRAR RESULTADOS DE DIJKSTRA Y MARKOV

function presentarResultados(resultado) {

    const resumen = resultado.ruta.map(
        (codigo, indice) => {

            const flecha = indice ? "<i>➜</i>" : "";

            return `
                ${flecha}
                <span>${codigo}</span>
            `;
        }
    ).join("");

    $("distancia-principal").textContent =
        formatoNumero(resultado.distancia_total);

    $("cantidad-escalas").textContent =
        resultado.escalas.length;

    $("mapa-ruta-texto").textContent =
        `${resultado.origen} → ${resultado.destino}`;

    $("mapa-estado").textContent =
        `${resultado.ruta.length - 1} tramos - ` +
        `${formatoNumero(resultado.distancia_total)} km`;

    $("sello-validacion").className =
        "sello verde";

    $("sello-validacion").textContent =
        "✓ RUTA VÁLIDA";

    const descripcion = resultado.escalas.length
        ? "Escalas: " + resultado.escalas.join(", ")
        : "Vuelo directo, sin escalas";

    $("resumen-ruta").innerHTML = `
        <div class="ruta-codigos">
            ${resumen}
        </div>

        <span class="ruta-detalle">
            ${descripcion} -
            ${formatoNumero(resultado.distancia_total)} km
        </span>
    `;

    // Mostrar los tramos individuales.

    $("tramos").replaceChildren();

    resultado.tramos.forEach((tramo, indice) => {

        const item = document.createElement("div");

        item.className = "tramo-item";

        item.innerHTML = `
            <span class="tramo-num">
                ${indice + 1}
            </span>

            <b>
                ${tramo.origen} → ${tramo.destino}
            </b>

            <small>
                ${formatoNumero(tramo.distancia)} km
            </small>
        `;

        $("tramos").appendChild(item);
    });

    // Mostrar probabilidades de Markov.

    const pronostico = resultado.prediccion;

    const tarjetas = sistema.red.estados.map(nombre => {

        const valor =
            pronostico.probabilidades_finales[nombre] * 100;

        const clase = ESTADO_COLORES[nombre] || "";

        return `
            <div>
                <div class="prob-etiquetas">
                    <span>${nombre}</span>
                    <strong>${valor.toFixed(2)}%</strong>
                </div>

                <div class="prob-pista">
                    <div class="prob-relleno ${clase}"
                         style="width:${valor}%">
                    </div>
                </div>
            </div>
        `;
    }).join("");

    $("prediccion").className = "";

    $("prediccion").innerHTML = `
        <div class="prob-bloque">
            ${tarjetas}
        </div>

        <div class="prediccion-resumen">
            Período ${pronostico.periodos}:
            estado más probable
            <b>${pronostico.estado_mas_probable}</b>.
        </div>
    `;
}

// CONTROL DE ANIMACIÓN


function detenerAnimacion() {

    if (sistema.frame !== null) {
        cancelAnimationFrame(sistema.frame);
    }

    sistema.frame = null;
    sistema.activo = false;
    sistema.tiempoAnterior = null;
}


function duracionTramo() {

    const distancia =
        sistema.ruta.tramos[sistema.segmento].distancia;

    return Math.max(
        1850,
        Math.min(4700, distancia * 0.95)
    );
}


// MOVIMIENTO DEL AVIÓN

function colocarAvion() {

    if (!sistema.ruta) {
        return;
    }

    if (!sistema.mapa || !sistema.avion) {
        dibujarMapaLocal();
        return;
    }

    const origen = coordenada(
        sistema.ruta.ruta[sistema.segmento]
    );

    const destino = coordenada(
        sistema.ruta.ruta[sistema.segmento + 1]
    );

    const progreso = sistema.progreso;

    // Interpolación entre aeropuerto de
    // salida y aeropuerto de llegada.

    const latitud = origen[0] +
        (destino[0] - origen[0]) * progreso;

    const longitud = origen[1] +
        (destino[1] - origen[1]) * progreso;

    sistema.avion.setLatLng([
        latitud,
        longitud
    ]);

    // Orientación del avión.

    const puntoOrigen =
        sistema.mapa.latLngToLayerPoint(origen);

    const puntoDestino =
        sistema.mapa.latLngToLayerPoint(destino);

    const angulo = Math.atan2(
        puntoDestino.x - puntoOrigen.x,
        -(puntoDestino.y - puntoOrigen.y)
    ) * 180 / Math.PI;

    const icono = sistema.avion.getElement()
        ?.querySelector(".avion-svg");

    if (icono) {
        icono.style.transform =
            `rotate(${angulo}deg)`;
    }

    $("tramo-actual").textContent =
        `${sistema.ruta.ruta[sistema.segmento]}` +
        ` → ` +
        `${sistema.ruta.ruta[sistema.segmento + 1]}`;

    $("estado-animacion").textContent =
        `Tramo ${sistema.segmento + 1} de ` +
        `${sistema.ruta.tramos.length} - ` +
        `${Math.round(progreso * 100)}% recorrido`;
}

// ANIMAR CADA TRAMO

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

    const velocidad = Number(
        $("velocidad").value
    );

    sistema.progreso += (
        delta * velocidad / duracionTramo()
    );

    // Comprobar si el avión llegó al
    // siguiente aeropuerto.

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

            $("pausa").textContent = "✓ Llegó";
            $("pausa").disabled = true;

            $("estado-animacion").textContent =
                `Llegada a ${sistema.ruta.destino}`;

            setMensaje(
                "El avión completó todos los tramos.",
                "ok"
            );

            return;
        }
    }

    colocarAvion();

    sistema.frame = requestAnimationFrame(animar);
}

// INICIAR EL VUELO

function iniciarVuelo() {

    if (!sistema.ruta) {
        return;
    }

    detenerAnimacion();

    sistema.segmento = 0;
    sistema.progreso = 0;
    sistema.completado = false;
    sistema.activo = true;
    sistema.tiempoAnterior = null;

    $("pausa").disabled = false;
    $("reiniciar").disabled = false;

    $("pausa").textContent = "❚❚ Pausar";

    colocarAvion();

    sistema.frame = requestAnimationFrame(animar);
}

// PAUSAR Y CONTINUAR

function pausarOContinuar() {

    if (sistema.activo) {

        detenerAnimacion();

        $("pausa").textContent = "▶ Continuar";

        $("estado-animacion").textContent =
            "Vuelo en pausa";

    } else if (
        !sistema.completado &&
        sistema.ruta
    ) {

        sistema.activo = true;
        sistema.tiempoAnterior = null;

        $("pausa").textContent = "❚❚ Pausar";

        sistema.frame = requestAnimationFrame(animar);
    }
}

// BUSCAR UNA RUTA NUEVA

async function buscarRuta() {

    detenerAnimacion();

    $("calcular").disabled = true;

    setMensaje(
        "Calculando la ruta y verificando conexiones..."
    );

    const parametros = new URLSearchParams({
        origen: $("origen").value,
        destino: $("destino").value,
        estado: $("estado").value,
        periodos: $("periodos").value
    });

    try {

        const resultado = await pedirJSON(
            `/api/ruta?${parametros.toString()}`
        );

        sistema.ruta = resultado;

        presentarResultados(resultado);

        actualizarMapaRuta(resultado);

        iniciarVuelo();

        setMensaje(
            `Ruta encontrada: ${resultado.ruta.join(" → ")}`,
            "ok"
        );

    } catch (error) {

        sistema.ruta = null;

        $("pausa").disabled = true;
        $("reiniciar").disabled = true;

        setMensaje(error.message, "error");

        $("distancia-principal").textContent = "—";
        $("cantidad-escalas").textContent = "—";

        $("resumen-ruta").textContent =
            "No existe un recorrido disponible.";

        $("tramos").replaceChildren();

        $("prediccion").textContent =
            "Selecciona otra ruta.";

        $("tramo-actual").textContent =
            "Ruta no disponible";

        $("estado-animacion").textContent =
            error.message;

        $("sello-validacion").className =
            "sello gris";

        $("sello-validacion").textContent =
            "Sin ruta";

        if (sistema.capaRuta) {
            sistema.capaRuta.clearLayers();
        }

        dibujarMapaLocal();

    } finally {

        $("calcular").disabled = false;
    }
}

// MAPA ALTERNATIVO SIN LEAFLET

const MASAS_TERRESTRES = [
    [
        [-133,54], [-127,49], [-124,42],
        [-117,32], [-111,31], [-107,27],
        [-105,23], [-99,17], [-96,16],
        [-93,19], [-90,21], [-86,21],
        [-84,24], [-82,27], [-80,32],
        [-76,35], [-71,42], [-66,45],
        [-60,51], [-70,58], [-85,61],
        [-102,60], [-118,57]
    ],
    [
        [-93,18], [-88,15], [-86,12],
        [-83,10], [-81,8], [-78,8],
        [-79,11], [-83,12], [-86,15],
        [-90,19]
    ],
    [
        [-79,9], [-75,12], [-68,12],
        [-62,9], [-54,7], [-50,3],
        [-46,1], [-43,-2], [-37,-7],
        [-36,-13], [-40,-19], [-44,-23],
        [-48,-28], [-51,-31], [-55,-37],
        [-69,-55], [-74,-46], [-72,-37],
        [-76,-25], [-79,-11], [-82,-3]
    ],
    [
        [-13,50], [-12,44], [-9,36],
        [-5,36], [-1,39], [5,43],
        [9,46], [15,46], [20,48],
        [23,55], [13,61], [-2,60]
    ],
    [
        [-17,37], [-8,35], [2,36],
        [11,34], [23,30], [30,21],
        [29,10], [22,3], [19,-10],
        [13,-20], [18,-34], [11,-35],
        [2,-29], [-4,-18], [-9,-1],
        [-16,10]
    ]
];


function dibujarMapaLocal() {

    if (!sistema.canvas) {
        return;
    }

    const c = sistema.canvas;

    const W = c.canvas.width;
    const H = c.canvas.height;

    function proy(lat, lng) {
        return [
            ((lng + 135) / 160) * W,
            ((63 - lat) / 122) * H
        ];
    }

    c.clearRect(0, 0, W, H);

    const gradiente =
        c.createLinearGradient(0, 0, W, H);

    gradiente.addColorStop(0, "#0a2939");
    gradiente.addColorStop(1, "#08121f");

    c.fillStyle = gradiente;
    c.fillRect(0, 0, W, H);

    // Cuadrícula.

    c.lineWidth = 1;
    c.strokeStyle = "#2e536055";

    for (let lon = -120; lon <= 20; lon += 20) {

        const x = proy(0, lon)[0];

        c.beginPath();
        c.moveTo(x, 0);
        c.lineTo(x, H);
        c.stroke();
    }

    for (let lat = -40; lat <= 60; lat += 20) {

        const y = proy(lat, 0)[1];

        c.beginPath();
        c.moveTo(0, y);
        c.lineTo(W, y);
        c.stroke();
    }

    // Continentes ilustrativos.

    for (const masa of MASAS_TERRESTRES) {

        c.beginPath();

        masa.forEach(([lng, lat], i) => {

            const [x, y] = proy(lat, lng);

            if (i === 0) {
                c.moveTo(x, y);
            } else {
                c.lineTo(x, y);
            }
        });

        c.closePath();

        c.fillStyle = "#153949";
        c.strokeStyle = "#266073";
        c.lineWidth = 1.5;

        c.fill();
        c.stroke();
    }

    if (!sistema.red) {
        return;
    }

    // Conexiones del grafo.

    if ($("mostrar-red").checked) {

        for (const con of sistema.red.conexiones) {

            const a = sistema.red.aeropuertos.find(
                p => p.codigo === con.origen
            );

            const b = sistema.red.aeropuertos.find(
                p => p.codigo === con.destino
            );

            const [ax, ay] = proy(a.lat, a.lng);
            const [bx, by] = proy(b.lat, b.lng);

            c.beginPath();
            c.setLineDash([4, 9]);

            c.strokeStyle = "#2f89a077";
            c.lineWidth = 1;

            c.moveTo(ax, ay);
            c.lineTo(bx, by);
            c.stroke();
        }
    }

    c.setLineDash([]);

    // Ruta seleccionada.

    if (sistema.ruta) {

        const puntos = sistema.ruta.ruta.map(codigo => {

            const a = sistema.red.aeropuertos.find(
                p => p.codigo === codigo
            );

            return proy(a.lat, a.lng);
        });

        c.beginPath();

        puntos.forEach(([x, y], i) => {

            if (i === 0) {
                c.moveTo(x, y);
            } else {
                c.lineTo(x, y);
            }
        });

        c.strokeStyle = "#4ef0db55";
        c.lineWidth = 12;
        c.stroke();

        c.strokeStyle = "#56ead7";
        c.lineWidth = 3;
        c.stroke();
    }

    // Puntos de los aeropuertos.

    for (const a of sistema.red.aeropuertos) {

        const [x, y] = proy(a.lat, a.lng);

        const marcado =
            sistema.ruta?.ruta.includes(a.codigo);

        c.beginPath();

        c.arc(
            x,
            y,
            marcado ? 8 : 5,
            0,
            Math.PI * 2
        );

        c.fillStyle = marcado
            ? "#54eccb"
            : "#3cc6ef";

        c.fill();

        c.fillStyle = "#d8f5ff";
        c.font = "bold 15px sans-serif";

        c.fillText(
            a.codigo,
            x + 10,
            y + 22
        );
    }

    // Dibujar el avioncito.

    if (sistema.ruta) {

        const ruta = sistema.ruta.ruta;

        const a = sistema.red.aeropuertos.find(
            p => p.codigo === ruta[sistema.segmento]
        );

        const b = sistema.red.aeropuertos.find(
            p => p.codigo === ruta[sistema.segmento + 1]
        );

        const origen = proy(a.lat, a.lng);
        const destino = proy(b.lat, b.lng);

        const t = sistema.progreso;

        const x = origen[0] +
            (destino[0] - origen[0]) * t;

        const y = origen[1] +
            (destino[1] - origen[1]) * t;

        const angulo = Math.atan2(
            destino[0] - origen[0],
            -(destino[1] - origen[1])
        );

        c.save();

        c.translate(x, y);
        c.rotate(angulo);

        c.shadowColor = "#4eeaff";
        c.shadowBlur = 18;

        c.fillStyle = "#e8ffff";
        c.strokeStyle = "#237f91";
        c.lineWidth = 1;

        c.beginPath();

        c.moveTo(0, -22);
        c.lineTo(4, -8);
        c.lineTo(20, 4);
        c.lineTo(20, 9);
        c.lineTo(4, 4);
        c.lineTo(4, 16);
        c.lineTo(9, 20);
        c.lineTo(9, 23);
        c.lineTo(0, 21);
        c.lineTo(-9, 23);
        c.lineTo(-9, 20);
        c.lineTo(-4, 16);
        c.lineTo(-4, 4);
        c.lineTo(-20, 9);
        c.lineTo(-20, 4);
        c.lineTo(-4, -8);

        c.closePath();
        c.fill();
        c.stroke();
        c.restore();

        $("tramo-actual").textContent =
            `${a.codigo} → ${b.codigo}`;

        $("estado-animacion").textContent =
            `Tramo ${sistema.segmento + 1} de ` +
            `${sistema.ruta.tramos.length} - ` +
            `${Math.round(t * 100)}%`;
    }
}

// INICIALIZACIÓN DEL SISTEMA

async function iniciar() {

    inicializarMapa();

    // Botón para buscar ruta.

    $("form-vuelos").addEventListener(
        "submit",
        evento => {

            evento.preventDefault();
            buscarRuta();
        }
    );

    // Intercambiar origen y destino.

    $("intercambiar").addEventListener(
        "click",
        () => {

            const origen = $("origen").value;
            const destino = $("destino").value;

            $("origen").value = destino;
            $("destino").value = origen;
        }
    );

    // Mostrar u ocultar conexiones.

    $("mostrar-red").addEventListener(
        "change",
        evento => {

            if (!sistema.mapa) {
                dibujarMapaLocal();
                return;
            }

            if (evento.target.checked) {

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

    // Controles de reproducción.

    $("pausa").addEventListener(
        "click",
        pausarOContinuar
    );

    $("reiniciar").addEventListener(
        "click",
        iniciarVuelo
    );

    try {

        // Consultar la red del servidor Python.

        sistema.red = await pedirJSON("/api/red");

        llenarSelects();

        pintarRed();

        // Mostrar ruta inicial GUA - MAD.

        await buscarRuta();

    } catch (error) {

        setMensaje(
            "No se pudo iniciar AeroRoute: " +
            error.message,
            "error"
        );
    }
}

// EJECUTAR AL ABRIR LA PÁGINA

document.addEventListener(
    "DOMContentLoaded",
    iniciar
);


