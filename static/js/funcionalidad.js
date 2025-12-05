/* ============================================================
   GLOBAL VARIABLES
   ============================================================ */
let filaSeleccionada = null;
let flujosCompletos = {};
let ultimaRestriccionDetalle = [];
let ultimaBiomasa = null;
let ultimoATP = null;
let ultimoFlujoTotal = null;
let ultimasActividades = null;
let ultimoValorObjetivo = null;
// 🔥 NEW: run_id for 3D graph
let ultimoRunId = null;


/* ============================================================
   GLOBAL LOADING OVERLAY
   ============================================================ */
function mostrarCarga(msg = "Processing...") {
  const overlay = document.getElementById("overlayCarga");
  const mensaje = document.getElementById("mensajeCarga");

  if (mensaje) mensaje.textContent = msg;
  if (overlay) overlay.style.display = "flex";
}


function ocultarCarga() {
  const overlay = document.getElementById("overlayCarga");
  if (overlay) overlay.style.display = "none";
}


/* ============================================================
   INITIALIZATION
   ============================================================ */
document.addEventListener("DOMContentLoaded", () => {
  const modeloFile = document.getElementById("modeloFile");
  if (modeloFile) {
    modeloFile.addEventListener("change", function () {
      const fileLabel = document.getElementById("fileName");
      if (this.files.length > 0) {
        fileLabel.textContent = "File: " + this.files[0].name;
      } else {
        fileLabel.textContent = "No file selected";
      }
      enviarModelo();
    });
  }

  // Convert selects into searchable comboboxes
  window.selectObjetivoChoices = new Choices("#rxns_s", {
    searchPlaceholderValue: "Search reaction...",
    removeItemButton: false,
    shouldSort: false,
    searchResultLimit: 20
  });

  window.selectRestrChoices = new Choices("#rxns_res", {
    searchPlaceholderValue: "Search reaction...",
    removeItemButton: false,
    shouldSort: false,
    searchResultLimit: 20
  });

  const selectLimites = new Choices("#limites", {
    removeItemButton: false,
    shouldSort: false,
    searchEnabled: false // this one does not need a search box
  });

  const btnCalcular = document.getElementById("btnCalcular");
  if (btnCalcular) {
    btnCalcular.addEventListener("click", ejecutarFBA);
  }

  const btnDescargarExcel = document.getElementById("btnDescargarExcel");
  if (btnDescargarExcel) {
    btnDescargarExcel.addEventListener("click", descargarExcel);
  }

  // 🔥 NEW: Graph button
  const btnGrafo = document.getElementById("btnGrafo");
  if (btnGrafo) {
    btnGrafo.addEventListener("click", () => {
      if (!ultimoRunId) {
        alert("Run an FBA first to see the graph.");
        return;
      }
      window.location.href = `/grafo?run_id=${encodeURIComponent(ultimoRunId)}`;
    });
  }

  const btnGrafoAlt = document.getElementById("btnGrafoAlt");
  if (btnGrafoAlt) {
    btnGrafoAlt.addEventListener("click", () => {
      if (!ultimoRunId) {
        alert("Run an FBA first to see the graph.");
        return;
      }
      window.location.href = `/grafo_alt?run_id=${encodeURIComponent(ultimoRunId)}`;
    });
  }
});


/* ============================================================
   RUN FBA — SEND OBJECTIVE + CONSTRAINTS
   ============================================================ */
