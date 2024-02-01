import * as THREE from "./three.js";
import * as DAT from "./dat.js";
import { scene, camera } from "./index.js";

/*
It's just F = cross(B, v) * q really
Note: y is the vertical direction where positive is up
*/

const defaults = {
	x_a: 4.49,
	t_a: 0.135,
	x_b: 3.355,
	t_b: 0.16,
	g_b: 13.7,
	str: -11,
	m: Math.log10(9.1e-31),
	mneg: false,
	q: Math.log10(1.6e-19),
	qneg: true,
	sep: 1,
	sepz: 0,
	sepy: 10,
	density: 0,
	speed: 10,
	steps: 1000,
	timeStep: 0.01,
	colorbg: [255, 255, 255],
	colora: [255, 0, 0],
	colorb: [0, 0, 255],
	showvel: false,
	showforce: false,
	showfield: false,
	arrowdensity: 2,
};
const vars = Object.assign({}, defaults);

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
	const g_b = vars.g_b;
	const x = 3 - body.pos.y / 5;
	const comDown = normDist(x, x_a, t_a);
	const comRadial = normDist(x, x_b, t_b) - normDist(x, x_b + (g_b * t_b), t_b);
	const dis = new THREE.Vector3(body.pos.x, 0, body.pos.z);
	const field = dis.normalize().multiplyScalar(comRadial);
	field.y = comDown;
	// const field = (new THREE.Vector3(3 * body.pos.x * body.pos.x, 3 * body.pos.y * body.pos.y, 3 * body.pos.z * body.pos.z)).multiplyScalar((1.256e-6 / (4 * Math.PI)) * (3 * 10**-2 / ((body.pos.y * body.pos.y + 9) ** (5/2))));
	body.field.copy(field);
	field.multiplyScalar(10 ** vars.str);
	field.multiplyScalar(1 / dis.length());
	// TODO .multiplyScalar(body.charge)
	const vel = body.vel.clone();
	vel.x *= 10;
	vel.y *= 10;
	const force = field.cross(vel).multiplyScalar(body.charge);
	body.force.copy(force);
}

// Generates a path
function genPath(body, callback, steps, stepSize) {
	const path = [];
	for (let i = 0; i < steps; ++i) {
		if (isNaN(body.pos.x) || isNaN(body.pos.y) || isNaN(body.pos.z)) {
			console.warn("Went NaN at", i)
			break;
		}
		if (body.pos.y < -vars.sepy) {
			body.pos.y = -vars.sepy;
			path.push({ pos: body.pos.clone() });
			break;
		}
		if (i % vars.arrowdensity === 0)
			path.push({ pos: body.pos.clone(), force: body.force.clone(), field: body.field.clone(), vel: body.vel.clone() });
		else
			path.push({ pos: body.pos.clone() });
		callback(body);
		body.step(stepSize);
	}
	return path;
}
// Turns path into an object
function objPath(path, color, opacity) {
	// console.log(path.map(i => `${i.x}, ${i.y}, ${i.z}`).join("\n"));
	const obj = new THREE.Object3D();
	const material = new THREE.LineBasicMaterial({
		color: color,
		transparent: true,
		opacity: opacity,
		linewidth: 5,
		linecap: "round",
		linejoin:  "round"
	});
	let geometry;
	if (path[0] && path[0].pos) {
		const pts = [];
		for (const pt of path) {
			pts.push(pt.pos);
			if (vars.showvel && pt.vel) {
				const length = pt.vel.length();
				if (length > 0.2) {
					const arrow = new THREE.ArrowHelper(pt.vel.normalize(), pt.pos, Math.log10(length), 0xFFFF00);
					obj.add(arrow);
				}
			}
			if (vars.showforce && pt.force) {
				const length = pt.force.length() / (10 ** vars.m);
				if (length > 0.2) {
					const arrow = new THREE.ArrowHelper(pt.force.normalize(), pt.pos, Math.log10(length), 0x0000FF);
					obj.add(arrow);
				}
			}
			if (vars.showfield && pt.field) {
				const length = pt.field.length();
				if (length > 0.2) {
					const arrow = new THREE.ArrowHelper(pt.field.normalize(), pt.pos, length, 0x00FF00);
					obj.add(arrow);
				}
			}
		}
		geometry = new THREE.BufferGeometry().setFromPoints(pts);
	} else {
		geometry = new THREE.BufferGeometry().setFromPoints(path);
	}
	if (geometry) {
		const line = new THREE.Line(geometry, material);
		obj.add(line);
	}
	return obj;
}

