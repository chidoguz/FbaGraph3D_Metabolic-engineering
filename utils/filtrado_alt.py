# utils/filtrado_alt.py
import cobra
import pandas as pd
import numpy as np
import re
from pathlib import Path


# ============================================================
# 1. Limpiar sufijos de compartimento
# ============================================================
def limpiar_metabolito(metabolito_id: str) -> str:
    """
    Elimina sufijos de compartimento tipo _c, _e, _p, etc.
    Ejemplo: 'glc__D_c' -> 'glc__D'
    """
    return re.sub(r"(_\w$)", "", metabolito_id)


# ============================================================
# 2. Construir diccionario metabolito -> set(subsistemas)
# ============================================================
def construir_diccionario_metabolitos(modelo: cobra.Model) -> dict:
    metabolitos_dict = {}

    for reaccion in modelo.reactions:
        if not reaccion.subsystem:
            continue

        for metabolito in reaccion.metabolites:
            metab = limpiar_metabolito(metabolito.id)
            if metab not in metabolitos_dict:
                metabolitos_dict[metab] = set()
            metabolitos_dict[metab].add(reaccion.subsystem)

    return metabolitos_dict


# ============================================================
# 3. Filtrar metabolitos poco informativos
#    - sólo 1 subsistema
#    - presentes en TODOS los subsistemas
# ============================================================
def filtrar_metabolitos(metabolitos_dict: dict) -> tuple[dict, list]:
    # lista completa de subsistemas
    todos_subsistemas = sorted({s for subs in metabolitos_dict.values() for s in subs})
    total_subsistemas = len(todos_subsistemas)

    # metabolitos en solo 1 subsistema
    metabolitos_un_subsistema = {
        m for m, subs in metabolitos_dict.items() if len(subs) == 1
    }

    # metabolitos en TODOS los subsistemas
    metabolitos_todos_subsistemas = {
        m for m, subs in metabolitos_dict.items() if len(subs) == total_subsistemas
    }

    # filtrar
    metabolitos_filtrados = {
        m: subs
        for m, subs in metabolitos_dict.items()
        if (m not in metabolitos_un_subsistema)
        and (m not in metabolitos_todos_subsistemas)
    }

    return metabolitos_filtrados, todos_subsistemas


# ============================================================
# 4. Matriz de intensidad (subsistema × metabolito)
#    valor = nº de subsistemas en los que aparece ese metabolito
# ============================================================
def construir_matriz_intensity(metabolitos_filtrados: dict) -> pd.DataFrame:
    metabolitos_lista = sorted(metabolitos_filtrados.keys())
    subs_fila = sorted({s for subs in metabolitos_filtrados.values() for s in subs})

    matrix_intensity = []
    for subsistema in subs_fila:
        fila = []
        for metab in metabolitos_lista:
            if subsistema in metabolitos_filtrados[metab]:
                fila.append(len(metabolitos_filtrados[metab]))
            else:
                fila.append(0)
        matrix_intensity.append(fila)

    df_intensity = pd.DataFrame(matrix_intensity, index=subs_fila, columns=metabolitos_lista)
    return df_intensity


# ============================================================
# 5. Buscar valores en rango por columna
#    (tal como en tu notebook: 2–10)
# ============================================================
def buscar_en_rango_por_columna(df: pd.DataFrame, min_val: int = 2) -> dict:
    """
    Busca valores >= min_val y <= max_val, donde:
    - max_val = valor máximo encontrado en la matriz
    - si el máximo es igual al total de subsistemas,
      entonces usamos (max_val - 1)
    """

    # Número total de subsistemas
    total_subsistemas = df.shape[0]

    # Valor máximo REAL encontrado en la matriz intensity
    max_val_bruto = int(df.values.max())

    # ¿Algún metabolito aparece en TODOS los subsistemas?
    if max_val_bruto == total_subsistemas:
        max_val = max_val_bruto - 1
    else:
        max_val = max_val_bruto

    resultados = {}

    for subs in df.index:
        fila = df.loc[subs]

        # Solo valores entre min_val y max_val dinámico
        valores = fila[(fila >= min_val) & (fila <= max_val)]

        for col, val in valores.items():
            if val not in resultados:
                resultados[val] = {}
            if col not in resultados[val]:
                resultados[val][col] = []
            resultados[val][col].append(subs)

    return resultados


# ============================================================
# 6. Construcción de matriz correlación S×S
#    (algoritmo original con acumulación)
# ============================================================
def construir_matriz_correlacion(df_intensity: pd.DataFrame) -> pd.DataFrame:
    resultados = buscar_en_rango_por_columna(df_intensity, min_val=2)

    resultados_legibles = {
        int(k): {col: sorted(v) for col, v in valores.items()}
        for k, valores in sorted(resultados.items())
    }

    subsistemas = df_intensity.index
    matriz = np.identity(len(subsistemas))
    matriz_correlacion = pd.DataFrame(matriz, index=subsistemas, columns=subsistemas)

    numeros = list(resultados_legibles.keys())
    indice = 0

    while 1.0 in matriz_correlacion.sum(axis=1).values:
        if indice >= len(numeros):
            break

        numero = numeros[indice]

        for metabolito, filas in resultados_legibles[numero].items():
            for i in range(len(filas)):
                for j in range(i + 1, len(filas)):
                    A = filas[i]
                    B = filas[j]
                    matriz_correlacion.loc[A, B] += 1
                    matriz_correlacion.loc[B, A] += 1

        if 1.0 not in matriz_correlacion.sum(axis=1).values:
            break

        indice += 1

    return matriz_correlacion


# ============================================================
# 7. Función principal: genera TODA la info de subsistemas
#    y exporta matriz_correlacion a XLSX
# ============================================================
def generar_matriz_subsistemas(modelo: cobra.Model) -> dict:
    """
    Devuelve:
      - metabolitos_filtrados: dict metabolito -> set(subsistemas)
      - todos_subsistemas: lista ordenada de subsistemas
      - df_intensity: DataFrame subsistema×metabolito
      - matriz_correlacion: DataFrame subsistema×subsistema
    Además exporta matriz_correlacion a 'matriz_correlacion_alt.xlsx'
    en la raíz del proyecto.
    """

    metabolitos_dict = construir_diccionario_metabolitos(modelo)
    metabolitos_filtrados, todos_subsistemas = filtrar_metabolitos(metabolitos_dict)
    df_intensity = construir_matriz_intensity(metabolitos_filtrados)
    matriz_correlacion = construir_matriz_correlacion(df_intensity)

    # Exportar a XLSX (ruta relativa al proyecto)
    ruta_xlsx = Path("matriz_correlacion_alt.xlsx")
    matriz_correlacion.to_excel(ruta_xlsx)

    return {
        "metabolitos_filtrados": metabolitos_filtrados,
        "todos_subsistemas": todos_subsistemas,
        "df_intensity": df_intensity,
        "matriz_correlacion": matriz_correlacion,
        "ruta_xlsx": str(ruta_xlsx)
    }