function ejecutarFBA() {
  mostrarCarga("Running FBA, please wait...");

  const funcionObjetivo = document.getElementById("rxns_s").value;
  const restricciones = obtenerRestriccionesTabla();

  fetch("/solicitud", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      funcion_objetivo: funcionObjetivo,
      restricciones: restricciones
    })
  })
    .then((res) => res.json())
    .then((data) => {
      ocultarCarga(); // ALWAYS at the end

      if (data.error) {
        alert("❌ Model error: " + data.error);
        return;
      }

      // === 1) Plot fluxes ===
      Plotly.newPlot("grafica", data.data, data.layout, { responsive: true });

      // === 2) Gauge ===
      dibujarGauge(data.objective_value);

      // === 3) Warnings ===
      mostrarWarnings(data.warnings);

      // === 4) Update table according to backend ===
      actualizarTablaConBackend(data.restricciones);

      // === 5) KPIs ===
      actualizarKPIs(data);

      // === 6) Store complete data for Excel ===
      flujosCompletos = data.flujos_completos;
      ultimaRestriccionDetalle = data.restricciones_detalle || [];
      ultimaBiomasa = data.kpi_biomasa;
      ultimoATP = data.kpi_atp;
      ultimoFlujoTotal = data.kpi_flujo_total;
      ultimasActividades = data.kpi_activas;
      ultimoValorObjetivo = data.objective_value;

      // ====================================================
      // 🔥 NEW: Save run_id and enable graph buttons
      // ====================================================
      ultimoRunId = data.run_id || null;

      const btnGrafo = document.getElementById("btnGrafo");
      if (btnGrafo && ultimoRunId) {
        btnGrafo.disabled = false;
      }

      const btnGrafoAlt = document.getElementById("btnGrafoAlt");
      if (btnGrafoAlt && ultimoRunId) {
        btnGrafoAlt.disabled = false;
      }
    });
}


/* ============================================================
   SEND MODEL
   ============================================================ */
function enviarModelo() {
  const fileInput = document.getElementById("modeloFile");
  const archivo = fileInput.files[0];

  if (!archivo) {
    alert("Select a file first.");
    return;
  }

  const formData = new FormData();
  formData.append("archivo_modelo", archivo);

  fetch("/cargar_modelo", {
    method: "POST",
    body: formData
  })
    .then((res) => res.json())
    .then((data) => {
      if (data.error) {
        alert("❌ Error: " + data.error);
        return;
      }

      // Update reactions comboboxes
      const selectObj = document.getElementById("rxns_s");
      const selectRes = document.getElementById("rxns_res");

      selectObj.innerHTML = "";
      selectRes.innerHTML = "";

      data.reacciones.forEach((r) => {
        const optionHtml = `<option value="${r}">${r}</option>`;
        selectObj.insertAdjacentHTML("beforeend", optionHtml);
        selectRes.insertAdjacentHTML("beforeend", optionHtml);
      });

      // Re-enable Choices.js
      if (window.selectObjetivoChoices) window.selectObjetivoChoices.destroy();
      if (window.selectRestrChoices) window.selectRestrChoices.destroy();

      window.selectObjetivoChoices = new Choices("#rxns_s", {
        searchEnabled: true
      });
      window.selectRestrChoices = new Choices("#rxns_res", {
        searchEnabled: true
      });

      // Store current model name
      window.modeloActual = data.nombre_modelo;
    });
}


/* ============================================================
   DOWNLOAD EXCEL — SEND EVERYTHING TO BACKEND
   ============================================================ */
function descargarExcel() {
  if (!flujosCompletos) {
    alert("Run an FBA first to generate results.");
    return;
  }

  fetch("/descargar_excel", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      flujos_completos: flujosCompletos,
      funcion_objetivo: document.getElementById("rxns_s").value,
      restricciones: obtenerRestriccionesTabla(),
      restricciones_detalle: ultimaRestriccionDetalle,
      objective_value: ultimoValorObjetivo,
      kpi_biomasa: ultimaBiomasa,
      kpi_atp: ultimoATP,
      kpi_flujo_total: ultimoFlujoTotal,
      kpi_activas: ultimasActividades
    })
  })
    .then((res) => res.blob())
    .then((blob) => {
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "fba_result.xlsx";
      a.click();
      window.URL.revokeObjectURL(url);
    });
}


/* ============================================================
   SHOW BACKEND WARNINGS
   ============================================================ */
