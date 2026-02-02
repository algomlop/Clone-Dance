/**
 * Dance Game Visualizer - JavaScript
 * Renderiza videos con landmarks superpuestos
 */

class DanceVisualizer {
    constructor() {
        // Elementos del DOM
        this.videoInput = document.getElementById('videoInput');
        this.jsonInput = document.getElementById('jsonInput');
        this.loadBtn = document.getElementById('loadBtn');
        this.playBtn = document.getElementById('playBtn');
        this.canvas = document.getElementById('videoCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.timeline = document.getElementById('timeline');
        this.timelineProgress = document.getElementById('timelineProgress');
        this.timeDisplay = document.getElementById('timeDisplay');
        this.visualizer = document.getElementById('visualizer');
        this.loading = document.getElementById('loading');
        
        // Controles visuales
        this.skeletonColor = document.getElementById('skeletonColor');
        this.lineThickness = document.getElementById('lineThickness');
        this.skeletonOpacity = document.getElementById('skeletonOpacity');
        this.showKeyPoses = document.getElementById('showKeyPoses');
        this.showConnections = document.getElementById('showConnections');
        this.showLabels = document.getElementById('showLabels');
        
        // Info panels
        this.totalPosesEl = document.getElementById('totalPoses');
        this.currentPoseEl = document.getElementById('currentPose');
        this.avgGapEl = document.getElementById('avgGap');
        this.difficultyEl = document.getElementById('difficulty');
        this.poseTimelineEl = document.getElementById('poseTimeline');
        
        // Estado
        this.video = null;
        this.choreography = null;
        this.isPlaying = false;
        this.currentKeyPoseIndex = -1;
        this.animationFrameId = null;
        
        // Configuración
        this.config = {
            color: '#00ff00',
            thickness: 3,
            opacity: 1.0,
            showKeyPoses: true,
            showConnections: true,
            showLabels: true
        };
        
        this.setupEventListeners();
    }
    
    setupEventListeners() {
        // File inputs
        this.videoInput.addEventListener('change', (e) => {
            const fileName = e.target.files[0]?.name || 'Sin seleccionar';
            document.getElementById('videoFileName').textContent = fileName;
            this.checkFilesReady();
        });
        
        this.jsonInput.addEventListener('change', (e) => {
            const fileName = e.target.files[0]?.name || 'Sin seleccionar';
            document.getElementById('jsonFileName').textContent = fileName;
            this.checkFilesReady();
        });
        
        // Load button
        this.loadBtn.addEventListener('click', () => this.loadFiles());
        
        // Play button
        this.playBtn.addEventListener('click', () => this.togglePlay());
        
        // Timeline
        this.timeline.addEventListener('click', (e) => this.seekTo(e));
        
        // Visual config
        this.skeletonColor.addEventListener('change', (e) => {
            this.config.color = e.target.value;
        });
        
        this.lineThickness.addEventListener('input', (e) => {
            this.config.thickness = parseInt(e.target.value);
            document.getElementById('thicknessValue').textContent = e.target.value;
        });
        
        this.skeletonOpacity.addEventListener('input', (e) => {
            this.config.opacity = parseInt(e.target.value) / 100;
            document.getElementById('opacityValue').textContent = e.target.value;
        });
        
        this.showKeyPoses.addEventListener('change', (e) => {
            this.config.showKeyPoses = e.target.checked;
        });
        
        this.showConnections.addEventListener('change', (e) => {
            this.config.showConnections = e.target.checked;
        });
        
        this.showLabels.addEventListener('change', (e) => {
            this.config.showLabels = e.target.checked;
        });
    }
    
    checkFilesReady() {
        const hasVideo = this.videoInput.files.length > 0;
        const hasJson = this.jsonInput.files.length > 0;
        this.loadBtn.disabled = !(hasVideo && hasJson);
    }
async loadFiles() {
    this.loading.style.display = 'block';
    
    try {
        const videoFile = this.videoInput.files[0];
        const videoUrl = URL.createObjectURL(videoFile);
        
        if (this.video) this.video.remove();

        this.video = document.createElement('video');
        this.video.src = videoUrl;
        this.video.muted = true;
        this.video.preload = 'auto'; // Forzar carga
        this.video.style.display = 'none';
        document.body.appendChild(this.video);
        
        // CAMBIO: Esperar a 'canplay' en lugar de 'loadedmetadata'
        await new Promise((resolve) => {
            this.video.oncanplay = resolve;
            this.video.load();
        });

        // Forzar a que Firefox renderice el primer frame
        this.video.currentTime = 0.01; 

        const jsonFile = this.jsonInput.files[0];
        const jsonText = await jsonFile.text();
        this.choreography = JSON.parse(jsonText);
        
        this.setupCanvas();
        this.updateInfo();
        
        this.loading.style.display = 'none';
        this.visualizer.style.display = 'block';
        
        // Un pequeño respiro para que el canvas procese las dimensiones
        setTimeout(() => this.render(), 100);
        
    } catch (error) {
        console.error('Error cargando archivos:', error);
        alert('Error al cargar los archivos.');
        this.loading.style.display = 'none';
    }
}

setupCanvas() {
    // CORRECCIÓN: Forzar dimensiones mínimas si videoWidth falla inicialmente
    this.canvas.width = this.video.videoWidth || 1280;
    this.canvas.height = this.video.videoHeight || 720;
    
    // Escuchar cambios de tiempo
    this.video.ontimeupdate = () => {
        this.updateTimeline();
        this.updateCurrentPose();
        // Si no está en loop de animación (pausado), renderizar el frame actual
        if (!this.isPlaying) this.render();
    };

    this.video.onended = () => {
        this.isPlaying = false;
        this.playBtn.textContent = '▶️ PLAY';
        if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);
    };
}
    
