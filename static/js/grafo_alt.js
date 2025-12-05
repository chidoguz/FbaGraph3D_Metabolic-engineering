/* ============================================================
   VARIABLES GLOBALES
============================================================ */
let Graph = null;
let datosActuales = null;
let runId = null;

let maxActividadGlobal = 1;
let umbralUsuario = 0;
let uiInicializada = false;

// Para acceso rápido por id
let nodosPorId = {};
let matrizCorrelacion = {};
let listaSubsistemas = [];


/* ============================================================
   FUNCIONES DE APOYO
============================================================ */

    document.getElementById("btnRegresar").onclick = () => {
        window.location.replace("/");
    };

// Suavizado del slider (para que la sensibilidad al principio sea mayor)
function valorSuavizado(x) {
    return x * x;
}

/* ============================================================
   ETIQUETAS 3D (solo nombre)
============================================================ */
function crearTextoNombre(nombre) {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    ctx.font = "20px Poppins";
    const padding = 8;
    const textWidth = ctx.measureText(nombre).width;

    canvas.width = textWidth + padding * 2;
    canvas.height = 34;

    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "#111";
    ctx.font = "20px Poppins";
    ctx.fillText(nombre, padding, 24);

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthTest: false
    });

    const sprite = new THREE.Sprite(material);
    sprite.scale.set(10, 5, 1);
    sprite.position.set(0, 14, 0);

    return sprite;
}


/* ============================================================
   HEATMAP LEGEND
============================================================ */
function dibujarHeatmapLegend() {
    const canvas = document.getElementById("legendCanvas");
    if (!canvas) return;

    const ctx = canvas.getContext("2d");

    const grad = ctx.createLinearGradient(0, 0, canvas.width, 0);
    grad.addColorStop(0.00, "#0d0887");
    grad.addColorStop(0.15, "#6a00a8");
    grad.addColorStop(0.35, "#b12a90");
    grad.addColorStop(0.55, "#e16462");
    grad.addColorStop(0.75, "#fca636");
    grad.addColorStop(1.00, "#f0f921");

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}


/* ============================================================
   MATRIZ SUBSISTEMA × SUBSISTEMA (PLOTLY)
============================================================ */
function dibujarMatrizSubsistemas(subsistemas, matrizDict) {

    const cont = document.getElementById("matrixPlot");
    if (!cont) return;

    const n = subsistemas.length;

    // --------- 1) Construir matriz Z ORIGINAL ----------
    const z_original = subsistemas.map(row =>
        subsistemas.map(col => {
            const colObj = matrizDict[col] || {};
            const val = colObj[row];
            return (val === undefined || val === null) ? 0 : val;
        })
    );

    // --------- 2) Detectar outliers (percentil 99) ----------
    let todos = [];
    z_original.forEach(f => f.forEach(v => todos.push(v)));

    todos = todos.filter(v => v != null);  // seguridad
    const sorted = [...todos].sort((a,b) => a-b);
    const p99 = sorted[Math.floor(sorted.length * 0.99)] || 0;

    const limite = Math.max(10, p99);  // nunca dejar un límite muy bajo

    // --------- 3) Construir matriz CLIPPEADA ----------
    const z_clip = z_original.map(fila =>
        fila.map(v => Math.min(v, limite))
    );

    // --------- 4) Anotaciones solo si n <= 25 ----------
    const ponerAnotaciones = n <= 25;
    let annotations = [];

    if (ponerAnotaciones) {
        for (let i = 0; i < n; i++) {
            for (let j = 0; j < n; j++) {
                const real = z_original[i][j];
                if (real === 0) continue;

                annotations.push({
                    x: subsistemas[j],
                    y: subsistemas[i],
                    text: String(real),     // ← valor REAL, no el recortado
                    font: { color: "white", size: 12 },
                    showarrow: false
                });
            }
        }
    }

    // --------- 5) Crear heatmap con z CLIPPEADA ----------
    const data = [{
        z: z_clip,
        x: subsistemas,
        y: subsistemas,
        type: "heatmap",
        colorscale: "Viridis",
        showscale: true,
        text: z_original.map(fila => fila.map(v => v.toString())),
        hoverinfo: "text"  // ← hover muestra valores reales
    }];

    // --------- 6) Tamaños dinámicos ----------
    const filas = subsistemas.length;
    const altoRecomendado = Math.max(600, filas * 30);
    const anchoRecomendado = Math.max(900, n * (n < 30 ? 40 : 30));  
    // si es pequeño → más ancho; si es grande → menos ancho

    // --------- 7) Layout ----------
    const layout = {
        height: altoRecomendado,
        width: anchoRecomendado,
        margin: { t: 20, l: 280, r: 60, b: 250 },

        xaxis: { 
            tickangle: 90,
            tickfont: { size: (n < 30 ? 12 : 10) },
            automargin: true
        },

        yaxis: { 
            automargin: true,
            tickfont: { size: (n < 30 ? 12 : 10) }
        },

        annotations: annotations,
        title: { text: "", font: { size: 0 } }
    };

    Plotly.newPlot(cont, data, layout, { responsive: false });
}




