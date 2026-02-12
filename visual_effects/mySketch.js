/*
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

var colorScheme = ["#E69F66", "#DF843A", "#D8690F", "#B1560D", "#8A430A"];
var shaded = true;
var theShader;
var shaderTexture;
var trail = [];
var particles = [];

function preload() {
	theShader = new p5.Shader(this.renderer, vertShader, fragShader);
}

function setup() {
	pixelDensity(1);
	
  let canvas = createCanvas(
		min(windowWidth, windowHeight), 
		min(windowWidth, windowHeight), 
		WEBGL);
	
	canvas.canvas.oncontextmenu = () => false;  // Removes right-click menu.
	noCursor();
	
	shaderTexture = createGraphics(width, height, WEBGL);
	shaderTexture.noStroke();
}

function draw() {
	background(0);
	noStroke();
	
	// Trim end of trail.
	trail.push([mouseX, mouseY]);
	
	let removeCount = 1;
	if (mouseIsPressed && mouseButton == CENTER) {
		removeCount++;
	}
	
	for (let i = 0; i < removeCount; i++) {
		if (trail.length == 0) {
			break;
		}
		
		if (mouseIsPressed || trail.length > MAX_TRAIL_COUNT) {
			trail.splice(0, 1);
		}
	}
	
	// Spawn particles.
	if (trail.length > 1 && particles.length < MAX_PARTICLE_COUNT) {
		let mouse = new p5.Vector(mouseX, mouseY);
		mouse.sub(pmouseX, pmouseY);
		if (mouse.mag() > 10) {
			mouse.normalize();
			particles.push(new Particle(pmouseX, pmouseY, mouse.x, mouse.y));
		}
	}
	
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