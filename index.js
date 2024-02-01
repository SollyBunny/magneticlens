import * as THREE from "./three.js";

/*
Just the engine to create a scene and camera n stuff
*/

const sens = 0.01;

// Init

export const can = document.getElementById("can");
export const scene = new THREE.Scene();
export const render = new THREE.WebGLRenderer({ canvas: can });
export const camera = new THREE.PerspectiveCamera( 75, can.width / can.height, 0.1, 1000);

camera.rotation.order = "YXZ";
camera.dir = [0, 0];
camera.zoom = 20;
camera.zoomTarget = 20;
camera.target = new THREE.Vector3();

scene.background = new THREE.Color(0xFFFFFF);
{
	const light = new THREE.HemisphereLight(0xFFFFFF, 0x000000, 0.5)
	light.position.set(0, 100, 0);
	scene.add(light);
} {
	const light = new THREE.DirectionalLight( 0xffffff, 0.5 );
	scene.add(light);
}

// Resize

function resize() {
	render.setSize(can.clientWidth, can.clientHeight);
	camera.aspect = can.clientWidth / can.clientHeight;
	camera.updateProjectionMatrix();
}
resize();
window.addEventListener("resize", resize);

// Orbit ctrls

let dragStart = undefined;
function onMouseDown(event) {
	can.setPointerCapture(event.pointerId);
	dragStart = [camera.dir[0] + event.offsetX, camera.dir[1] + event.offsetY];
}
function onMouseMove(event) {
	if (!dragStart) return;
	camera.dir[0] = dragStart[0] - event.offsetX;
	camera.dir[1] = dragStart[1] - event.offsetY;
	if (camera.dir[1] > -0.1) {
		camera.dir[1] = -0.1;
		dragStart[1] = event.offsetY + camera.dir[1];
	} else if (camera.dir[1] * sens < Math.PI / -2 + 0.1) {
		camera.dir[1] = (Math.PI / -2 + 0.1) / sens;
		dragStart[1] = event.offsetY + camera.dir[1];
	}
}
function onMouseUp(event) {
	if (!dragStart) return;
	dragStart = undefined;
	can.releasePointerCapture(event.pointerId);
}
function onScroll(event) {
	camera.zoomTarget += event.deltaY / 10;
	if (camera.zoomTarget < 5)
		camera.zoomTarget = 5;
	else if (camera.zoomTarget > camera.far)
		camera.zoomTarget = camera.far;
}

can.addEventListener("pointerdown", onMouseDown);
can.addEventListener("pointermove", onMouseMove);
can.addEventListener("pointerup", onMouseUp);
can.addEventListener("pointercancel", onMouseUp);
can.addEventListener("wheel", onScroll, { passive: true });

let last = performance.now();
function frame() {
	if (performance.now() - last > 150) {
		last = performance.now();
		// console.log(camera.position, camera.zoom, camera.dir)
	}
	camera.zoom = (camera.zoomTarget + camera.zoom) / 2;
	camera.position.x = Math.sin( camera.dir[0] * sens) * Math.cos(camera.dir[1] * sens) * camera.zoom;
	camera.position.y = Math.sin(-camera.dir[1] * sens) * camera.zoom;
	camera.position.z = Math.cos( camera.dir[0] * sens) * Math.cos(camera.dir[1] * sens) * camera.zoom;
	camera.lookAt(camera.target.x, camera.target.y, camera.target.z);
	render.render(scene, camera);

	requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