/* ============================================================
   INICIALIZAR UI
============================================================ */
function inicializarUI(datos) {

    // Lista de subsistemas
    const listaDiv = document.getElementById("subsistemaList");
    if (listaDiv) {
        listaDiv.innerHTML = datos.subsistemas.map(s =>
            `<div class="subs-item">${s}</div>`
        ).join("");
    }

    // Slider de umbral
    const slider = document.getElementById("sliderThreshold");
    const texto  = document.getElementById("valorThreshold");

    if (slider && texto) {
        texto.textContent = parseFloat(slider.value).toFixed(4);

        slider.addEventListener("input", function () {
            texto.textContent = parseFloat(this.value).toFixed(4);
        });

        slider.addEventListener("change", function () {
            umbralUsuario = parseFloat(this.value);
            actualizarVisibilidad();
        });
    }

    // Leyenda heatmap
    dibujarHeatmapLegend();

    uiInicializada = true;
}


/* ============================================================
   BOTÓN PARA MOSTRAR/OCULTAR PANEL IZQUIERDO
============================================================ */
document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("btnDescargarMatrizAlt").addEventListener("click", descargarMatrizAlt);
    const btnToggle = document.getElementById("btnToggleTools");
    const panel = document.getElementById("side-panel");

    if (btnToggle && panel) {
        btnToggle.addEventListener("click", () => {
            const estaOculto = panel.style.display === "none";
            panel.style.display = estaOculto ? "block" : "none";

            btnToggle.textContent = estaOculto
                ? "🧰 Ocultar herramientas"
                : "🧰 Mostrar herramientas";
        });
    }
});


/* ============================================================
   CÁLCULOS PARA VISIBILIDAD Y ESTILO
============================================================ */

// Actividad asociada a un enlace (usamos el metabolito)
function actividadEnlace(l) {
    const src = typeof l.source === "object" ? l.source : nodosPorId[l.source];
    const trg = typeof l.target === "object" ? l.target : nodosPorId[l.target];

    const esMetabSrc = src && src.type === "metabolite";
    const esMetabTrg = trg && trg.type === "metabolite";

    let act = 0;
    if (esMetabSrc) {
        act = src.actividad_max || 0;
    } else if (esMetabTrg) {
        act = trg.actividad_max || 0;
    }
    return act;
}


// Actualizar visibilidad de nodos y enlaces en función del umbral
function actualizarVisibilidad() {
    if (!Graph || !datosActuales) return;

    const umbral = valorSuavizado(umbralUsuario);

    // Actividad normalizada de un nodo metabolito
    const actividadNormNodo = (n) => {
        if (n.type !== "metabolite") return 1.0;  // subsistema siempre "activo"
        const act = n.actividad_max || 0;
        if (maxActividadGlobal <= 0) return 0;
        return act / maxActividadGlobal;
    };

    const linkVisible = (l) => {
        const act = actividadEnlace(l);
        if (maxActividadGlobal <= 0) return false;
        const norm = act / maxActividadGlobal;
        return norm >= umbral;
    };

    Graph
        // NODOS
        .nodeVisibility(n => {
            if (n.type === "metabolite") {
                return actividadNormNodo(n) >= umbral;
            } else if (n.type === "subsystem") {
                // Visible si tiene al menos un enlace visible
                return datosActuales.links.some(l => {
                    const srcId = (typeof l.source === "object" ? l.source.id : l.source);
                    const trgId = (typeof l.target === "object" ? l.target.id : l.target);
                    if (srcId !== n.id && trgId !== n.id) return false;
                    return linkVisible(l);
                });
            }
            return true;
        })

        // ENLACES
        .linkVisibility(l => linkVisible(l))

        // Estilo de los enlaces (grosor + partículas) en base a actividad
        .linkWidth(l => {
            const act = actividadEnlace(l);
            if (maxActividadGlobal <= 0) return 1;
            const norm = act / maxActividadGlobal;
            return  1.5 * norm;
        })
        .linkDirectionalParticles(l => {
            const act = actividadEnlace(l);
            if (maxActividadGlobal <= 0) return 0;
            const norm = act / maxActividadGlobal;
            return Math.round(1 + 3 * norm);
        })
        .linkDirectionalParticleSpeed(l => {
            const act = actividadEnlace(l);
            if (maxActividadGlobal <= 0) return 0.002;
            const norm = act / maxActividadGlobal;
            return 0.002 + 0.03 * norm;
        });
}


