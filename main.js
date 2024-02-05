import * as THREE from "./three.js";
import * as DAT from "./dat.js";
import { scene, camera } from "./index.js";

/*
It's just F = cross(B, v) * q really
Note: y is the vertical direction where positive is up
*/

const defaults = {
	x_a: -0.614,
	t_a: 1.62,
	x_b: -1.9,
	t_b: 0.84,
	g_b: 5.09,
	str: -11,
	m: Math.log10(9.1e-31),
	mneg: false,
	q: Math.log10(1.6e-19),
	qneg: true,
	sep: 1,
	sepz: 0,
	sepy: 10,
	density: 0,
	speed: 5,
	steps: 1000,
	timeStep: 0.01,
	colorbg: [255, 255, 255],
	colora: [255, 0, 0],
	colorb: [0, 0, 255],
	colorvel: [255, 255, 0],
	colorforce: [0, 255, 0],
	colorfield: [255, 0, 0],
	showglobalfield: false,
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

function rgb2hex(r, g, b) {
	if (r.length) {
		g = r[1];
		b = r[2];
		r = r[0];
	}
	return (Math.floor(r) << 16) + (Math.floor(g) << 8) + Math.floor(b);
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
function fieldAt(pos) {
	const x_a = vars.x_a;
	const t_a = vars.t_a;
	const x_b = vars.x_b;
	const t_b = vars.t_b;
	const g_b = vars.g_b;
	const x = pos.y;
	const dis = new THREE.Vector3(pos.x, 0, pos.z);
	const length = dis.length();
	const multi = normDist(length, -2, 1) + normDist(length, 2, 1);
	if (multi < 1e-20) return new THREE.Vector3();
	const comDown = normDist(x, x_a, t_a);
	const comRadial = normDist(x, x_b + (g_b * t_b), t_b) - normDist(x, x_b, t_b);
	const field = dis.clone().multiplyScalar(comRadial);
	field.y = comDown;
	field.normalize();
	field.multiplyScalar(multi);
	field.multiplyScalar(10 ** vars.str);
	return field;
}
function callback(body) {
	const field = fieldAt(body.pos);
	body.field.copy(field);
	const vel = body.vel.clone();
	const force = field.cross(vel).multiplyScalar(body.charge);
	// force.x *= 10;
	// force.z *= 10;
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
	let maxvel = 0, maxforce = 0, maxfield = 0;
	for (const pt of path) {
		if (vars.showvel && pt.vel) {
			const length = pt.vel.length();
			if (length > maxvel) maxvel = length;
		}
		if (vars.showforce && pt.force) {
			const length = pt.force.length();
			if (length > maxforce) maxforce = length;
		}
		if (vars.showfield && pt.field) {
			const length = pt.field.length();
			if (length > maxfield) maxfield = length;
		}
	}
	if (path[0] && path[0].pos) {
		const pts = [];
		for (const pt of path) {
			pts.push(pt.pos);
			if (vars.showvel && pt.vel) {
				const length = pt.vel.length() / maxvel;
				if (length > 0.1) {
					const arrow = new THREE.ArrowHelper(pt.vel.normalize(), pt.pos, length, rgb2hex(vars.colorvel));
					obj.add(arrow);
				}
			}
			if (vars.showforce && pt.force) {
				const length = pt.force.length() / maxforce;
				if (length > 0.1) {
					const arrow = new THREE.ArrowHelper(pt.force.normalize(), pt.pos, length, rgb2hex(vars.colorforce));
					obj.add(arrow);
				}
			}
			if (vars.showfield && pt.field) {
				const length = pt.field.length() / maxfield;
				if (length > 0.1) {
					const arrow = new THREE.ArrowHelper(pt.field.normalize(), pt.pos, length, rgb2hex(vars.colorfield));
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
let objRays, objCoil, objScreen, objGlobalfield;
function update_all() {
	update_rays();
	update_coil();
	update_screen();
}
function update_allall() {
	update_all();
	update_globalfield();
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
			const color = rgb2hex(
				vars.colora[0] * i / num + vars.colorb[0] * (1 - i / num),
				vars.colora[1] * i / num + vars.colorb[1] * (1 - i / num),
				vars.colora[2] * i / num + vars.colorb[2] * (1 - i / num)
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
function update_globalfield() {
	if (objGlobalfield) scene.remove(objGlobalfield);
	if (!vars.showglobalfield) return;
	const obj = new THREE.Object3D();
	const r = (Math.max(vars.sep, vars.sepz) + 1) * 2;
	let maxfield = 0;
	const step = 2;
	for (let x = -r; x <= r; x += step * 2) {
		for (let y = -r; y <= r; y += step * 4) {
			for (let z = -r; z <= r; z += step * 2) {
				const field = fieldAt(new THREE.Vector3(x, y, z));
				const length = field.length();
				if (length > maxfield) maxfield = length;
			}
		}
	}
	for (let x = -r; x <= r; x += step) {
		for (let y = -r; y <= r; y += step) {
			for (let z = -r; z <= r; z += step) {
				const pos = new THREE.Vector3(x, y, z);
				const field = fieldAt(pos);
				const length = Math.min(1, field.length() / maxfield);
				if (length > 0.05) {
					const arrow = new THREE.ArrowHelper(field.normalize(), pos, length, rgb2hex(vars.colorfield));
					obj.add(arrow);
				}
			}
		}
	}
	objGlobalfield = obj;
	scene.add(obj);
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
		folder_field.add(vars, "str", -50, 50).name("Strength OoM").onChange(update_all);
		const folder_field_down = folder_field.addFolder("Down Component");
			folder_field_down.open();
			folder_field_down.add(vars, "x_a", -50, 50).name("Offset / m").onChange(update_allall);
			folder_field_down.add(vars, "t_a", -50, 50).name("Std Dev / m").onChange(update_allall);
		const folder_field_radial = folder_field.addFolder("Radial Component");
			folder_field_radial.open();
			folder_field_radial.add(vars, "x_b", -50, 50).name("Offset / m").onChange(update_allall);
			folder_field_radial.add(vars, "t_b", -50, 50).name("Std Dev / m").onChange(update_allall);
			folder_field_radial.add(vars, "g_b", -50, 50).name("Reverse Offset").onChange(update_allall);
	const folder_particles = gui.addFolder("Particles");
		folder_particles.open();
		folder_particles.add(vars, "m", -40, -10).name("Mass OoM").onChange(update_all);
		folder_particles.add(vars, "mneg").name("Mass Negative?").onChange(update_all);
		folder_particles.add(vars, "q", -40, -10).name("Charge OoM").onChange(update_all);
		folder_particles.add(vars, "qneg").name("Charge Negative?").onChange(update_all);
		folder_particles.add(vars, "sep", 0, 20).name("Length / m").onChange(update_all);
		folder_particles.add(vars, "sepz", 0, 20).name("Width / m").onChange(update_all);
		folder_particles.add(vars, "sepy", 0.1, 100).name("Vertical Gap / m").onChange(update_all);
		folder_particles.add(vars, "density", 0, 100, 1).name("Density / m^-1").onChange(update_all);
		folder_particles.add(vars, "speed", 0.1, 100).name("Down Vel / ms^-1").onChange(update_all);
	const folder_sim = gui.addFolder("Simulation");
		folder_sim.open();
		folder_sim.add(vars, "steps", 1, 1e4, 1).name("Steps").onChange(update_all);
		folder_sim.add(vars, "timeStep", 1e-6, 1).name("Time Step").onChange(update_all);
	const folder_looks = gui.addFolder("Looks");
		folder_looks.open();
		folder_looks.add(vars, "showglobalfield").name("Show Global Field").onChange(update_globalfield);
		folder_looks.add(vars, "showvel").name("Show Velocity").onChange(update_all);
		folder_looks.add(vars, "showfield").name("Show Field").onChange(update_all);
		folder_looks.add(vars, "showforce").name("Show Force").onChange(update_all);
		folder_looks.add(vars, "arrowdensity", 1, 15, 1).name("Arrow Density / m^-1").onChange(update_all);
		folder_looks.addColor(vars, "colorvel").name("Vel Color").onChange(update_all);
		folder_looks.addColor(vars, "colorfield").name("Field Color").onChange(update_all);
		folder_looks.addColor(vars, "colorforce").name("Force Color").onChange(update_all);
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

