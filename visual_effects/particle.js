function Particle(x, y, vx, vy) {
	this.pos = new p5.Vector(x, y);
	this.vel = new p5.Vector(vx, vy);
	this.vel.mult(random(10));
	this.vel.rotate(radians(random(-25, 25)));
	this.mass = random(1, 20);
	this.airDrag = random(0.92, 0.98);
	this.colorIndex = int(random(colorScheme.length));
	
	this.move = function() {
		this.vel.mult(this.airDrag);
		this.pos.add(this.vel);
	}
}