/* ============================================================
   CARGAR GRAFO ALT (METABOLITOS + SUBSISTEMAS)
============================================================ */
async function cargarDatosGrafoAlt() {
    try {
        runId = document.body.dataset.runId;
        if (!runId) return;

        let url = `/grafo_datos_alt?run_id=${encodeURIComponent(runId)}`;

        const respuesta = await fetch(url);
        const datos = await respuesta.json();

        if (datos.error) throw datos.error;

        // Guardar datos globales
        datosActuales = {
            nodes: datos.nodes,
            links: datos.links,
            metabolitos_filtrados: datos.metabolitos_filtrados
        };
        matrizCorrelacion = datos.matriz_correlacion || {};
        listaSubsistemas = datos.subsistemas || [];

        // Mapa id -> nodo
        nodosPorId = {};
        datos.nodes.forEach(n => {
            nodosPorId[n.id] = n;
        });

        // Calcular maxActividadGlobal usando solo metabolitos
        const actividades = datos.nodes
            .filter(n => n.type === "metabolite")
            .map(n => n.actividad_max || 0);

        maxActividadGlobal = actividades.length > 0 ? Math.max(...actividades) : 1;

        // Actualizar leyenda
        const legendMin = document.getElementById("legend-min");
        const legendMax = document.getElementById("legend-max");
        if (legendMin) legendMin.innerText = "0.0";
        if (legendMax) legendMax.innerText = maxActividadGlobal.toFixed(5);

        // Inicializar UI una sola vez
        if (!uiInicializada) {
            inicializarUI(datos);
            dibujarMatrizSubsistemas(listaSubsistemas, matrizCorrelacion);
        }

        // Crear grafo si no existe
        if (!Graph) {
            Graph = ForceGraph3D()(document.getElementById("graph"))
                .showNavInfo(true)
                .backgroundColor("#eef2f5")
                .cameraPosition({ x: 80, y: 80, z: 80 }, null, 1500);

            // 🔥 Fuerzas extra: más separación entre nodos
            if (typeof d3 !== "undefined") {
                Graph.d3Force("charge", d3.forceManyBody().strength(-2000));
                Graph.d3Force("link", d3.forceLink().distance(1000));
                Graph.d3Force("center", d3.forceCenter(0, 0, 0));
            }
        }

        // Asignar datos al grafo
        Graph
            .graphData(datosActuales)

            // NODOS
            .nodeRelSize(3)
            .nodeColor(n => n.color || "#888888")
            .nodeThreeObjectExtend(true)
            .nodeThreeObject(n => crearTextoNombre(n.id))

            // ENLACES — color heredado del metabolito
            .linkColor(l => {
                const src = typeof l.source === "object" ? l.source : nodosPorId[l.source];
                const trg = typeof l.target === "object" ? l.target : nodosPorId[l.target];

                if (src && src.type === "metabolite") return src.color;
                if (trg && trg.type === "metabolite") return trg.color;
                return "#999999";
            })
            .linkDirectionalArrowLength(0)  // sin flechas

            // TOOLTIP / INFO BOX
            .onNodeClick(n => {
                mostrarInfoNodo(n);
            });

        // Aplicar visibilidad inicial
        actualizarVisibilidad();

    } catch (err) {
        console.error("❌ Error cargando grafo ALT:", err);
        const info = document.getElementById("info-box");
        if (info) info.innerHTML = "❗ Error cargando grafo alternativo.";
    }
}


