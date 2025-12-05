# 🌐 **Metabolic Network Visualizer – Comprehensive FBA Analysis and 3D Graph Exploration Tool**

### 🔬 *A full-featured web platform for metabolic model analysis, flux balance simulation, subsystem exploration, and interactive 3D visualization.*

This project implements an advanced, research-grade application designed for metabolic engineering, systems biology, and computational modeling. It integrates **COBRApy**, **Flask**, **Plotly**, **Three.js**, and **3d-force-graph** to deliver a seamless, modern, and intuitive interface for exploring complex biochemical networks.

The purpose of this tool is to give researchers, students, and engineers the ability to:

- Upload and manipulate genome-scale metabolic models  
- Run **Flux Balance Analysis (FBA)** dynamically  
- Visualize metabolic flux distributions  
- Explore 3D interaction graphs in real time  
- Inspect subsystem connectivity  
- Generate Excel-based scientific reports  
- Analyze KPIs representing metabolic performance  
- Study the effect of constraints, assumptions, and reaction modifications  

This README provides:
- A complete project overview  
- Theoretical background on FBA  
- Full installation and execution instructions  
- Architecture diagrams  
- User interface documentation  
- Data-flow and algorithm details  
- Notes on performance and scalability  
- Potential extensions and research use cases  

---

# 📘 **1. Scientific Background**

## 🔬 What is Flux Balance Analysis?

Flux Balance Analysis (FBA) is a mathematical framework used in systems biology to analyze the flow of metabolites through a metabolic network under the assumption of steady state.

FBA solves a constrained linear optimization problem:

```
maximize:   cᵀ · v
subject to: S · v = 0
            lb ≤ v ≤ ub
```

Where:

- **v** = flux vector for all metabolic reactions  
- **S** = stoichiometric matrix  
- **c** = objective coefficient vector (e.g., biomass reaction)  
- **lb, ub** = lower and upper bounds (constraints)

This tool allows users to interactively manipulate:
- Objective functions  
- Flux bounds  
- Subsystem filters  
- Thresholds for visualization  
- Reaction-level metadata  

---

# 🌟 **2. Key Features**

This project contains one of the most complete FBA visualization toolkits available without requiring specialized software.

## ⚙️ Model Interaction
- Upload `.mat`, `.xml`, or `.json` metabolic model files  
- Automatic parsing with COBRApy  
- Extraction of all reaction identifiers  
- Dynamic and searchable dropdown menus  
- Bound manipulation (LB/UB changes)  
- Full model reset on session reload  

## 🧮 FBA Engine
- Calls COBRApy solver backend  
- Captures warnings, infeasibilities, and flux anomalies  
- Detects blocked reactions  
- Computes subsystem participation  
- Generates complete flux dictionaries  

## 📊 Visualization Tools
### ✔️ Flux Ranking Bar Chart
Uses Plotly to display flux intensities sorted from highest to lowest.

### ✔️ Objective Gauge
An animated gauge indicator displaying the optimal objective value.

### ✔️ KPI Panel
KPIs include:
- Biomass flux  
- ATP maintenance flux  
- Total absolute flux  
- Active vs inactive reactions  
- Constraint count  
- Metabolic performance classification  

### ✔️ Warning Display Panel
Displays:
- Unbounded model alerts  
- Infeasible solutions  
- Missing compartments  
- Zero objective errors  

---

# 🧬 **3D Metabolic Graph Visualization**

One of the most advanced parts of the system is the interactive 3D graph.

Built using:
- **Three.js**
- **3d-force-graph**

The graph represents:

| Element | Representation |
|--------|----------------|
| Reaction | Blue/purple node |
| Metabolite | Green node |
| Flux | Arrow + animated particles |
| Flux intensity | Color gradient + thickness |
| Coefficients | Determines directionality |

## 🎨 Heatmap Color Scale

```
Low Flux     → Dark Blue
Medium Flux  → Magenta / Orange
High Flux    → Yellow
```

## 🎛️ Graph Controls
- Toggle names (ON/OFF)  
- Subsystem filter  
- Threshold slider (smooth, quadratic response)  
- Legend bar with dynamic max flux  
- Back button (full reload for index page)  
- Node detail inspector  

## 🔄 Graph Layout Process

1. Backend prepares interaction list (JSON)  
2. Each reaction and metabolite gets a unique ID  
3. Flux values are normalized  
4. Colors are assigned using a perceptual heatmap  
5. Link widths scaled by flux intensity  
6. Force-directed 3D layout stabilizes dynamically  

