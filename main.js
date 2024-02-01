import * as THREE from "./three.js";
import * as DAT from "./dat.js";
import { scene } from "./index.js";

/*
It's just F = cross(B, v) * q really
Note: y is the vertical direction where positive is up
*/

const vars = {
	x_a: 4.66,
	t_a: 0.5,
	x_b: 3.40,
	t_b: 0.645,
	str: -11,
	q: Math.log10(1.6e-19),
	m: Math.log10(9.1e-31),
	sep: 1,
	speed: 10,
	steps: 1000,
	timeStep: 0.01,
	colorbg: [255, 255, 255],
	colora: [255, 0, 0],
	colorb: [0, 0, 255]
};

// Used to simulate a body with force/vel/pos
class Body {
	constructor(pos, vel, mass) {
		this.pos = pos;
		this.vel = vel;
		this.mass = mass;
		this.force = new THREE.Vector3();
		this.t = 0;
	}
	step(stepSize) {
		this.pos.addScaledVector(this.vel, stepSize);
		const accel = this.force.clone().divideScalar(this.mass);
		this.vel.addScaledVector(accel, stepSize);
		this.t += stepSize;
	}
}

// Generates a path
function genPath(body, callback, steps, stepSize) {
	const path = [];
	for (let i = 0; i < steps; ++i) {
		if (isNaN(body.pos.x) || isNaN(body.pos.y) || isNaN(body.pos.z)) {
			console.warn("Went NaN at", i)
			break;
		}
		path.push(body.pos.clone());
		callback(body);
		body.step(stepSize);
	}
	return path;
}

// Adds a path to the scene
function addPath(path, color) {
	// console.log(path.map(i => `${i.x}, ${i.y}, ${i.z}`).join("\n"));
	const obj = new THREE.Object3D();
	{
		const geometry = new THREE.BoxGeometry(0.1, 0.1, 0.1);
		const material = new THREE.MeshPhongMaterial({ color });
		const cube = new THREE.Mesh(geometry, material);
		cube.position.copy(path[0]);
		obj.add(cube);
	} {
		const material = new THREE.LineBasicMaterial({
			color: color,
			linewidth: 5,
			linecap: "round",
			linejoin:  "round"
		});
		const geometry = new THREE.BufferGeometry().setFromPoints(path);
		const line = new THREE.Line(geometry, material);
		obj.add(line);
	}
	scene.add(obj);
	return obj;
}

// Actual driver code

function normDist(x, a, b) {
	const k = (x - a) / b;
	const o = Math.E ** (-0.5 * k * k)
	if (isNaN(o)) {
		console.warn(x, a, b, "gave NaN");
		return 0;
	}
	return o;
}
function callback(body) {
	// https://www.desmos.com/calculator/k922uf64rq
	const x_a = vars.x_a;
	const t_a = vars.t_a;
	const x_b = vars.x_b;
	const t_b = vars.t_b;
	const x = 3 - body.pos.y;
	const comDown = normDist(x, x_a, t_a);
	const comRadial = normDist(x, x_b, t_b) - normDist(x, x_b + (3 * t_b), t_b);
	const field = new THREE.Vector3(body.pos.x, 0, body.pos.z).normalize().multiplyScalar(comRadial);
	field.y = -comDown;
	field.multiplyScalar(10 ** vars.str);
	const force = field.cross(body.vel).multiplyScalar(body.charge)
	body.force.copy(force);
}

let objA, objB, objCoil;
function update_ab() {
	update_a();
	update_b();
	update_coil();
}
function update_a() {
	if (objA) scene.remove(objA);
	const bodyA = new Body(new THREE.Vector3(vars.sep / 2, 3, 0), new THREE.Vector3(0, -vars.speed, 0), 10 ** vars.m);
	bodyA.charge = -(10 ** vars.q);
	const pathA = genPath(bodyA, callback, vars.steps, vars.timeStep);
	objA = addPath(pathA, vars.colora[0] << 16 | vars.colora[1] << 8 | vars.colora[2]);
}
function update_b() {
	if (objB) scene.remove(objB);
	const bodyB = new Body(new THREE.Vector3(-vars.sep / 2, 3, 0), new THREE.Vector3(0, -vars.speed, 0), 10 ** vars.m);
	bodyB.charge = -(10 ** vars.q);
	const pathB = genPath(bodyB, callback, vars.steps, vars.timeStep);
	objB = addPath(pathB, vars.colorb[0] << 16 | vars.colorb[1] << 8 | vars.colorb[2]);
}
function update_coil() {
	if (objCoil) scene.remove(objCoil);
	const geometry = new THREE.TorusGeometry(vars.sep * 1.2, 0.2, 16, 100); 
	const material = new THREE.MeshPhysicalMaterial({ color: 0x888888, transparent: true, opacity: 0.2, side: THREE.DoubleSide });
	objCoil = new THREE.Mesh(geometry, material);
	objCoil.rotateX(Math.PI / 2);
	scene.add(objCoil);
}
update_ab();

// Setup a GUI to mess with variables

const gui = new DAT.GUI({
	name: "Magnetic Lens",
	domElement: document.getElementById("gui"),
	width: 300
});

{
	const folder_field = gui.addFolder("Magnetic Field");
		folder_field.open();
		folder_field.add(vars, "str", -20, 0).name("Strength OoM").onChange(update_ab);
		const folder_field_down = folder_field.addFolder("Down Component");
			folder_field_down.open();
			folder_field_down.add(vars, "x_a", 0, 10).name("Offset / m").onChange(update_ab);
			folder_field_down.add(vars, "t_a", 0, 10).name("Std Dev / m").onChange(update_ab);
		const folder_field_radial = folder_field.addFolder("Radial Component");
			folder_field_radial.open();
			folder_field_radial.add(vars, "x_b", 0, 10).name("Offset / m").onChange(update_ab);
			folder_field_radial.add(vars, "t_b", 0, 10).name("Std Dev / m").onChange(update_ab);
	const folder_particles = gui.addFolder("Particles");
		folder_particles.open();
		folder_particles.add(vars, "q", -40, -10).name("Charge OoM").onChange(update_ab);
		folder_particles.add(vars, "m", -40, -10).name("Mass OoM").onChange(update_ab);
		folder_particles.add(vars, "sep", 0.1, 10).name("Seperation / m").onChange(update_ab);
		folder_particles.add(vars, "speed", 0.1, 50).name("Down Vel / ms^-1").onChange(update_ab);
	const folder_sim = gui.addFolder("Simulation");
		folder_sim.open();
		folder_sim.add(vars, "steps", 1, 1e4, 1).name("Steps").onChange(update_ab);
		folder_sim.add(vars, "timeStep", 1e-6, 1).name("Time Step").onChange(update_ab);
	const folder_looks = gui.addFolder("Looks");
		folder_looks.open();
		folder_looks.addColor(vars, "colorbg").name("Background").onChange(() => {
			scene.background.r = vars.colorbg[0] / 255;
			scene.background.g = vars.colorbg[1] / 255;
			scene.background.b = vars.colorbg[2] / 255;
		});
		folder_looks.addColor(vars, "colora").name("Color A").onChange(update_a);
		folder_looks.addColor(vars, "colorb").name("Color B").onChange(update_b);
}