/* ============================================================
   TOOLTIP AVANZADO
============================================================ */
function mostrarInfoNodo(n) {
    const infoBox = document.getElementById("info-box");
    if (!infoBox) return;

   if (n.type === "metabolite") {
    const subs = n.subsistemas || [];
    const actMax = n.actividad_max || 0;
    const actSum = n.actividad_suma || 0;
    const actProm = n.actividad_promedio || 0;

    const reacciones = n.reacciones || [];

    const reaccionesHTML = reacciones.length
        ? reacciones
            .sort((a, b) => Math.abs(b.flux) - Math.abs(a.flux)) // ordenar por |flujo|
            .map(r => `• ${r.id} — flujo: ${r.flux.toFixed(5)}`)
            .join("<br>")
        : "<span style='color:#94a3b8'>Sin reacciones activas registradas</span>";

    const html = `
<strong>🔬 Metabolito:</strong><br>
<span style="font-size:15px; font-weight:700;">${n.id}</span><br><br>

<strong>Subsistemas asociados:</strong><br>
${subs.length ? subs.map(s => `• ${s}`).join("<br>") : "<span style='color:#94a3b8'>Ninguno</span>"}<br><br>

<strong>Actividad metabólica (por flujos de reacción):</strong><br>
&nbsp;&nbsp;Máximo: ${actMax.toFixed(5)}<br>
&nbsp;&nbsp;Suma: ${actSum.toFixed(5)}<br>
&nbsp;&nbsp;Promedio: ${actProm.toFixed(5)}<br><br>

<strong>Reacciones donde participa:</strong><br>
${reaccionesHTML}
`;
    infoBox.innerHTML = html;
}
 else if (n.type === "subsystem") {
        const subsId = n.id;

        const conectados = datosActuales.links
            .map(l => {
                const src = typeof l.source === "object" ? l.source.id : l.source;
                const trg = typeof l.target === "object" ? l.target.id : l.target;
                if (src === subsId && nodosPorId[trg] && nodosPorId[trg].type === "metabolite") {
                    return trg;
                }
                if (trg === subsId && nodosPorId[src] && nodosPorId[src].type === "metabolite") {
                    return src;
                }
                return null;
            })
            .filter(x => x !== null);

        const unicos = [...new Set(conectados)];

        const fila = {};
        if (matrizCorrelacion && Object.keys(matrizCorrelacion).length > 0) {
            listaSubsistemas.forEach(col => {
                const colObj = matrizCorrelacion[col] || {};
                const val = colObj[subsId];
                fila[col] = (val === undefined || val === null) ? 0 : val;
            });
        }

        const correlHTML = listaSubsistemas
            .map(s => `${s}: ${fila[s] !== undefined ? fila[s] : 0}`)
            .join("<br>");

        const html = `
<strong>🧩 Subsistem:</strong><br>
<span style="font-size:15px; font-weight:700;">${subsId}</span><br><br>

<strong>Connected metabolites:</strong><br>
${unicos.length
    ? unicos.map(m => `• ${m}`).join("<br>")
    : "<span style='color:#94a3b8'>Ninguno</span>"}<br><br>

<strong>Correlation with other subsystems:</strong><br>
${correlHTML}
`;
        infoBox.innerHTML = html;

    } else {
        infoBox.innerHTML = `
<strong>Nodo:</strong> ${n.id}<br>
Tipo desconocido.
`;
    }
}


/* ============================================================
   PANEL MATRIZ EXPANDIBLE
============================================================ */

const matrixPanel = document.getElementById("matrix-panel");
const matrixBtn = document.getElementById("toggleMatrixBtn");
const matrixShowBtn = document.getElementById("matrixShowBtn");
const matrixResizer = document.getElementById("matrix-resizer");

/* BOTÓN PARA COLAPSAR PANEL */
matrixBtn.addEventListener("click", () => {
    matrixPanel.classList.add("colapsado");

    // Ocultar el botón del header
    matrixBtn.style.display = "none";

    // Mostrar el botón flotante
    matrixShowBtn.style.display = "block";
});

/* BOTÓN PARA VOLVER A MOSTRAR PANEL */
matrixShowBtn.addEventListener("click", () => {
    matrixPanel.classList.remove("colapsado");

    // Mostrar el botón del header otra vez
    matrixBtn.style.display = "block";

    // Ocultar el botón flotante
    matrixShowBtn.style.display = "none";
});

/* RESIZE DEL PANEL */
matrixResizer.addEventListener("mousedown", initResize);

function initResize(e) {
    document.addEventListener("mousemove", resizePanel);
    document.addEventListener("mouseup", stopResize);
}

function resizePanel(e) {
    const nuevoAncho = window.innerWidth - e.clientX;
    if (nuevoAncho >= 350 && nuevoAncho <= 900) {
        matrixPanel.style.width = nuevoAncho + "px";
    }
}

function stopResize(e) {
    document.removeEventListener("mousemove", resizePanel);
    document.removeEventListener("mouseup", stopResize);
}


function descargarMatrizAlt() {

    if (!matrizCorrelacion || !listaSubsistemas || !datosActuales) {
        alert("No hay datos cargados del grafo ALT.");
        return;
    }

fetch("/descargar_matriz_alt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
        matriz_correlacion: matrizCorrelacion,
        metabolitos_filtrados: datosActuales.metabolitos_filtrados, // ahora sí existe
        subsistemas: listaSubsistemas
    })
})

    .then(resp => resp.blob())
    .then(blob => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "matriz_subsistemas_alt.xlsx";
        a.click();
        window.URL.revokeObjectURL(url);
    })
    .catch(err => {
        console.error("❌ Error descargando matriz ALT:", err);
        alert("Error al generar el archivo.");
    });
}


/* ============================================================
   AUTO-INICIO
============================================================ */
cargarDatosGrafoAlt();
