/*
Based on:
Magical trail shader

Author:
  Jason Labbe

Site:
  jasonlabbe3d.com

Controls:
	- Move the mouse to create particles.
	- Hold the middle mouse button to fade away particles.
	- Press the right mouse button to display the underlying particle system.
*/

// If you get an error about max uniforms then you can decrease these 2 values :(
const MAX_PARTICLE_COUNT = 70;
const MAX_TRAIL_COUNT = 30;
const EFFECTS_STATE_KEY = "cloneDanceEffectsState";

var colorScheme = ["#E69F66", "#DF843A", "#D8690F", "#B1560D", "#8A430A"];
var shaded = true;
var theShader;
var shaderTexture;
var trail = [];
var particles = [];
let effectsLayerEl = null;
let lastInputX = null;
let lastInputY = null;
let lastActive = false;

function getEffectsLayer() {
	if (!effectsLayerEl) {
		effectsLayerEl = document.getElementById("effectsLayer");
	}
	return effectsLayerEl;
}

function readEffectsState() {
	const state = window[EFFECTS_STATE_KEY];
	if (!state || typeof state !== "object") {
		const hasLayer = !!getEffectsLayer();
		return hasLayer
			? { enabled: false, active: false, strength: 0, hasInput: false }
			: { enabled: true, active: true, strength: 1, hasInput: false };
	}
	return state;
}

function resizeEffectsCanvas(forcedWidth, forcedHeight) {
	if (typeof resizeCanvas !== "function") return;

	const layer = getEffectsLayer();
	const widthTarget = forcedWidth || (layer ? layer.clientWidth : windowWidth);
	const heightTarget = forcedHeight || (layer ? layer.clientHeight : windowHeight);

	if (!widthTarget || !heightTarget) return;

	resizeCanvas(widthTarget, heightTarget);

	if (shaderTexture && typeof shaderTexture.resizeCanvas === "function") {
		shaderTexture.resizeCanvas(widthTarget, heightTarget);
		shaderTexture.noStroke();
	} else if (shaderTexture) {
		shaderTexture = createGraphics(widthTarget, heightTarget, WEBGL);
		shaderTexture.noStroke();
	}
}

window.cloneDanceResizeEffects = resizeEffectsCanvas;

function preload() {
	theShader = new p5.Shader(this.renderer, vertShader, fragShader);
}

function setup() {
	pixelDensity(1);
	setAttributes("alpha", true);

	const layer = getEffectsLayer();
	const targetWidth = layer ? Math.max(1, layer.clientWidth) : min(windowWidth, windowHeight);
	const targetHeight = layer ? Math.max(1, layer.clientHeight) : min(windowWidth, windowHeight);
	let canvas = createCanvas(targetWidth, targetHeight, WEBGL);

	if (layer) {
		canvas.parent(layer);
	}

	canvas.addClass("effects-canvas");
	
	shaderTexture = createGraphics(width, height, WEBGL);
	shaderTexture.noStroke();
}

function draw() {
	const state = readEffectsState();
	const enabled = !!state.enabled;
	const active = enabled && !!state.active && (state.strength || 0) > 0.01;

	if (!enabled) {
		trail.length = 0;
		particles.length = 0;
		lastActive = false;
		clear();
		return;
	}

	const strength = Math.max(0, Math.min(1, state.strength || 0));
	const trailLimit = Math.max(6, Math.round(MAX_TRAIL_COUNT * (0.3 + 0.7 * strength)));
	const maxParticles = Math.max(10, Math.round(MAX_PARTICLE_COUNT * (0.4 + 0.6 * strength)));

	let inputX = mouseX;
	let inputY = mouseY;
	if (state.hasInput) {
		inputX = state.x * width;
		inputY = state.y * height;
	}

	const prevX = lastInputX === null ? inputX : lastInputX;
	const prevY = lastInputY === null ? inputY : lastInputY;
	lastInputX = inputX;
	lastInputY = inputY;

	background(0);
	noStroke();

	if (active) {
		// Trim end of trail.
		trail.push([inputX, inputY]);

		while (trail.length > trailLimit) {
			trail.splice(0, 1);
		}

		// Spawn particles.
		if (trail.length > 1 && particles.length < maxParticles) {
			let delta = new p5.Vector(inputX, inputY);
			delta.sub(prevX, prevY);
			const spawnThreshold = 6 + (1 - strength) * 10;
			if (delta.mag() > spawnThreshold) {
				delta.normalize();
				const boost = 1 + strength * 0.6;
				particles.push(new Particle(prevX, prevY, delta.x * boost, delta.y * boost));
			}
		}
	} else if (trail.length > 0) {
		// Slowly decay existing trail without generating new particles.
		trail.splice(0, 1);
	}

	lastActive = active;

	translate(-width / 2, -height / 2);
	
	// Move and kill particles.
	for (let i = particles.length - 1; i > -1; i--) {
		particles[i].move();
		if (particles[i].vel.mag() < 0.1) {
			particles.splice(i, 1);
		}
	}
	
	if (shaded) {
		// Display shader.
		shaderTexture.shader(theShader);
		
		let data = serializeSketch();

		theShader.setUniform("resolution", [width, height]);
		theShader.setUniform("trailCount", trail.length);
		theShader.setUniform("trail", data.trails);
		theShader.setUniform("particleCount", particles.length);
		theShader.setUniform("particles", data.particles);
		theShader.setUniform("colors", data.colors);

		shaderTexture.rect(0, 0, width, height);
		texture(shaderTexture);
		
		rect(0, 0, width, height);
	} else {
		// Display points.
		stroke(255, 200, 0);
		for (let i = 0; i < particles.length; i++) {
			point(particles[i].pos.x, particles[i].pos.y);
		}
		
		stroke(0, 255, 255);
		for (let i = 0; i < trail.length; i++) {
			point(trail[i][0], trail[i][1]);
		}
	}
}

function mousePressed() {
	if (mouseButton == RIGHT) {
		shaded = !shaded;
	}
}

function windowResized() {
	resizeEffectsCanvas();
}

function serializeSketch() {
	data = {"trails": [], "particles": [], "colors": []};
	
	for (let i = 0; i < trail.length; i++) {
		data.trails.push(
			map(trail[i][0], 0, width, 0.0, 1.0),
			map(trail[i][1], 0, height, 1.0, 0.0));
	}
	
	for (let i = 0; i < particles.length; i++) {
		data.particles.push(
			map(particles[i].pos.x, 0, width, 0.0, 1.0), 
			map(particles[i].pos.y, 0, height, 1.0, 0.0),
			particles[i].mass * particles[i].vel.mag() / 100)

		let itsColor = colorScheme[particles[i].colorIndex];
		data.colors.push(red(itsColor), green(itsColor), blue(itsColor));
	}
	
	return data;
}
