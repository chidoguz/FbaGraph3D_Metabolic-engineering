# app.py
from flask import Flask, render_template, request, jsonify, send_file
import cobra
import warnings
from graficas import Graficas
import pandas as pd
from io import BytesIO
from datetime import datetime
import re
from utils.filtrado_alt import generar_matriz_subsistemas
import uuid  # para generar run_id únicos

# Para el heatmap (colores en el grafo según flujo)
import matplotlib.cm as cm
import matplotlib.colors as mcolors

app = Flask(__name__)

# Silenciar warnings molestos de COBRApy
warnings.filterwarnings("ignore", category=UserWarning)

# =====================================================
# ALMACÉN EN MEMORIA PARA RESULTADOS FBA
# =====================================================
# Guardará los flujos de cada simulación para poder generar el grafo 3D
# Estructura:
# fba_results_store[run_id] = {
#     "fluxes": dict( reaction_id -> flujo )
# }
fba_results_store = {}


def obtener_modelo_actual():
  modelo = app.config.get("modelo_cargado", None)
  if modelo is None:
    raise Exception("No hay modelo cargado. Sube un archivo primero.")
  return modelo  # ✔ NO copiar el modelo


# =====================================================
# RUTA: SUBIR Y CARGAR MODELO METABÓLICO
# =====================================================
@app.route("/cargar_modelo", methods=["POST"])
def cargar_modelo():
  """
  Permite subir un archivo de modelo (.mat, .xml, .json)
  y cargarlo como un modelo COBRA válido. Devuelve lista de reacciones.
  """
  if "archivo_modelo" not in request.files:
    return jsonify({"error": "No se recibió archivo."}), 400

  archivo = request.files["archivo_modelo"]
  if archivo.filename.strip() == "":
    return jsonify({"error": "El archivo está vacío."}), 400

  nombre = archivo.filename.lower()

  # Guardarlo temporalmente
  ext = nombre.split(".")[-1]
  ruta_temp = f"models/modelo_subido.{ext}"
  archivo.save(ruta_temp)

  # Intentar cargar según la extensión
  try:
    if nombre.endswith(".mat"):
      modelo = cobra.io.load_matlab_model(ruta_temp)
    elif nombre.endswith(".xml"):
      modelo = cobra.io.read_sbml_model(ruta_temp)
    elif nombre.endswith(".json"):
      modelo = cobra.io.load_json_model(ruta_temp)
    else:
      return jsonify({"error": "Formato no soportado. Use .mat, .xml o .json"}), 400
  except Exception as e:
    return jsonify({"error": f"Error al cargar el modelo: {str(e)}"}), 500

  app.config["ruta_modelo"] = ruta_temp  # conservar nombre si quieres
  app.config["modelo_cargado"] = modelo  # << GUARDAR EL OBJETO EN RAM

  # Lista de reacciones para la interfaz
  reacciones = [rxn.id for rxn in modelo.reactions]

  return jsonify({
    "mensaje": "Modelo cargado correctamente.",
    "reacciones": reacciones,
    "nombre_modelo": archivo.filename
  })


# =====================================================
# RUTA PRINCIPAL (INTERFAZ FBA)
# =====================================================
@app.route("/")
def index():
  modelo = app.config.get("modelo_cargado")

  if modelo is None:
    # No hay modelo cargado → enviar vacío
    return render_template("index.html", reacciones=[])

  reacciones = [rxn.id for rxn in modelo.reactions]
  return render_template("index.html", reacciones=reacciones)