Graph rendering performance optimized for:
- Up to 5,000 nodes  
- Real-time dragging  
- Large genome-scale models  

---

# 🧩 **4. Alternative Subsystem Graph**

This mode shows:
- Each subsystem as a node  
- Connections representing shared metabolites  
- Weighted edges showing interaction strength  
- Full matrix export  
- Scrollable heatmap representation  

Uses **subsystem adjacency matrix** generated server-side.

---

# 📁 **5. Project Structure**

```
project/
│── app.py                        # Main Flask app
│── graficas.py                   # Plot generation library
│── requirements.txt              # Python dependencies
│── utils/
│     └── filtrado_alt.py        # Subsystem matrix generator
│
│── templates/
│     ├── index.html             # Main UI
│     ├── grafo.html             # 3D reaction-metabolite graph
│     └── grafo_alt.html         # Subsystem graph view
│
│── static/
│     ├── css/
│     │     ├── styles.css
│     │     └── grafo.css
│     └── js/
│           ├── funcionalidad.js # Main frontend engine
│           ├── grafo.js
│           └── grafo_alt.js
│
└── models/                       # Optional model storage
```

---

# ⚙️ **6. Installation Guide**

## Step 1 — Clone Repository
```bash
git clone https://github.com/yourusername/metabolic-graph-visualizer.git
cd metabolic-graph-visualizer
```

## Step 2 — Create a Virtual Environment

### Windows
```bash
python -m venv venv
venv\Scripts\activate
```

### macOS / Linux
```bash
python3 -m venv venv
source venv/bin/activate
```

## Step 3 — Install Dependencies
```bash
pip install --upgrade pip
pip install -r requirements.txt
```

## Step 4 — Run the Application
```bash
python app.py
```

Access it via:

```
http://127.0.0.1:5000/
```

---

# 🔁 **7. Data Flow Diagram**

```
         [User Uploads Model]
                    │
                    ▼
         [Flask Backend Reads File]
                    │
                    ▼
         [COBRApy Loads Model]
                    │
                    ▼
  [Reactions Extracted → Sent to Frontend]
                    │
                    ▼
         [User Configures FBA]
                    │
                    ▼
        [POST /solicitud → COBRApy.solve()]
                    │
                    ▼
  [Fluxes, KPIs, Warnings, Run_ID Returned]
                    │
        ┌───────────┴───────────┐
        ▼                       ▼
 [Plotly Visualization]    [3D Graph Rendering]
```

---

# 📤 **8. Excel Report Contents**

The downloadable Excel file includes:

- Model metadata  
- Objective function  
- Constraint table  
- Full flux dictionary  
- KPIs  
- Active/inactive reaction list  
- Subsystem participation statistics  
- Optional subsystem adjacency matrix  

This allows downstream analysis in:
- MATLAB  
- R  
- Python  
- Excel Pivot Tables  

---

# ⚠️ Performance Considerations

- Browser GPU acceleration recommended  
- Large models may require:
  - Higher flux threshold  
  - Reduced label visibility  
  - Simplified layout (active reactions only)  

The system automatically detects "giant models" and switches to optimized mode.

---

# 🧭 **9. Future Extensions**

Planned or recommended improvements:

### 🧬 Biological Features
- Reaction knockout simulation  
- FVA (Flux Variability Analysis)  
- Minimal cut sets  
- Metabolite essentiality test  

### 🖥️ Frontend Features
- Graph snapshot export  
- Time-based animation for dynamic systems  
- Dark mode  

### 🔄 Backend Features
- Persistent model storage  
- User session management  
- Docker deployment  

---

# 💡 **10. Use Cases**

This tool is suitable for:

- Teaching metabolism and systems biology  
- Exploring model behavior without coding  
- Bioprocess design  
- Synthetic biology prototyping  
- Model debugging  
- Research presentations  

---

# 🤝 **11. Acknowledgments**

- COBRApy project  
- Plotly.js team  
- Three.js  
- 3d-force-graph  
- Scientific community supporting open metabolic models  

---

# 📜 License
MIT License (or your choice)

---

# 🎉 Final Notes

This project aims to democratize metabolic modeling by providing a powerful, user-friendly, interactive platform accessible directly through a web browser.  

Its combination of **scientific depth**, **visual clarity**, and **engineering robustness** makes it ideal for both research and education.

If you extend or publish work based on this tool, mention this repository as reference.