    updateInfo() {
        const stats = this.choreography.stats;
        const metadata = this.choreography.metadata;
        const mode = metadata.mode || 'keyframes';  // Detectar modo
        
        // Stats
        if (mode === 'keyframes') {
            this.totalPosesEl.textContent = stats.total_key_poses;
            this.avgGapEl.textContent = stats.avg_time_gap + 's';
            
            // Calcular dificultad
            const diff = stats.difficulty_distribution;
            let difficulty = 'Fácil';
            if (diff.hard > diff.easy && diff.hard > diff.medium) {
                difficulty = 'Difícil';
            } else if (diff.medium > diff.easy) {
                difficulty = 'Media';
            }
            this.difficultyEl.textContent = difficulty;
        } else {
            // Modo continuous
            this.totalPosesEl.textContent = stats.total_poses;
            this.avgGapEl.textContent = 'N/A';
            this.difficultyEl.textContent = 'Continuo';
        }
        
        // Timeline de poses
        this.renderPoseTimeline();
    }
    
    renderPoseTimeline() {
        this.poseTimelineEl.innerHTML = '';
        
        const mode = this.choreography.metadata.mode || 'keyframes';
        let poses = [];
        
        if (mode === 'keyframes') {
            poses = this.choreography.key_poses;
        } else {
            // Para continuous, mostrar solo cada N poses (muestra)
            const allPoses = this.choreography.continuous_poses;
            const sampleRate = Math.max(1, Math.floor(allPoses.length / 50)); // Máx 50 badges
            poses = allPoses.filter((_, i) => i % sampleRate === 0);
        }
        
        poses.forEach((pose, index) => {
            const badge = document.createElement('div');
            badge.className = 'pose-badge';
            badge.dataset.index = index;
            
            const icon = this.getPoseIcon(pose.pose_type);
            const time = this.formatTime(pose.timestamp);
            
            badge.innerHTML = `
                <div>${icon}</div>
                <div>${time}</div>
            `;
            
            badge.addEventListener('click', () => {
                this.video.currentTime = pose.timestamp;
            });
            
            this.poseTimelineEl.appendChild(badge);
        });
    }
    
    getPoseIcon(poseType) {
        const icons = {
            'brazos_arriba': '🙌',
            'brazos_extendidos_lateral': '🤸',
            'brazos_adelante': '🧘',
            'agachado': '🦆',
            'pierna_levantada_derecha': '🦵',
            'pierna_levantada_izquierda': '🦵',
            'salto': '🤾',
            'giro_derecha': '🔄',
            'giro_izquierda': '🔄',
            'manos_caderas': '🙍',
            'brazo_derecho_arriba': '🙋',
            'brazo_izquierdo_arriba': '🙋',
            'inclinacion_lateral_derecha': '🤸',
            'inclinacion_lateral_izquierda': '🤸',
            'neutral': '🧍'
        };
        return icons[poseType] || '❓';
    }
    
    togglePlay() {
        if (this.isPlaying) {
            this.video.pause();
            this.isPlaying = false;
            this.playBtn.textContent = '▶️ PLAY';
            if (this.animationFrameId) {
                cancelAnimationFrame(this.animationFrameId);
            }
        } else {
            this.video.play();
            this.isPlaying = true;
            this.playBtn.textContent = '⏸️ PAUSE';
            this.renderLoop();
        }
    }
    
