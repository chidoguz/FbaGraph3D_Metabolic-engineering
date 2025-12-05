import numpy as np

class Graficas:
    @staticmethod
    def generar_grafica(solution, modelo):

        flujos_ord = solution.fluxes.abs().sort_values(ascending=False)
        flujos = np.array(flujos_ord.values)

        # =============================
        # 🔥 Obtener nombre completo
        # =============================
        rxns_ids = list(flujos_ord.index)

        rxns = np.array([
            modelo.reactions.get_by_id(r).name if modelo.reactions.get_by_id(r).name else r
            for r in rxns_ids
        ])

        top_n = 10
        values = np.round(flujos[:top_n], 2).astype(str)

        # ====================================================
        # 🎨 GENERADOR DEGRADADO
        # ====================================================
        base_r, base_g, base_b = (72, 20, 143)

        def lighten(color, factor):
            r, g, b = color
            r = int(r + (255 - r) * factor)
            g = int(g + (255 - g) * factor)
            b = int(b + (255 - b) * factor)
            return f"rgb({r},{g},{b})"

        gradient_colors = [
            lighten((base_r, base_g, base_b), i / (top_n * 1.4))
            for i in range(top_n)
        ]

        # ====================================================
        # 🎨 GRÁFICA
        # ====================================================
        trace = {
            "type": "bar",
            "x": flujos[:top_n].tolist(),
            "y": rxns[:top_n].tolist(),
            "orientation": "h",

            "text": values.tolist(),
            "textposition": "outside",
            "textfont": {
                "family": "Poppins",
                "size": 13,
                "color": "#334155"
            },

            "marker": {
                "color": gradient_colors,
                "line": {
                    "color": "#0C5050",
                    "width": 1.0
                }
            },
            "hoverinfo": "x+y"
        }

        layout = {
            "title": {
                "text": "Flux Balance Analisis",
                "x": 0.5,
                "font": {"family": "Poppins", "size": 26}
            },

            "paper_bgcolor": "#FFFFFF",
            "plot_bgcolor": "#FFFFFF",

            "xaxis": {
                "title": "Flux (mmol/gDW/h)",
                "tickfont": {"family": "Poppins", "size": 12}
            },
            "yaxis": {
                "title": {
                    "text": "Reactions",
                    "standoff": 40   # ajusta este valor
                },
                "autorange": "reversed",
                "tickfont": {"family": "Poppins", "size": 12}
            },

            "yaxis": {
                "title": "Reactions",
                "autorange": "reversed",
                "tickfont": {"family": "Poppins", "size": 9}
            },
            

            "margin": dict(t=70, l=260, r=40, b=60),
            "autosize": True,
            "responsive": True
        }

        return {"data": [trace], "layout": layout}