# =====================================================
# RUTA: EJECUTAR FBA + RESTRICCIONES
# =====================================================
@app.route("/solicitud", methods=["POST"])
def solicitud():
  data = request.get_json()
  funcion_objetivo = data.get("funcion_objetivo")
  restricciones = data.get("restricciones", [])

  try:
    modelo = obtener_modelo_actual()
  except Exception as e:
    return jsonify({"error": str(e)})

  # ------------------ FUNCIÓN OBJETIVO ------------------
  try:
    modelo.objective = funcion_objetivo
  except Exception:
    return jsonify({"error": f"La reacción '{funcion_objetivo}' no existe."})

  restricciones_aplicadas = []
  warnings_list = []

  # ------------------ LOWER BOUNDS -----------------------
  for r in restricciones:
    if r["limite"] != "lower":
      continue

    rxn_id = r["reaccion"]
    valor = float(r["valor"])

    if rxn_id not in modelo.reactions:
      warnings_list.append(f"⚠ La reacción {rxn_id} no existe.")
      continue

    rxn = modelo.reactions.get_by_id(rxn_id)
    rxn.lower_bound = valor

    restricciones_aplicadas.append({
      "reaccion": rxn_id,
      "limite": "lower",
      "valor": valor,
      "nuevo_lower": rxn.lower_bound,
      "nuevo_upper": rxn.upper_bound
    })

  # ------------------ UPPER BOUNDS -----------------------
  for r in restricciones:
    if r["limite"] != "upper":
      continue

    rxn_id = r["reaccion"]
    valor = float(r["valor"])

    if rxn_id not in modelo.reactions:
      warnings_list.append(f"⚠ La reacción {rxn_id} no existe.")
      continue

    rxn = modelo.reactions.get_by_id(rxn_id)

    if valor < rxn.lower_bound:
      warnings_list.append(
        f"⚠ Ajuste automático: upper {valor} → {rxn.lower_bound} porque lower es mayor."
      )
      valor = rxn.lower_bound

    rxn.upper_bound = valor

    restricciones_aplicadas.append({
      "reaccion": rxn_id,
      "limite": "upper",
      "valor": valor,
      "nuevo_lower": rxn.lower_bound,
      "nuevo_upper": rxn.upper_bound
    })

  # ------------------ OPTIMIZAR --------------------------
  try:
    solution = modelo.optimize()
  except Exception as e:
    return jsonify({"error": str(e)})

  # ------------------ KPIs ------------------------------
  flujos_abs = solution.fluxes.abs()
  activas = int((flujos_abs > 1e-6).sum())
  inactivas = len(flujos_abs) - activas

  biomasa_value = 0.0
  if "BIOMASS_Ecoli_core_w_GAM" in modelo.reactions:
    biomasa_value = float(solution.fluxes.get("BIOMASS_Ecoli_core_w_GAM", 0))

  atp_value = 0.0
  if "ATPM" in modelo.reactions:
    atp_value = abs(float(solution.fluxes.get("ATPM", 0)))

  flujo_total = float(flujos_abs.sum())

  # ------------------ GRÁFICA (PLOTLY) -------------------
  graph_json = Graficas.generar_grafica(solution, modelo)

  # ------------------ RESPUESTA AL FRONTEND --------------
  graph_json["restricciones"] = restricciones_aplicadas
  graph_json["warnings"] = warnings_list
  graph_json["objective_value"] = float(solution.objective_value)
  graph_json["status"] = solution.status

  # 🔥 ENVÍA TODOS LOS FLUJOS COMPLETOS (PARA EXCEL)
  flujos_dict = solution.fluxes.to_dict()
  graph_json["flujos_completos"] = flujos_dict

  # 🔥 ENVÍA KPIs PARA EL DASHBOARD
  graph_json["kpi_biomasa"] = biomasa_value
  graph_json["kpi_atp"] = atp_value
  graph_json["kpi_flujo_total"] = flujo_total
  graph_json["kpi_activas"] = {
    "activas": activas,
    "inactivas": inactivas
  }

  # =====================================================
  # 🔥 GUARDAR RESULTADO FBA PARA EL GRAFO 3D
  # =====================================================
  run_id = str(uuid.uuid4())
  fba_results_store[run_id] = {
    "fluxes": flujos_dict
  }
  graph_json["run_id"] = run_id

  return jsonify(graph_json)