    renderLoop() {
        this.render();
        if (this.isPlaying) {
            this.animationFrameId = requestAnimationFrame(() => this.renderLoop());
        }
    }
    render() {
    // Si el video no tiene datos suficientes, salir
    if (!this.video || this.video.readyState < 2) return;

    // Limpiar canvas
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    
    // Dibujar video
    // Usamos las dimensiones explícitas del video para asegurar el dibujado
    this.ctx.drawImage(
        this.video, 
        0, 0, this.video.videoWidth, this.video.videoHeight, // Fuente
        0, 0, this.canvas.width, this.canvas.height        // Destino
    );
    
    const currentTime = this.video.currentTime;
    const mode = this.choreography.metadata.mode || 'keyframes';
    
    let currentPose = null;
    if (mode === 'keyframes') {
        currentPose = this.findClosestPose(currentTime);
    } else if (mode === 'continuous') {
        currentPose = this.findContinuousPose(currentTime);
    }
    
    if (currentPose && this.config.showKeyPoses) {
        this.drawSkeleton(currentPose);
    }
}
    
    findContinuousPose(time) {
        /**
         * Busca pose en modo continuo.
         * En continuous, cada frame tiene su pose, así que buscamos
         * la pose con timestamp más cercano.
         */
        const poses = this.choreography.continuous_poses;
        if (!poses || poses.length === 0) return null;
        
        // Búsqueda binaria para eficiencia (poses están ordenadas por timestamp)
        let left = 0;
        let right = poses.length - 1;
        let closest = null;
        let minDiff = Infinity;
        
        while (left <= right) {
            const mid = Math.floor((left + right) / 2);
            const pose = poses[mid];
            const diff = Math.abs(pose.timestamp - time);
            
            if (diff < minDiff) {
                minDiff = diff;
                closest = pose;
            }
            
            if (pose.timestamp < time) {
                left = mid + 1;
            } else {
                right = mid - 1;
            }
        }
        
        // Solo retornar si está dentro de 1/30 segundo (un frame a 30fps)
        return (minDiff < 0.033) ? closest : null;
    }
    
    findClosestPose(time) {
        const poses = this.choreography.key_poses;
        if (!poses || poses.length === 0) return null;
        
        // Buscar la pose más cercana (±0.5 segundos)
        const tolerance = 0.5;
        
        for (let pose of poses) {
            if (Math.abs(pose.timestamp - time) < tolerance) {
                return pose;
            }
        }
        
        return null;
    }
    
    drawSkeleton(pose) {
        const landmarks = pose.landmarks;
        
        // Configurar estilo
        this.ctx.globalAlpha = this.config.opacity;
        this.ctx.strokeStyle = this.config.color;
        this.ctx.fillStyle = this.config.color;
        this.ctx.lineWidth = this.config.thickness;
        this.ctx.lineCap = 'round';
        
        // Dibujar conexiones si está habilitado
        if (this.config.showConnections) {
            this.drawConnections(landmarks);
        }
        
        // Dibujar puntos (landmarks)
        this.drawLandmarks(landmarks);
        
        // Dibujar etiqueta si está habilitado
        if (this.config.showLabels) {
            this.drawPoseLabel(pose);
        }
        
        this.ctx.globalAlpha = 1.0;
    }
    
    drawConnections(landmarks) {
        // Definir conexiones del cuerpo humano (MediaPipe Pose)
        const connections = [
            // Cara
            [0, 1], [1, 2], [2, 3], [3, 7],
            [0, 4], [4, 5], [5, 6], [6, 8],
            [9, 10],
            
            // Torso
            [11, 12], // Hombros
            [11, 23], [12, 24], // Hombro-cadera
            [23, 24], // Caderas
            
            // Brazo derecho
            [12, 14], [14, 16],
            [16, 18], [16, 20], [16, 22],
            
            // Brazo izquierdo
            [11, 13], [13, 15],
            [15, 17], [15, 19], [15, 21],
            
            // Pierna derecha
            [24, 26], [26, 28],
            [28, 30], [28, 32],
            
            // Pierna izquierda
            [23, 25], [25, 27],
            [27, 29], [27, 31]
        ];
        
        this.ctx.beginPath();
        
        for (let [start, end] of connections) {
            const startPoint = landmarks[start];
            const endPoint = landmarks[end];
            
            // Solo dibujar si ambos puntos son visibles
            if (startPoint.visibility > 0.5 && endPoint.visibility > 0.5) {
                const x1 = startPoint.x * this.canvas.width;
                const y1 = startPoint.y * this.canvas.height;
                const x2 = endPoint.x * this.canvas.width;
                const y2 = endPoint.y * this.canvas.height;
                
                this.ctx.moveTo(x1, y1);
                this.ctx.lineTo(x2, y2);
            }
        }
        
        this.ctx.stroke();
    }
    