const e_graph_x = document.getElementById("graph-x");
const e_graph_y = document.getElementById("graph-y");
const e_graph_z = document.getElementById("graph-z");
const ctx_x = e_graph_x.getContext("2d");
const ctx_y = e_graph_y.getContext("2d");
const ctx_z = e_graph_z.getContext("2d");
let objRays, objCoil, objScreen;
function update_all() {
	update_rays();
	update_coil();
	update_screen();
}
function update_rays() {
	if (objRays) scene.remove(objRays);
	ctx_x.resetTransform(); ctx_y.resetTransform(); ctx_z.resetTransform();
	ctx_x.clearRect(0, 0, e_graph_x.width, e_graph_x.height);
	ctx_y.clearRect(0, 0, e_graph_y.width, e_graph_y.height);
	ctx_z.clearRect(0, 0, e_graph_z.width, e_graph_z.height);
	ctx_x.strokeStyle = ctx_y.strokeStyle = ctx_z.strokeStyle = "gray";
	ctx_x.lineWidth = ctx_y.lineWidth = ctx_z.lineWidth = 1;
	ctx_x.globalAlpha = ctx_y.globalAlpha = ctx_z.globalAlpha = 1;
	ctx_x.beginPath();
	ctx_x.moveTo(e_graph_x.width / 2, 0);
	ctx_x.lineTo(e_graph_x.width / 2, e_graph_x.height);
	ctx_x.moveTo(0, e_graph_x.height / 2);
	ctx_x.lineTo(e_graph_x.width, e_graph_x.height / 2);
	ctx_x.stroke();
	ctx_y.beginPath();
	ctx_y.moveTo(0, e_graph_y.height / 2);
	ctx_y.lineTo(e_graph_y.width, e_graph_y.height / 2);
	ctx_y.moveTo(e_graph_y.width / 2, 0);
	ctx_y.lineTo(e_graph_y.width / 2, e_graph_y.height);
	ctx_y.stroke();
	ctx_z.beginPath();
	ctx_z.moveTo(e_graph_z.width / 2, 0);
	ctx_z.lineTo(e_graph_z.width / 2, e_graph_z.height);
	ctx_z.moveTo(0, e_graph_z.height / 2);
	ctx_z.lineTo(e_graph_z.width, e_graph_z.height / 2);
	ctx_z.stroke();
	ctx_x.lineWidth = ctx_y.lineWidth = ctx_z.lineWidth = 2;
	ctx_x.translate(e_graph_x.width / 2, e_graph_x.height / 2);
	ctx_y.translate(e_graph_y.width / 2, e_graph_y.height / 2);
	ctx_z.translate(e_graph_z.width / 2, e_graph_z.height / 2);
	objRays = new THREE.Object3D();
	const num2 = vars.density < 1 || vars.sepz === 0 ? 1 : vars.sepz * vars.density;
	for (let j = 0; j <= num2; ++j) {
		const pathObj = [];
		const pathImg = [];
		const posA = new THREE.Vector3(vars.sep / 2, vars.sepy, vars.sepz * (j / num2) - vars.sepz / 2);
		const posB = new THREE.Vector3(-vars.sep / 2, vars.sepy, vars.sepz * (j / num2) - vars.sepz / 2);
		const num = vars.density < 1 || vars.sep === 0 ? 1 : vars.sep * vars.density;
		for (let i = 0; i <= num; ++i) {
			const pos = posA.clone().lerp(posB, i / num);
			const vel = new THREE.Vector3(0, -vars.speed, 0);
			const color = (
				Math.round(vars.colora[0] * i / num + vars.colorb[0] * (1 - i / num)) << 16 |
				Math.round(vars.colora[1] * i / num + vars.colorb[1] * (1 - i / num)) << 8 |
				Math.round(vars.colora[2] * i / num + vars.colorb[2] * (1 - i / num))
			);
			const opacity = i === 0 || i === num ? 1 : 0.3;
			pathObj.push(pos.clone());
			const body = new Body(pos, vel, (10 ** vars.m) * (vars.mneg ? -1 : 1));
			body.field = new THREE.Vector3();
			body.charge = (10 ** vars.q) * (vars.qneg ? -1 : 1);
			const path = genPath(body, callback, vars.steps, vars.timeStep);
			if (path[path.length - 1].pos.y <= vars.sepy) {
				pathImg.push(path[path.length - 1].pos);
			}
			{ // Draw can stuff
				let lastX, lastY, lastZ;
				ctx_x.strokeStyle = ctx_y.strokeStyle = ctx_z.strokeStyle = "#" + color.toString(16).padStart(6, "0");
				let minX = 0, maxX = 0, minY = 0, maxY = 0, minZ = 0, maxZ = 0;
				for (const pt of path) {
					const p = pt.pos;
					if (p.x < minX) minX = p.x; else if (p.x > maxX) maxX = p.x;
					if (p.y < minY) minY = p.y; else if (p.y > maxY) maxY = p.y;
					if (p.z < minZ) minZ = p.z; else if (p.z > maxZ) maxZ = p.z;
				}
				for (const pt of path) {
					const p = pt.pos;
					ctx_x.globalAlpha = ctx_y.globalAlpha = ctx_z.globalAlpha = opacity;
					let scale;
					scale = Math.min(e_graph_x.width / (maxX - minX), e_graph_x.height / (maxY - minY)) / 1.2;
					const curX = [p.x * scale, -p.y * scale];
					scale = Math.min(e_graph_y.width / (maxZ - minZ), e_graph_y.height / (maxY - minY)) / 1.2;
					const curY = [p.z * scale, -p.y * scale];
					scale = Math.min(e_graph_z.width / (maxZ - minZ), e_graph_z.height / (maxX - minX)) / 2;
					const curZ = [p.z * scale, p.x * scale];
					if (lastX) {
						ctx_x.beginPath();
						ctx_x.moveTo(...lastX);
						ctx_x.lineTo(...curX);
						ctx_x.stroke();
					}
					if (lastY) {
						ctx_y.beginPath();
						ctx_y.moveTo(...lastY);
						ctx_y.lineTo(...curY);
						ctx_y.stroke();
					}
					if (lastZ) {
						ctx_z.beginPath();
						ctx_z.moveTo(...lastZ);
						ctx_z.lineTo(...curZ);
						ctx_z.stroke();
					}
					lastX = curX; lastY = curY; lastZ = curZ;
				}
			}
			const obj = objPath(path, color, opacity);
			objRays.add(obj);
		}
		objRays.add(objPath(pathImg, 0, 1));
		objRays.add(objPath(pathObj, 0, 1));
	}
	scene.add(objRays);
}
function update_coil() {
	if (objCoil) scene.remove(objCoil);
	const geometry = new THREE.TorusGeometry(Math.max(vars.sep, vars.sepz) + 1, 0.2, 16, 100); 
	const material = new THREE.MeshPhysicalMaterial({ color: 0x888888, transparent: true, opacity: 0.2, side: THREE.DoubleSide });
	objCoil = new THREE.Mesh(geometry, material);
	objCoil.rotateX(Math.PI / 2);
	scene.add(objCoil);
}
function update_screen() {
	if (objScreen) scene.remove(objScreen);
	const geometry = new THREE.CircleGeometry(10, 200);
	const material = new THREE.MeshPhysicalMaterial({ color: 0x888888, transparent: true, opacity: 0.2, side: THREE.DoubleSide });
	objScreen = new THREE.Mesh(geometry, material);
	objScreen.rotateX(Math.PI / 2);
	objScreen.position.y = -vars.sepy - 0.1;
	scene.add(objScreen);
}