# =====================================================
# RUTA: DESCARGAR EXCEL
# =====================================================
@app.route("/descargar_excel", methods=["POST"])
def descargar_excel():
  data = request.get_json(silent=True)

  # ---------------------------------------------------------
  # VALIDACIÓN: si no llegó nada, regresar sin error
  # ---------------------------------------------------------
  if not data:
    return jsonify({"error": "No se recibieron datos para generar el Excel."}), 400

  # Extraer datos con valores por defecto seguros
  flujos = data.get("flujos_completos") or {}
  funcion_objetivo = data.get("funcion_objetivo") or "No especificado"
  restricciones = data.get("restricciones") or []
  obj_val = data.get("objective_value") or 0
  kpi_biomasa = data.get("kpi_biomasa") or 0
  kpi_atp = data.get("kpi_atp") or 0
  kpi_flujo_total = data.get("kpi_flujo_total") or 0
  kpi_activas = data.get("kpi_activas") or {}

  # Valores seguros para KPIs
  num_activas = kpi_activas.get("activas", 0)
  num_inactivas = kpi_activas.get("inactivas", 0)

  output = BytesIO()
  writer = pd.ExcelWriter(output, engine="openpyxl")

  # ---------------------------------------------------------
  # HOJA 1: FLUJOS
  # Si flujos está vacío, crear tabla vacía sin tronar
  # ---------------------------------------------------------
  if flujos:
    df_flujos = pd.DataFrame({
      "Reacción": list(flujos.keys()),
      "Flujo": list(flujos.values())
    })
    df_flujos["Flujo absoluto"] = df_flujos["Flujo"].abs()
    df_flujos["Activa"] = df_flujos["Flujo"].abs() > 1e-6
  else:
    df_flujos = pd.DataFrame(
      columns=["Reacción", "Flujo", "Flujo absoluto", "Activa"]
    )

  df_flujos.to_excel(writer, index=False, sheet_name="Flujos")

  # ---------------------------------------------------------
  # HOJA 2: RESUMEN
  # ---------------------------------------------------------
  resumen = pd.DataFrame({
    "Descripción": [
      "Función objetivo",
      "Valor objetivo",
      "Biomasa",
      "ATP mantenimiento",
      "Actividad total",
      "Reacciones activas",
      "Reacciones inactivas",
      "Fecha"
    ],
    "Valor": [
      funcion_objetivo,
      obj_val,
      kpi_biomasa,
      kpi_atp,
      kpi_flujo_total,
      num_activas,
      num_inactivas,
      datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    ]
  })
  resumen.to_excel(writer, index=False, sheet_name="Resumen")

  # ---------------------------------------------------------
  # HOJA 3: RESTRICCIONES
  # Solo si existen
  # ---------------------------------------------------------
  if restricciones:
    df_rest = pd.DataFrame(restricciones)
    df_rest.to_excel(writer, index=False, sheet_name="Restricciones")

  writer.close()
  output.seek(0)

  return send_file(
    output,
    as_attachment=True,
    download_name="fba_resultado.xlsx",
    mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  )


# =====================================================
# RUTA: PÁGINA DEL GRAFO 3D
# =====================================================
@app.route("/grafo")
def grafo():
  """
  Página HTML donde se mostrará el grafo 3D.
  Recibe run_id vía query string.
  """
  run_id = request.args.get("run_id", "")
  return render_template("grafo.html", run_id=run_id)