    drawLandmarks(landmarks) {
        // Dibujar puntos principales (articulaciones importantes)
        const keyPoints = [
            0,  // Nariz
            11, 12, // Hombros
            13, 14, // Codos
            15, 16, // Muñecas
            23, 24, // Caderas
            25, 26, // Rodillas
            27, 28  // Tobillos
        ];
        
        for (let idx of keyPoints) {
            const point = landmarks[idx];
            
            if (point.visibility > 0.5) {
                const x = point.x * this.canvas.width;
                const y = point.y * this.canvas.height;
                
                // Círculo con borde
                this.ctx.beginPath();
                this.ctx.arc(x, y, this.config.thickness * 2, 0, 2 * Math.PI);
                this.ctx.fillStyle = this.config.color;
                this.ctx.fill();
                
                // Borde oscuro para contraste
                this.ctx.strokeStyle = '#000';
                this.ctx.lineWidth = 1;
                this.ctx.stroke();
            }
        }
    }
    
    drawPoseLabel(pose) {
        // Etiqueta en la esquina superior del canvas
        const icon = this.getPoseIcon(pose.pose_type);
        const name = pose.pose_type.replace(/_/g, ' ').toUpperCase();
        const confidence = (pose.confidence * 100).toFixed(0);
        
        // Fondo semi-transparente
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        this.ctx.fillRect(10, 10, 300, 60);
        
        // Texto
        this.ctx.fillStyle = this.config.color;
        this.ctx.font = 'bold 24px Arial';
        this.ctx.fillText(`${icon} ${name}`, 20, 40);
        
        this.ctx.fillStyle = '#ffd700';
        this.ctx.font = '16px Arial';
        this.ctx.fillText(`Confianza: ${confidence}%`, 20, 60);
    }
    
    updateTimeline() {
        const progress = (this.video.currentTime / this.video.duration) * 100;
        this.timelineProgress.style.width = progress + '%';
        
        const current = this.formatTime(this.video.currentTime);
        const total = this.formatTime(this.video.duration);
        this.timeDisplay.textContent = `${current} / ${total}`;
    }
    
    updateCurrentPose() {
        const currentTime = this.video.currentTime;
        const poses = this.choreography.key_poses;
        
        // Encontrar índice de pose actual
        let closestIndex = -1;
        let minDiff = Infinity;
        
        poses.forEach((pose, index) => {
            const diff = Math.abs(pose.timestamp - currentTime);
            if (diff < minDiff && diff < 0.5) {
                minDiff = diff;
                closestIndex = index;
            }
        });
        
        // Actualizar UI
        if (closestIndex !== this.currentKeyPoseIndex) {
            // Remover clase active de badge anterior
            const badges = this.poseTimelineEl.querySelectorAll('.pose-badge');
            badges.forEach(b => b.classList.remove('active'));
            
            // Añadir clase active al badge actual
            if (closestIndex >= 0) {
                const currentPose = poses[closestIndex];
                const icon = this.getPoseIcon(currentPose.pose_type);
                this.currentPoseEl.textContent = icon;
                
                const badge = badges[closestIndex];
                if (badge) {
                    badge.classList.add('active');
                }
            } else {
                this.currentPoseEl.textContent = '-';
            }
            
            this.currentKeyPoseIndex = closestIndex;
        }
    }
    
seekTo(e) {
    const rect = this.timeline.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = x / rect.width;
    const newTime = percentage * this.video.duration;
    
    this.video.currentTime = newTime;
    
    // IMPORTANTE: En Firefox, el video puede tardar un poco en buscar el frame
    // Escuchamos el evento 'seeked' una sola vez para redibujar
    this.video.onceSeeked = () => {
        this.render();
        this.video.removeEventListener('seeked', this.video.onceSeeked);
    };
    this.video.addEventListener('seeked', this.video.onceSeeked);
}
    
    formatTime(seconds) {
        if (isNaN(seconds)) return '0:00';
        
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }
}

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    const visualizer = new DanceVisualizer();
    console.log('🕺 Dance Visualizer inicializado');
});
