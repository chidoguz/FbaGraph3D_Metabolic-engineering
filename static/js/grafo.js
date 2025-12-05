    /* ============================================================
    VARIABLES GLOBALES
    ============================================================ */
    let Graph = null;
    let datosActuales = null;
    let runId = null;

    let maxFluxGlobal = 1;
    let umbralUsuario = 0;
    let uiInicializada = false;

    let mostrarNombres = true;


    document.getElementById("btnRegresar").onclick = () => {
        window.location.replace("/");
    };

    /* ============================================================
    FUNCIONES DE APOYO
    ============================================================ */

    // Suavizado del slider
    function valorSuavizado(x) {
        return x * x;
    }

    function esInicio(n) {
        const id = n.id;
        const entradas = datosActuales.links.filter(l => l.target === id).length;
        const salidas  = datosActuales.links.filter(l => l.source === id).length;
        return entradas === 0 && salidas > 0;
    }

    function esFin(n) {
        const id = n.id;
        const entradas = datosActuales.links.filter(l => l.target === id).length;
        const salidas  = datosActuales.links.filter(l => l.source === id).length;
        return salidas === 0 && entradas > 0;
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
    INICIALIZAR UI
    ============================================================ */
function inicializarUI(subsistemas) {

    const sel = document.getElementById("selectorSubsistema");

    // Agregar opciones al select
    subsistemas.forEach(s => {
        const op = document.createElement("option");
        op.value = s;
        op.textContent = s;
        sel.appendChild(op);
    });

    // 🔥 Convierte el select en un COMBOBOX BUSCABLE
    const buscadorSubs = new Choices("#selectorSubsistema", {
        searchPlaceholderValue: "Search subsistem...",
        searchEnabled: true,
        searchResultLimit: 25,
        removeItemButton: false,
        shouldSort: true
    });

    // Listener para filtrar grafo
    sel.addEventListener("change", () => cargarDatosGrafo(sel.value));

    // Slider
    const slider = document.getElementById("sliderThreshold");
    const texto  = document.getElementById("valorThreshold");

    slider.addEventListener("input", function () {
        texto.textContent = parseFloat(this.value).toFixed(4);
    });

    slider.addEventListener("change", function () {
        umbralUsuario = parseFloat(this.value);
        cargarDatosGrafo(sel.value);
    });

    // Botón de nombres
    const btnNombres = document.getElementById("btnNombres");
    btnNombres.addEventListener("click", () => {
        mostrarNombres = !mostrarNombres;
        btnNombres.textContent = mostrarNombres ? "Nombres: ON" : "Nombres: OFF";
        cargarDatosGrafo(sel.value);
    });

    dibujarHeatmapLegend();
    uiInicializada = true;
}



    /* ============================================================
    ⭐ BOTÓN PARA MOSTRAR/OCULTAR PANEL
    ============================================================ */
    document.addEventListener("DOMContentLoaded", () => {
        const btnToggle = document.getElementById("btnToggleTools");
        const panel = document.getElementById("side-panel");  // ← PANEL LATERAL

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
    CARGAR GRAFO 3D
    ============================================================ */
    async function cargarDatosGrafo(filtroSubsistema = "") {

        try {
            runId = document.body.dataset.runId;
            if (!runId) return;

            let url = `/grafo_datos?run_id=${encodeURIComponent(runId)}`;
            if (filtroSubsistema)
                url += `&subsystem=${encodeURIComponent(filtroSubsistema)}`;

            const respuesta = await fetch(url);
            const datos = await respuesta.json();

            // 🔥 DETECTAR MODELO GIGANTE Y AVISAR USUARIO
            if (datos.modelo_gigante) {
                mostrarAvisoModeloGigante();
            }


            if (datos.error) throw datos.error;

            datosActuales = datos;
            maxFluxGlobal = datos.max_flux || 1;

            if (!uiInicializada) inicializarUI(datos.subsistemas);

            document.getElementById("legend-min").innerText = "0.0";
            document.getElementById("legend-max").innerText = maxFluxGlobal.toFixed(5);

            if (!Graph) {
                Graph = ForceGraph3D()(document.getElementById("graph"))
                    .showNavInfo(true)
                    .backgroundColor("#eef2f5")
                    .cameraPosition({ x: 80, y: 80, z: 80 }, null, 1500);
            }

            const umbral = valorSuavizado(umbralUsuario);
            const linkVisible = l => (l.flux || 0) >= umbral * maxFluxGlobal;

            if (datos.modelo_gigante) {
                document.getElementById("info-box").innerHTML =
                    "<em>⚠ Grafo simplificado: solo reacciones activas visibles.</em>";
            }

            Graph
                .graphData(datosActuales)

                .nodeVisibility(n =>
                    datosActuales.links.some(l =>
                        (l.source === n.id || l.target === n.id) && linkVisible(l)
                    )
                )
                .nodeRelSize(6)
                .nodeColor(n =>
                    n.group === "metabolite" ? "#00cc44" : n.color
                )
                .nodeThreeObjectExtend(true)
                .nodeThreeObject(n =>
                    mostrarNombres ? crearTextoNombre(n.name) : null    
                )

                .linkVisibility(l => linkVisible(l))
                .linkColor(l => l.color)
                .linkWidth(l => 1.5 + 6 * (l.flux / maxFluxGlobal))
                .linkDirectionalArrowLength(3.8)
                .linkDirectionalArrowRelPos(0.9)
                .linkDirectionalArrowColor(l => l.color)

                .linkDirectionalParticles(l =>
                    linkVisible(l) ? Math.round(1 + 4 * (l.flux / maxFluxGlobal)) : 0
                )
                .linkDirectionalParticleWidth(2.5)
                .linkDirectionalParticleSpeed(l =>
                    linkVisible(l) ? 0.002 + 0.03 * (l.flux / maxFluxGlobal) : 0
                )

                .onNodeClick(n => {

                    const tipoNodo = n.group === "metabolite"
                        ? "Metabolite"
                        : "Rxn";

                    const enlaces = Graph.graphData().links
                        .filter(l => l.source.id === n.id || l.target.id === n.id)
                        .map(l => {

                            const conectado = (l.source.id === n.id)
                                ? l.target
                                : l.source;

                            const tipoCon = conectado.group === "reaction"
                                ? "Rxn"
                                : "Metabolite";

                            const flujoReal = l.flux_signed;
                            const sentido = flujoReal >= 0 ? "forward" : "reversa";

                            const esEntrada = l.coeff < 0;
                            const esSalida = l.coeff > 0;

                            return {
                                nombre: conectado.id,
                                tipo: tipoCon,
                                flujoReal,
                                sentido,
                                absFlux: Math.abs(flujoReal),
                                esEntrada,
                                esSalida,
                                coeff: l.coeff,
                                color: l.color   // 🔥 AGREGADO: color del heatmap
                            };
                        });

                    const top = enlaces.sort((a, b) => b.absFlux - a.absFlux).slice(0, 12);

                    const entradas = top.filter(e => e.esEntrada);
                    const salidas = top.filter(e => e.esSalida);

                    const formatear = arr =>
                        arr.length === 0
                            ? "  (ninguna)"
                            : arr.map(e =>
                                `• ${e.nombre} (${e.tipo})<br>` +
                                `&nbsp;&nbsp;coef: ${e.coeff < 0 ? "-" : "+"}<br>` +
                                `&nbsp;&nbsp;flux: <span style="color:${e.color}; font-weight:600;">${e.flujoReal.toFixed(5)}</span> ${e.sentido}<br><br>`
                            ).join("");

                    const texto =
                    `<strong>🔍 Node selection:</strong><br>
                    ${n.name}<br>
                    Tipo: ${tipoNodo}<br><br>

                    <strong>➡ Inputs</strong><br>
                    ${formatear(entradas)}

                    <strong>⬅ Outputs:</strong><br>
                    ${formatear(salidas)}
                    `;

                    document.getElementById("info-box").innerHTML = texto;
                });

        } catch (err) {
            console.error("❌ Error cargando grafo:", err);
            document.getElementById("info-box").innerHTML =
                "❗ Error cargando grafo.";
        }
    }

    /* ============================================================
   AVISO PARA MODELOS GIGANTES
    ============================================================ */
    function mostrarAvisoModeloGigante() {

        let aviso = document.getElementById("aviso-gigante");

        if (!aviso) {
            aviso = document.createElement("div");
            aviso.id = "aviso-gigante";
            aviso.style.position = "absolute";
            aviso.style.top = "15px";
            aviso.style.right = "20px";
            aviso.style.zIndex = "9999";
            aviso.style.background = "rgba(27,163,156,0.95)";
            aviso.style.color = "white";
            aviso.style.padding = "12px 18px";
            aviso.style.borderRadius = "10px";
            aviso.style.fontSize = "14px";
            aviso.style.boxShadow = "0 4px 12px rgba(0,0,0,0.25)";
            aviso.style.maxWidth = "250px";
            aviso.style.textAlign = "left";
            aviso.style.fontFamily = "Poppins";

            aviso.innerHTML = `
                <strong>⚠ Bigg model detected</strong><br>
                Se muestran <b>Only active reactions will be displayed.</b> para optimizar rendimiento.
            `;
            
            document.body.appendChild(aviso);

            // desaparecer después de 6s
            setTimeout(() => aviso.remove(), 6000);
        }
    }



    /* ============================================================
    AUTO-INICIO
    ============================================================ */
    cargarDatosGrafo();