function mostrarWarnings(lista) {
  const box = document.getElementById("warnings_box");
  if (!box) return;

  if (!lista || lista.length === 0) {
    box.innerHTML = "";
    box.style.display = "none";
    return;
  }

  box.innerHTML = lista
    .map((w) => `<div class="alert-item">${w}</div>`)
    .join("");
  box.style.display = "block";
}


/* ============================================================
   DRAW GAUGE
   ============================================================ */
function dibujarGauge(valor) {
  const maxRange = Math.max(1, valor * 1.3);

  const data = [
    {
      type: "indicator",
      mode: "gauge+number",
      value: valor,
      title: {
        text: "Objective value (FBA)",
        font: { size: 22, color: "#334155" }
      },
      number: {
        font: { size: 46, color: "#334155" }
      },
      gauge: {
        axis: { range: [0, maxRange], tickcolor: "#94A3B8" },
        bgcolor: "rgba(0,0,0,0)",
        steps: [
          { range: [0, maxRange], color: "rgba(148,163,184,0.20)" },
          { range: [0, valor], color: "#CFF7F2" }
        ],
        bar: { color: "#1BA39C", thickness: 0.3 },
        borderwidth: 0
      }
    }
  ];

  const layout = {
    margin: { t: 40, r: 25, l: 25, b: 10 },
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    font: { family: "Poppins", color: "#334155" }
  };

  Plotly.newPlot("objective_gauge", data, layout, { responsive: true });
}


/* ============================================================
   UPDATE KPIs
   ============================================================ */
function actualizarKPIs(data) {
  // Total flux
  const kFT = document.getElementById("kpi_flujo_total");
  if (kFT)
    kFT.textContent =
      data.kpi_flujo_total !== undefined ? data.kpi_flujo_total.toFixed(2) : "—";

  // Activity (active / inactive)
  const kAct = document.getElementById("kpi_activas");
  if (kAct) {
    if (data.kpi_activas)
      kAct.textContent = `${data.kpi_activas.activas} / ${data.kpi_activas.inactivas}`;
    else kAct.textContent = "—";
  }

  // Applied constraints
  const kR = document.getElementById("kpi_restricciones");
  if (kR)
    kR.textContent = data.restricciones ? data.restricciones.length : "—";

  // Metabolic state (only if element exists)
  if (document.getElementById("kpi_estado"))
    actualizarEstadoMetabolico(data.objective_value);
}


/* ============================================================
   METABOLIC STATE
   ============================================================ */
function actualizarEstadoMetabolico(objValue) {
  const box = document.getElementById("kpi_estado");
  if (!box) return;

  if (objValue <= 0.000001) {
    box.textContent = "🔴 Possible metabolic blockage (objective = 0)";
    box.style.background = "#FFEBEE";
    box.style.color = "#B71C1C";
  } else {
    box.textContent = "🟢 Metabolic network working correctly";
    box.style.background = "#E8F5E9";
    box.style.color = "#1B5E20";
  }
}


/* ============================================================
   READ CONSTRAINTS TABLE
   ============================================================ */
function obtenerRestriccionesTabla() {
  const tablaBody = document.getElementById("tabla_body");
  const restricciones = [];

  for (let row of tablaBody.rows) {
    restricciones.push({
      reaccion: row.cells[0].textContent,
      limite: row.cells[1].textContent,
      valor: parseFloat(row.cells[2].textContent)
    });
  }

  return restricciones;
}


/* ============================================================
   UPDATE TABLE FROM BACKEND
   ============================================================ */
function actualizarTablaConBackend(listaBackend) {
  const tablaBody = document.getElementById("tabla_body");

  for (let restriccion of listaBackend) {
    const { reaccion, limite, valor } = restriccion;
    let filaEncontrada = null;

    for (let row of tablaBody.rows) {
      if (
        row.cells[0].textContent === reaccion &&
        row.cells[1].textContent === limite
      ) {
        filaEncontrada = row;
        break;
      }
    }

    if (filaEncontrada) {
      filaEncontrada.cells[2].textContent = valor;
    } else {
      const fila = tablaBody.insertRow();
      fila.insertCell(0).textContent = reaccion;
      fila.insertCell(1).textContent = limite;
      fila.insertCell(2).textContent = valor;

      fila.onclick = () => {
        if (filaSeleccionada) filaSeleccionada.classList.remove("selected");
        filaSeleccionada = fila;
        fila.classList.add("selected");
      };
    }
  }
}