# =====================================================
# API: DATOS PARA EL GRAFO 3D BASADO EN UN FBA
# =====================================================
@app.route("/grafo_datos")
def grafo_datos():
  """
  Devuelve los datos del grafo 3D (nodes, links) en base a un run_id.

  Implementa OPTIMIZACIÓN para modelos grandes (>3000 rxns):
  - Si el modelo es gigante y NO hay filtro de subsistema:
    → solo se muestran reacciones activas (flujo != 0)
  - Si se selecciona un subsistema específico:
    → mostrar todo lo de ese subsistema (completo)
  """
  run_id = request.args.get("run_id")
  if not run_id or run_id not in fba_results_store:
    return jsonify({"error": "run_id inválido o expirado"}), 400

  fluxes = fba_results_store[run_id]["fluxes"]

  # Cargar modelo
  try:
    modelo = obtener_modelo_actual()
  except Exception as e:
    return jsonify({"error": str(e)})

  # Subsistema filtrado (opcional)
  filtro_sub = request.args.get("subsystem", None)

  # Lista de subsistemas únicos
  lista_subsistemas = sorted(
    set(r.subsystem for r in modelo.reactions if r.subsystem)
  )

  # ============================================================
  # 🚦 DETECTAR SI EL MODELO ES GIGANTE
  # ============================================================
  es_gigante = len(modelo.reactions) > 3000

  # Cálculo de flujo máximo
  flux_abs_vals = [abs(v) for v in fluxes.values()]
  max_flux = max(flux_abs_vals) if flux_abs_vals else 0.0

  # Heatmap colores
  if max_flux <= 0:
    def flux_to_color(_flux):
      return "#CCCCCC"
  else:
    norm = mcolors.Normalize(vmin=0, vmax=max_flux)
    cmap = cm.plasma

    def flux_to_color(flux):
      rgba = cmap(norm(abs(flux)))
      return mcolors.to_hex(rgba)

  nodes = {}
  links = []

  # ============================================================
  # 🔥 CONSTRUCCIÓN DEL GRAFO (OPTIMIZADO)
  # ============================================================
  for rxn in modelo.reactions:
    # Filtro por subsistema seleccionado
    if filtro_sub and rxn.subsystem != filtro_sub:
      continue

    # Flujo real del FBA
    rxn_flux = float(fluxes.get(rxn.id, 0.0))

    # ========================================================
    # 🚀 OPTIMIZACIÓN: si modelo gigante y NO hay filtro,
    # solo incluir reacciones activas
    # ========================================================
    if es_gigante and not filtro_sub:
      if abs(rxn_flux) < 1e-9:
        continue  # ignorar reacciones sin actividad

    # ========================================================
    # NODO REACCIÓN
    # ========================================================
    if rxn.id not in nodes:
      nodes[rxn.id] = {
        "id": rxn.id,
        "name": rxn.id,
        "group": "reaction",
        "subsystem": rxn.subsystem or "NA",
        "val": 6,
        "flux": abs(rxn_flux),
        "color": flux_to_color(rxn_flux)
      }

    # ========================================================
    # METABOLITOS Y ARISTAS
    # ========================================================
    for met, coeff in rxn.metabolites.items():
      met_id = met.id

      # Crear nodo del metabolito
      if met_id not in nodes:
        nodes[met_id] = {
          "id": met_id,
          "name": met_id,
          "group": "metabolite",
          "subsystem": rxn.subsystem or "NA",
          "val": 2,
          "flux": 0.0,
          "color": "#1f77b4"
        }

      # Dirección bioquímica correcta
      if coeff < 0:
        source = met_id
        target = rxn.id
      elif coeff > 0:
        source = rxn.id
        target = met_id
      else:
        continue

      links.append({
        "source": source,
        "target": target,
        "flux": abs(rxn_flux),
        "flux_signed": rxn_flux,
        "coeff": float(coeff),
        "color": flux_to_color(rxn_flux)
      })

  # ------------------------------------------------------------
  # RESPUESTA → enviar indicador de modelo gigante al frontend
  # ------------------------------------------------------------
  return jsonify({
    "nodes": list(nodes.values()),
    "links": links,
    "max_flux": max_flux,
    "subsistemas": lista_subsistemas,
    "modelo_gigante": es_gigante  # 👈 NEW
  })


@app.route("/grafo_alt")
def grafo_alt():
  """
  Página HTML donde se mostrará el grafo alternativo ALT.
  Recibe run_id vía query string.
  """
  run_id = request.args.get("run_id", "")
  return render_template("grafo_alt.html", run_id=run_id)


