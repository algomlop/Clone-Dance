# 🎮 Dance Game - Guía de Instalación y Uso

## 📦 Instalación

### 1. Instalar dependencias Python

```bash
pip install -r requirements.txt
```

Esto instalará:
- `mediapipe` (0.10.32+) - Detección de poses
- `opencv-python` - Procesamiento de video
- `numpy` - Cálculos numéricos
- `scikit-learn` - Clasificador k-NN

---

### 2. Descargar modelo de MediaPipe

Descarga **UNO** de estos modelos según tus necesidades:

#### Opción A: Heavy (RECOMENDADO para procesamiento offline)
```bash
wget https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/latest/pose_landmarker_heavy.task
```

#### Opción B: Full (para balance velocidad/precisión)
```bash
wget https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task
```

#### Opción C: Lite (para procesamiento rápido)
```bash
wget https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task
```

**Nota:** El modelo debe estar en el mismo directorio donde ejecutes el script.

---

## 🚀 Uso

### Modo 1: Detección de Poses Clave (Keyframes)

Detecta solo los momentos importantes de la coreografía.

```bash
python process_video.py \
    --video tu_video.mp4 \
    --name "Nombre de la Canción" \
    --mode keyframes
```

**Parámetros opcionales:**
```bash
python process_video_v3.py \
    --video dance.mp4 \
    --name "Mi Baile" \
    --mode keyframes \
    --model-complexity heavy \
    --movement-threshold 0.15 \
    --min-time-gap 1.0 \
    --confidence-threshold 0.7
```

---

### Modo 2: Detección Continua (Todas las poses)

Exporta la pose de cada frame del video.

```bash
python process_video_v3.py \
    --video tu_video.mp4 \
    --name "Nombre de la Canción" \
    --mode continuous
```

**Parámetros opcionales:**
```bash
python process_video_v3.py \
    --video dance.mp4 \
    --name "Mi Baile" \
    --mode continuous \
    --model-complexity heavy \
    --sample-rate 1
```

---

## 📋 Parámetros principales

| Parámetro | Valores | Default | Descripción |
|-----------|---------|---------|-------------|
| `--video` | ruta | - | **REQUERIDO:** Video MP4 a procesar |
| `--name` | texto | - | **REQUERIDO:** Nombre de la coreografía |
| `--mode` | `keyframes` / `continuous` | `keyframes` | Modo de procesamiento |
| `--model-complexity` | `lite` / `full` / `heavy` | `heavy` | Modelo de MediaPipe |
| `--movement-threshold` | 0.1-0.3 | 0.15 | Umbral para detectar movimiento (solo keyframes) |
| `--min-time-gap` | segundos | 1.0 | Tiempo mínimo entre poses (solo keyframes) |
| `--sample-rate` | número | 1 | Exportar 1 de cada N poses (solo continuous) |

---

## 📊 Salida

El script genera un archivo JSON en `choreographies/`:

### Modo Keyframes
```
choreographies/nombre_keyframes.json
```

### Modo Continuous
```
choreographies/nombre_continuous.json
```

---

## 🎨 Visualizar resultados

### 1. Abrir el visualizador web

```bash
cd frontend
python -m http.server 8000
```

### 2. Abrir en el navegador

Abre `http://localhost:8000`

### 3. Cargar archivos

1. Click en "🎬 Video MP4" → Selecciona tu video
2. Click en "📋 Coreografía JSON" → Selecciona el JSON generado
3. Click en "🚀 CARGAR Y VISUALIZAR"

El visualizador detecta automáticamente si es modo `keyframes` o `continuous`.

---

## 🔧 Solución de problemas

### Error: "Modelo no encontrado"

Descarga el modelo:
```bash
wget https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/latest/pose_landmarker_heavy.task
```

### Error: "Video no encontrado"

Verifica que la ruta al video sea correcta:
```bash
ls -la tu_video.mp4
```

### Muy pocas poses detectadas (modo keyframes)

Reduce el threshold:
```bash
--movement-threshold 0.10 --min-time-gap 0.5
```

### Procesamiento muy lento

Usa modelo más ligero:
```bash
--model-complexity lite
```

O salta frames:
```bash
--skip-frames 1  # Procesa 1 de cada 2 frames
```

---

## 📖 Ejemplos completos

### Ejemplo 1: Procesamiento básico
```bash
python process_video_v3.py --video despacito.mp4 --name "Despacito" --mode keyframes
```

### Ejemplo 2: Alta precisión (modo continuo)
```bash
python process_video_v3.py \
    --video tutorial.mp4 \
    --name "Tutorial Salsa" \
    --mode continuous \
    --model-complexity heavy
```

### Ejemplo 3: Procesamiento rápido
```bash
python process_video_v3.py \
    --video test.mp4 \
    --name "Test" \
    --mode keyframes \
    --model-complexity lite \
    --skip-frames 1
```

### Ejemplo 4: Modo continuo optimizado
```bash
python process_video_v3.py \
    --video coreografia.mp4 \
    --name "Coreografía" \
    --mode continuous \
    --sample-rate 2  # Exporta 1 de cada 2 frames (reduce tamaño)
```

---

## 📁 Estructura de archivos

```
project/
├── backend/
│   ├── process_video_v3.py          # Script principal
│   ├── pose_landmarker_extractor.py # Extractor de poses
│   ├── pose_classifier_v3.py        # Clasificador
│   ├── requirements.txt             # Dependencias
│   └── pose_landmarker_heavy.task   # Modelo (descargar)
│
├── frontend/
│   ├── index.html                   # Visualizador
│   └── visualizer.js                # Lógica del visualizador
│
└── choreographies/
    ├── baile_keyframes.json         # Resultado modo keyframes
    └── baile_continuous.json        # Resultado modo continuous
```

---

## ⚙️ Configuración avanzada

### Usar k-NN para mejor precisión

Si tienes datos de entrenamiento:

```bash
python process_video_v3.py \
    --video dance.mp4 \
    --name "Baile" \
    --mode keyframes \
    --use-knn \
    --training-data training_samples.json
```

### Desactivar filtro temporal

Solo para casos especiales:

```bash
python process_video_v3.py \
    --video dance.mp4 \
    --name "Baile" \
    --mode continuous \
    --no-temporal-filter
```

---

## 🎯 Recomendaciones

### Para procesamiento offline (generar coreografías)
- Modelo: `heavy`
- Modo: `keyframes` (más eficiente) o `continuous` (más preciso)

### Para tiempo real (frontend del juego)
- Modelo: `full`
- Usar el JSON generado offline

### Para experimentar
- Procesa el mismo video en ambos modos
- Compara resultados en el visualizador
- Decide cuál funciona mejor para tu caso

---

## 📞 Soporte

Si encuentras problemas:

1. Verifica versiones:
```bash
pip show mediapipe opencv-python numpy scikit-learn
```

2. Verifica que el modelo existe:
```bash
ls -la pose_landmarker_*.task
```

3. Ejecuta con más logs:
```bash
python process_video_v3.py --video test.mp4 --name "Test" --mode keyframes 2>&1 | tee output.log
```

---

¡Listo para procesar coreografías! 🎉