/* ============================================================
   ADD ROW MANUALLY (UI)
   ============================================================ */
function agregarFila() {
  const reaccion = document.getElementById("rxns_res").value;
  const limite = document.getElementById("limites").value;
  const valor = document.getElementById("numero").value;

  const tablaBody = document.getElementById("tabla_body");
  let filaEncontrada = null;

  for (let row of tablaBody.rows) {
    if (
      row.cells[0].textContent === reaccion &&
      row.cells[1].textContent === limite
    ) {
      filaEncontrada = row;
      break;
    }
  }

  if (filaEncontrada) {
    filaEncontrada.cells[2].textContent = valor;
    return;
  }

  const fila = tablaBody.insertRow();
  fila.insertCell(0).textContent = reaccion;
  fila.insertCell(1).textContent = limite;
  fila.insertCell(2).textContent = valor;

  fila.onclick = () => {
    if (filaSeleccionada) filaSeleccionada.classList.remove("selected");
    filaSeleccionada = fila;
    fila.classList.add("selected");
  };

  document.getElementById("numero").value = "0";
}


/* ============================================================
   DELETE ROW
   ============================================================ */
function borrarFila() {
  if (!filaSeleccionada) {
    alert("Select a row first.");
    return;
  }
  filaSeleccionada.remove();
  filaSeleccionada = null;
}


/* ============================================================
   DELETE ALL ROWS
   ============================================================ */
function borrarTodas() {
  document.getElementById("tabla_body").innerHTML = "";
  filaSeleccionada = null;
}


/* ============================================================
   LOAD MODEL FROM BUTTON (SECOND LISTENER)
   ============================================================ */
document.addEventListener("DOMContentLoaded", () => {
  const inputModelo = document.getElementById("modeloFile");
  if (!inputModelo) return;

  inputModelo.addEventListener("change", async () => {
    const archivo = inputModelo.files[0];
    if (!archivo) return;

    mostrarCarga("Loading metabolic model...");

    const formData = new FormData();
    formData.append("archivo_modelo", archivo);

    const res = await fetch("/cargar_modelo", {
      method: "POST",
      body: formData
    });

    const data = await res.json();
    ocultarCarga();

    if (data.error) {
      alert("❌ " + data.error);
      return;
    }

    actualizarCombosReacciones(data.reacciones);
  });
});


/* ============================================================
   UPDATE REACTION COMBOBOXES
   ============================================================ */
function actualizarCombosReacciones(lista) {
  const selObjetivo = document.getElementById("rxns_s");
  const selRestr = document.getElementById("rxns_res");

  // CLEAR ALL
  selObjetivo.innerHTML = "";
  selRestr.innerHTML = "";

  // ADD NEW OPTIONS
  lista.forEach((rxn) => {
    const op1 = document.createElement("option");
    op1.value = rxn;
    op1.textContent = rxn;
    selObjetivo.appendChild(op1);

    const op2 = document.createElement("option");
    op2.value = rxn;
    op2.textContent = rxn;
    selRestr.appendChild(op2);
  });

  // 🔥 RELOAD Choices.js
  if (window.selectObjetivoChoices) window.selectObjetivoChoices.destroy();
  if (window.selectRestrChoices) window.selectRestrChoices.destroy();

  window.selectObjetivoChoices = new Choices("#rxns_s", {
    searchPlaceholderValue: "Search reaction...",
    shouldSort: false,
    searchResultLimit: 20
  });

  window.selectRestrChoices = new Choices("#rxns_res", {
    searchPlaceholderValue: "Search reaction...",
    shouldSort: false,
    searchResultLimit: 20
  });
}