# =====================================================
# API: GRAFO ALT (solo metabolitos + subsistemas)
# =====================================================
@app.route("/grafo_datos_alt")
def grafo_datos_alt():
  run_id = request.args.get("run_id")
  if not run_id or run_id not in fba_results_store:
    return jsonify({"error": "run_id inválido o expirado"}), 400

  def limpiar_metabolito(metab_id):
    return re.sub(r"(_\w$)", "", metab_id)

  # ===============================
  # 1. Cargar modelo y flujos
  # ===============================
  try:
    modelo = obtener_modelo_actual()
  except Exception as e:
    return jsonify({"error": str(e)})

  fluxes = fba_results_store[run_id]["fluxes"]

  # ===============================
  # 2. Calcular matriz subsistemas
  # ===============================
  datos_subs = generar_matriz_subsistemas(modelo)
  metabolitos_filtrados = datos_subs["metabolitos_filtrados"]
  todos_subsistemas = datos_subs["todos_subsistemas"]
  matriz_corr = datos_subs["matriz_correlacion"]
  matriz_corr_dict = matriz_corr.to_dict()

  # ===============================
  # 3. REACCIONES + ACTIVIDAD POR METABOLITO
  # ===============================
  actividad_max = {}
  actividad_sum = {}
  actividad_prom = {}
  reacciones_por_metabolito = {}  # ← AQUÍ SE GUARDAN LAS REACCIONES

  # Inicializar diccionario
  for m in metabolitos_filtrados.keys():
    reacciones_por_metabolito[m] = []

  # Recorrer reacciones del modelo
  for rxn in modelo.reactions:
    flujo = float(fluxes.get(rxn.id, 0.0))
    for met in rxn.metabolites:
      metab_limpio = limpiar_metabolito(met.id)
      if metab_limpio in reacciones_por_metabolito:
        reacciones_por_metabolito[metab_limpio].append({
          "id": rxn.id,
          "flux": flujo
        })

  # Calcular actividad metabólica
  for metab, lista_rxn in reacciones_por_metabolito.items():
    flujos_abs = [abs(r["flux"]) for r in lista_rxn]
    if len(flujos_abs) == 0:
      actividad_max[metab] = 0
      actividad_sum[metab] = 0
      actividad_prom[metab] = 0
    else:
      actividad_max[metab] = max(flujos_abs)
      actividad_sum[metab] = sum(flujos_abs)
      actividad_prom[metab] = actividad_sum[metab] / len(flujos_abs)

  # Normalización de colores (heatmap actividad)
  max_global = max(actividad_max.values()) if actividad_max else 1
  norm = mcolors.Normalize(vmin=0, vmax=max_global)
  cmap = cm.plasma

  def actividad_to_color(v):
    rgba = cmap(norm(v))
    return mcolors.to_hex(rgba)

  # ============================================================
  # 🚦 DETECTAR SI EL MODELO ES GIGANTE Y FILTRAR METABOLITOS
  # ============================================================
  es_gigante = len(modelo.reactions) > 3000
  if es_gigante:
    # Solo conservar metabolitos con actividad_max > 0
    metabolitos_filtrados_activos = {
      m: subs
      for m, subs in metabolitos_filtrados.items()
      if actividad_max.get(m, 0) > 0
    }
  else:
    metabolitos_filtrados_activos = metabolitos_filtrados

  # ===============================
  # 4. Construcción NODOS ALT
  # ===============================
  nodos = []

  # --- Metabolitos ---
  for metab, subs in metabolitos_filtrados_activos.items():
    nodos.append({
      "id": metab,
      "type": "metabolite",
      "group": "metabolite",
      "subsistemas": sorted(list(subs)),
      "actividad_max": actividad_max.get(metab, 0),
      "actividad_suma": actividad_sum.get(metab, 0),
      "actividad_promedio": actividad_prom.get(metab, 0),
      "color": actividad_to_color(actividad_max.get(metab, 0)),
      "val": 5,
      "reacciones": reacciones_por_metabolito.get(metab, [])
    })

  # --- Subsistemas ---
  if es_gigante:
    # Solo subsistemas que tengan al menos un metabolito activo
    subs_conectados = sorted(
      {s for subs in metabolitos_filtrados_activos.values() for s in subs}
    )
  else:
    subs_conectados = todos_subsistemas

  for subs in subs_conectados:
    nodos.append({
      "id": subs,
      "type": "subsystem",
      "group": "subsystem",
      "color": "#1b7fc1",
      "val": 12
    })

  # ===============================
  # 5. Construcción ENLACES ALT
  # ===============================
  enlaces = []
  for metab, subs_list in metabolitos_filtrados_activos.items():
    for subs in subs_list:
      enlaces.append({
        "source": metab,
        "target": subs,
        "color": "#999999"
      })

  # ===============================
  # 6. Respuesta final JSON
  # ===============================
  metab_json = {
    m: sorted(list(subs))
    for m, subs in metabolitos_filtrados_activos.items()
  }

  return jsonify({
    "nodes": nodos,
    "links": enlaces,
    "subsistemas": subs_conectados,
    "matriz_correlacion": matriz_corr_dict,
    "metabolitos_filtrados": metab_json,
    "ruta_xlsx": datos_subs["ruta_xlsx"],
    "modelo_gigante": es_gigante
  })