// Setup a GUI to mess with variables

const gui = new DAT.GUI({
	name: "Magnetic Lens",
	domElement: document.getElementById("gui"),
	width: 500
});

{
	const folder_field = gui.addFolder("Magnetic Field");
		folder_field.open();
		folder_field.add(vars, "str", -20, 0).name("Strength OoM").onChange(update_all);
		const folder_field_down = folder_field.addFolder("Down Component");
			folder_field_down.open();
			folder_field_down.add(vars, "x_a", -5, 10).name("Offset / m").onChange(update_all);
			folder_field_down.add(vars, "t_a", -5, 10).name("Std Dev / m").onChange(update_all);
		const folder_field_radial = folder_field.addFolder("Radial Component");
			folder_field_radial.open();
			folder_field_radial.add(vars, "x_b", -20, 20).name("Offset / m").onChange(update_all);
			folder_field_radial.add(vars, "t_b", -20, 20).name("Std Dev / m").onChange(update_all);
			folder_field_radial.add(vars, "g_b", -20, 20).name("Reverse Offset").onChange(update_all);
	const folder_particles = gui.addFolder("Particles");
		folder_particles.open();
		folder_particles.add(vars, "m", -40, -10).name("Mass OoM").onChange(update_all);
		folder_particles.add(vars, "mneg").name("Mass Negative?").onChange(update_all);
		folder_particles.add(vars, "q", -40, -10).name("Charge OoM").onChange(update_all);
		folder_particles.add(vars, "qneg").name("Charge Negative?").onChange(update_all);
		folder_particles.add(vars, "sep", 0, 10).name("Length / m").onChange(update_all);
		folder_particles.add(vars, "sepz", 0, 10).name("Width / m").onChange(update_all);
		folder_particles.add(vars, "sepy", 0.1, 100).name("Vertical Gap / m").onChange(update_all);
		folder_particles.add(vars, "density", 0, 100, 1).name("Density / m^-1").onChange(update_all);
		folder_particles.add(vars, "speed", 0.1, 50).name("Down Vel / ms^-1").onChange(update_all);
	const folder_sim = gui.addFolder("Simulation");
		folder_sim.open();
		folder_sim.add(vars, "steps", 1, 1e4, 1).name("Steps").onChange(update_all);
		folder_sim.add(vars, "timeStep", 1e-6, 1).name("Time Step").onChange(update_all);
	const folder_looks = gui.addFolder("Looks");
		folder_looks.open();
		folder_looks.add(vars, "showvel").name("Show Velocity").onChange(update_all);
		folder_looks.add(vars, "showfield").name("Show Field").onChange(update_all);
		folder_looks.add(vars, "showforce").name("Show Force").onChange(update_all);
		folder_looks.add(vars, "arrowdensity", 1, 15, 1).name("Arrow Density / m^-1").onChange(update_all)
		folder_looks.addColor(vars, "colorbg").name("Background").onChange(() => {
			scene.background.r = vars.colorbg[0] / 255;
			scene.background.g = vars.colorbg[1] / 255;
			scene.background.b = vars.colorbg[2] / 255;
		});
		folder_looks.addColor(vars, "colora").name("Color A").onChange(update_all);
		folder_looks.addColor(vars, "colorb").name("Color B").onChange(update_all);
		folder_looks.add(camera, "spin").name("Spin");
	const folder_presets = gui.addFolder("Presets");
		folder_presets.open();
		const dummy = { reset: false, e: false, mu: false, a: false };
		folder_presets.add(dummy, "reset").name("Reset").onChange(() => { dummy.reset = false; applyPreset(-1); });
		folder_presets.add(dummy, "e").name("Electron").onChange(() => { dummy.e = false; applyPreset(0); });
		folder_presets.add(dummy, "mu").name("Muon").onChange(() => { dummy.mu = false; applyPreset(1); });
		folder_presets.add(dummy, "a").name("Alpha").onChange(() => { dummy.a = false; applyPreset(2); });
}

function applyPreset(n) {
	switch (n) {
		case -1:
			Object.keys(defaults).forEach(i => {
				vars[i] = defaults[i];
			});
			break;
		case 0: // electron
			vars.m = Math.log10(9.1e-31),
			vars.mneg = false;
			vars.q = Math.log10(1.6e-19),
			vars.qneg = true;
			break;
		case 1: // muon
			vars.m = Math.log10(1.8e-28),
			vars.mneg = false;
			vars.q = Math.log10(1.6e-19),
			vars.qneg = true;
			break;
		case 2: // he 2-
			vars.m = Math.log10(6.64e-27),
			vars.mneg = false;
			vars.q = Math.log10(1.6e-19 * 2),
			vars.qneg = false;
	}
	gui.updateDisplay();
	update_all();
}
window.applyPreset = applyPreset;

function resize() {
	e_graph_x.width = e_graph_x.clientWidth; e_graph_x.height = e_graph_x.clientHeight;
	e_graph_y.width = e_graph_y.clientWidth; e_graph_y.height = e_graph_y.clientHeight;
	e_graph_z.width = e_graph_z.clientWidth; e_graph_z.height = e_graph_z.clientHeight;
	update_all();
}
window.addEventListener("resize", resize);
resize();