@app.route("/descargar_matriz_alt", methods=["POST"])
def descargar_matriz_alt():
  """
  Exporta:
  - Hoja 1: matriz S×S
  - Hoja 2: tabla de relaciones con lista de metabolitos que conectan cada par
  """
  data = request.get_json()
  matriz_corr = data.get("matriz_correlacion")
  metabolitos_filtrados = data.get("metabolitos_filtrados") or {}  # {metabolito: [subsistemas]}
  todos_subsistemas = data.get("subsistemas")

  if not matriz_corr:
    return jsonify({"error": "No se recibió matriz"}), 400

  # Convertir dict → DataFrame
  df_matriz = pd.DataFrame(matriz_corr)

  # ============================================================
  # 2. Construcción de la tabla de relaciones
  # ============================================================
  filas = []
  for i, subsA in enumerate(todos_subsistemas):
    for subsB in todos_subsistemas[i + 1:]:  # evitar duplicados A–B y B–A
      # Metabolitos que conectan ambos
      conectan = []
      for metab, lista_subs in metabolitos_filtrados.items():
        if subsA in lista_subs and subsB in lista_subs:
          conectan.append(metab)

      if len(conectan) > 0:
        filas.append({
          "Subsistema A": subsA,
          "Subsistema B": subsB,
          "Metabolitos": ", ".join(conectan)
        })

  df_relaciones = pd.DataFrame(filas)

  # ============================================================
  # 3. Generar Excel en memoria
  # ============================================================
  output = BytesIO()
  writer = pd.ExcelWriter(output, engine="openpyxl")

  # Hoja 1: matriz
  df_matriz.to_excel(writer, index=True, sheet_name="Matriz_SxS")

  # Hoja 2: relaciones
  if not df_relaciones.empty:
    df_relaciones.to_excel(writer, index=False, sheet_name="Relaciones")
  else:
    # Hoja con texto si no hubo ninguna relación
    pd.DataFrame({
      "Mensaje": [
        "No existen metabolitos compartidos entre subsistemas."
      ]
    }).to_excel(writer, index=False, sheet_name="Relaciones")

  writer.close()
  output.seek(0)

  return send_file(
    output,
    as_attachment=True,
    download_name="matriz_subsistemas_alt.xlsx",
    mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  )


# =====================================================
# EJECUTAR SERVIDOR
# =====================================================
if __name__ == "__main__":
  app.run(host="0.0.0.0", debug=True, port=5000)
