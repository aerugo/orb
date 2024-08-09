import { explosionSynth, initAudio, shootSynth, startAudio, updateChord, updateVolume } from 'audio';
import * as THREE from 'three';
import { AdditiveBlending, ShaderMaterial } from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass';

let mouse, scene, camera, renderer, instancedMesh, clock, composer, bloomPass, raycaster, cameraDirection, isMouseDown;
let enemyGlowMaterial, explosionMaterial;
let moveForward = false, moveBackward = false, moveLeft = false, moveRight = false;
let projectiles = new Set();
let pattern1, pattern2, pattern3;
let explosions = [];
const TOTAL_SPHERES = 100000;
const UPDATE_INTERVAL = 0.1 // Update colors every 0.1 seconds
let mandelbulbPositions, spherePositions;
let interpolationFactor = 0;
let interpolationDirection = 1;
const INTERPOLATION_SPEED = 0.001;

// Enemy-related variables
let enemies = [];
const ENEMY_COUNT = 5;
const ENEMY_SPEED = 0.02;
const ENEMY_SIZE = 0.1;

function init() {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(110, window.innerWidth / window.innerHeight, 0.1, 1000);
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(window.devicePixelRatio);
    clock = new THREE.Clock();
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    // Create enemy glow material
    enemyGlowMaterial = new ShaderMaterial({
        uniforms: {
            time: { value: 0 },
            color: { value: new THREE.Color(0xff0000) },
            glowColor: { value: new THREE.Color(0xff5500) },
            glowIntensity: { value: 1.0 }
        },
        vertexShader: `
            varying vec3 vNormal;
            void main() {
                vNormal = normalize(normalMatrix * normal);
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform float time;
            uniform vec3 color;
            uniform vec3 glowColor;
            uniform float glowIntensity;
            varying vec3 vNormal;
            void main() {
                float pulse = sin(time * 5.0) * 0.5 + 0.5;
                float intensity = pow(0.8 - dot(vNormal, vec3(0, 0, 1.0)), 2.0);
                vec3 glow = mix(color, glowColor, intensity) * glowIntensity * pulse;
                gl_FragColor = vec4(glow, 1.0);
            }
        `,
        transparent: true
    });

    // Create explosion material
    explosionMaterial = new THREE.ShaderMaterial({
        uniforms: {
            time: { value: 0 },
        },
        vertexShader: `
            varying vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform float time;
            varying vec2 vUv;
            void main() {
                vec2 center = vec2(0.5, 0.5);
                float dist = distance(vUv, center);
                float ring = smoothstep(0.0, 0.5, dist) * smoothstep(0.5, 0.0, dist);
                vec3 color = vec3(1.0, 0.5, 0.0) * ring;
                float alpha = ring * (1.0 - dist * 2.0);
                gl_FragColor = vec4(color, alpha);
            }
        `,
        transparent: true,
        blending: AdditiveBlending,
    });

    initEnemies();

    // Initialize camera direction and mouse state
    cameraDirection = new THREE.Vector3(0, 0, -1);
    isMouseDown = false;

    // Initialize raycaster for projectile direction
    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();

    // Add mouse event listeners
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('mousemove', onMouseMove);

    // Lock pointer for first-person view
    renderer.domElement.requestPointerLock = renderer.domElement.requestPointerLock || renderer.domElement.mozRequestPointerLock;
    document.addEventListener('click', () => {
        renderer.domElement.requestPointerLock();
        fadeOutInstructions();
    });

    // Initialize audio
    initAudio();

    // Show instructions
    showInstructions();

    // Add event listeners for starting audio
    window.addEventListener('mousedown', async () => {
        await startAudio();
    });
    window.addEventListener('keydown', async (event) => {
        if (['w', 'a', 's', 'd', ' '].includes(event.key.toLowerCase())) {
            await startAudio();
        }
    });

    // Set up EffectComposer
    composer = new EffectComposer(renderer);
    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);

    // Add UnrealBloomPass
    bloomPass = new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        1.5,  // strength
        0.4,  // radius
        0.85  // threshold
    );
    composer.addPass(bloomPass);

    const sphereGeometry = new THREE.SphereGeometry(0.005, 8, 8);
    const material = new THREE.MeshPhongMaterial({
        color: new THREE.Color(),
        emissive: new THREE.Color(),
        emissiveIntensity: 0.5,
        shininess: 50
    });

    instancedMesh = new THREE.InstancedMesh(sphereGeometry, material, TOTAL_SPHERES);
    
    const matrix = new THREE.Matrix4();
    const color = new THREE.Color();

    mandelbulbPositions = [];
    spherePositions = [];

    for (let i = 0; i < TOTAL_SPHERES; i++) {
        const mandelbulbPos = mandelbulbPoint(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1);
        const spherePos = spherePoint();

        mandelbulbPositions.push(mandelbulbPos);
        spherePositions.push(spherePos);

        matrix.setPosition(...mandelbulbPos);
        instancedMesh.setMatrixAt(i, matrix);
        color.setHSL(Math.random(), 1, 0.5);
        instancedMesh.setColorAt(i, color);
    }

    scene.add(instancedMesh);

    // Add lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    const pointLight = new THREE.PointLight(0xffffff, 1);
    pointLight.position.set(5, 5, 5);
    scene.add(pointLight);

    camera.position.z = 2;
}

function mandelbulbPoint(x, y, z) {
    let [newX, newY, newZ] = [x, y, z];
    const maxIterations = 10;
    const power = 8;
    let dr = 1.0;
    let r = 0.0;

    for (let i = 0; i < maxIterations; i++) {
        r = Math.sqrt(newX*newX + newY*newY + newZ*newZ);
        if (r > 2) break;

        const theta = Math.acos(newZ / r);
        const phi = Math.atan2(newY, newX);
        dr = Math.pow(r, power - 1) * power * dr + 1.0;

        const zr = Math.pow(r, power);
        const sinTheta = Math.sin(theta * power);
        const cosTheta = Math.cos(theta * power);
        const sinPhi = Math.sin(phi * power);
        const cosPhi = Math.cos(phi * power);

        newX = zr * sinTheta * cosPhi + x;
        newY = zr * sinTheta * sinPhi + y;
        newZ = zr * cosTheta + z;
    }

    return [newX, newY, newZ];
}

function spherePoint() {
    const u = Math.random();
    const v = Math.random();
    const theta = 2 * Math.PI * u;
    const phi = Math.acos(2 * v - 1);
    const radius = 1.5; // Adjust this value to change the size of the hollow sphere

    const x = radius * Math.sin(phi) * Math.cos(theta);
    const y = radius * Math.sin(phi) * Math.sin(theta);
    const z = radius * Math.cos(phi);

    return [x, y, z];
}

let lastUpdateTime = 0;

function animate() {
    requestAnimationFrame(animate);
    const elapsedTime = clock.getElapsedTime();
    
    // Update colors and glow less frequently
    if (elapsedTime - lastUpdateTime > UPDATE_INTERVAL) {
        updateColorsAndGlow(elapsedTime);
        lastUpdateTime = elapsedTime;
    }

    // Interpolate between configurations
    interpolationFactor += INTERPOLATION_SPEED * interpolationDirection;
    if (interpolationFactor > 1 || interpolationFactor < 0) {
        interpolationDirection *= -1;
        interpolationFactor = Math.max(0, Math.min(1, interpolationFactor));
    }

    // Update the chord based on the interpolation factor and distance from center
    updateChord(interpolationFactor);

    // Handle movement
    const moveSpeed = 0.02; // Reduced from 0.05 to 0.02
    if (moveForward) camera.position.add(cameraDirection.clone().multiplyScalar(moveSpeed));
    if (moveBackward) camera.position.sub(cameraDirection.clone().multiplyScalar(moveSpeed));
    if (moveLeft) camera.position.sub(cameraDirection.clone().cross(camera.up).normalize().multiplyScalar(moveSpeed));
    if (moveRight) camera.position.add(cameraDirection.clone().cross(camera.up).normalize().multiplyScalar(moveSpeed));

    // Update camera direction
    camera.lookAt(camera.position.clone().add(cameraDirection));

    // Update volume based on distance from center
    const center = new THREE.Vector3(0, 0, 0);
    const distanceFromCenter = camera.position.distanceTo(center);
    updateVolume(distanceFromCenter);

    const matrix = new THREE.Matrix4();
    for (let i = 0; i < TOTAL_SPHERES; i++) {
        const [x1, y1, z1] = mandelbulbPositions[i];
        const [x2, y2, z2] = spherePositions[i];
        let x = x1 + (x2 - x1) * interpolationFactor;
        let y = y1 + (y2 - y1) * interpolationFactor;
        let z = z1 + (z2 - z1) * interpolationFactor;

        matrix.setPosition(x, y, z);
        instancedMesh.setMatrixAt(i, matrix);
    }
    instancedMesh.instanceMatrix.needsUpdate = true;

    instancedMesh.rotation.x += 0.001;
    instancedMesh.rotation.y += 0.002;

    // Update and render projectiles
    updateProjectiles();

    // Update and render enemies
    updateEnemies();

    // Update explosions
    updateExplosions();

    composer.render();
}

function updateProjectiles() {
    projectiles.forEach(projectile => {
        projectile.position.add(projectile.velocity);
        
        // Remove projectile if it's too far away
        if (projectile.position.length() > 100) {
            scene.remove(projectile);
            projectiles.delete(projectile);
        }
    });
}

function updateEnemies() {
    const time = clock.getElapsedTime();
    
    enemies.forEach(enemy => {
        // Move the enemy
        enemy.position.add(enemy.velocity);

        // Bounce off the edges of a cubic space
        const boundsSize = 2;
        ['x', 'y', 'z'].forEach(axis => {
            if (Math.abs(enemy.position[axis]) > boundsSize) {
                enemy.position[axis] = Math.sign(enemy.position[axis]) * boundsSize;
                enemy.velocity[axis] *= -1;
            }
        });

        // Rotate the enemy to face its movement direction
        enemy.lookAt(enemy.position.clone().add(enemy.velocity));

        // Update the glow effect
        enemy.material.uniforms.time.value = time;
        enemy.material.uniforms.glowIntensity.value = 1.0 + Math.sin(time * 2) * 0.5;

        // Check for collisions with projectiles
        projectiles.forEach(projectile => {
            if (enemy.position.distanceTo(projectile.position) < ENEMY_SIZE + 0.05) {
                // Enemy hit by projectile
                scene.remove(enemy);
                enemies = enemies.filter(e => e !== enemy);
                scene.remove(projectile);
                projectiles.delete(projectile);
                createExplosion(enemy.position);
            }
        });
    });
}

function createExplosion(position) {
    const explosionGeometry = new THREE.SphereGeometry(0.05, 32, 32);
    const explosion = new THREE.Mesh(explosionGeometry, explosionMaterial);
    explosion.position.copy(position);
    explosion.scale.set(0.1, 0.1, 0.1);
    scene.add(explosion);
    explosions.push({ mesh: explosion, startTime: clock.getElapsedTime() });

    // Play explosion sound
    explosionSynth.triggerAttackRelease("C1", "8n");
    
    // Add a quick pitch drop for more impact
    explosionSynth.frequency.setValueAtTime("C1", Tone.now());
    explosionSynth.frequency.exponentialRampToValueAtTime("A0", Tone.now() + 0.1);
}

function updateExplosions() {
    const currentTime = clock.getElapsedTime();
    explosions = explosions.filter(explosion => {
        const age = currentTime - explosion.startTime;
        if (age > 1) {
            scene.remove(explosion.mesh);
            return false;
        }
        const scale = Math.min(1, age * 4);
        explosion.mesh.scale.set(scale, scale, scale);
        explosion.mesh.material.opacity = 1 - age;
        return true;
    });
}

const projectileGeometry = new THREE.SphereGeometry(0.05, 16, 16);
const projectileMaterial = new THREE.MeshPhongMaterial({
    color: 0x0000ff,
    emissive: 0x0000ff,
    emissiveIntensity: 3,
    transparent: true,
    opacity: 0.8
});

function shootProjectile(raycaster) {
    const projectile = new THREE.Mesh(projectileGeometry, projectileMaterial);

    projectile.position.copy(camera.position);
    
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    projectile.velocity = raycaster.ray.direction.normalize().multiplyScalar(0.125);

    scene.add(projectile);
    projectiles.add(projectile);

    // Play the "blooooo" sound
    shootSynth.triggerAttackRelease("C4", "8n");
    shootSynth.frequency.rampTo("C2", 0.3);
}

// Mouse interaction removed

function updateColorsAndGlow(elapsedTime) {
    const matrix = new THREE.Matrix4();
    const color = new THREE.Color();

    for (let i = 0; i < TOTAL_SPHERES; i++) {
        instancedMesh.getMatrixAt(i, matrix);
        const position = new THREE.Vector3().setFromMatrixPosition(matrix);
        const [r, g, b] = getColor(position.x, position.y, position.z, elapsedTime);
        color.setRGB(r, g, b);
        instancedMesh.setColorAt(i, color);
    }
    instancedMesh.instanceColor.needsUpdate = true;
}

function getColor(x, y, z, time) {
    const distance = x*x + y*y + z*z;
    const maxDistance = 3; // maximum possible distance from center squared
    const t = distance / maxDistance; // normalized distance (0 to 1)

    // Create a cyclic effect based on time
    const cycle = (Math.sin(time * 0.5) + 1) * 0.5; // oscillates between 0 and 1

    // Generate colors based on position and time
    const r = (Math.sin(t * 6.28318 + cycle * 6.28318) + 1) * 0.5;
    const g = (Math.sin(t * 6.28318 + cycle * 6.28318 + 2.09439) + 1) * 0.5;
    const b = (Math.sin(t * 6.28318 + cycle * 6.28318 + 4.18879) + 1) * 0.5;

    return [r, g, b];
}

function showInstructions() {
    const instructions = document.getElementById('instructions');
    instructions.style.opacity = '1';
}

function fadeOutInstructions() {
    const instructions = document.getElementById('instructions');
    instructions.style.opacity = '0';
    setTimeout(() => {
        instructions.style.display = 'none';
    }, 2000); // Wait for the fade out transition to complete before hiding
}

function initEnemies() {
    const enemyGeometry = new THREE.IcosahedronGeometry(ENEMY_SIZE, 0);
    
    for (let i = 0; i < ENEMY_COUNT; i++) {
        const enemy = new THREE.Mesh(enemyGeometry, enemyGlowMaterial.clone());
        enemy.position.set(
            (Math.random() - 0.5) * 4,
            (Math.random() - 0.5) * 4,
            (Math.random() - 0.5) * 4
        );
        enemy.velocity = new THREE.Vector3(
            (Math.random() - 0.5) * ENEMY_SPEED,
            (Math.random() - 0.5) * ENEMY_SPEED,
            (Math.random() - 0.5) * ENEMY_SPEED
        );
        
        // Add a normal icosahedron inside for more depth
        const innerIcosahedron = new THREE.Mesh(
            new THREE.IcosahedronGeometry(ENEMY_SIZE * 0.8, 0),
            new THREE.MeshPhongMaterial({ color: 0xff0000 })
        );
        enemy.add(innerIcosahedron);
        
        scene.add(enemy);
        enemies.push(enemy);
    }
}

init();
animate();

function control() {
    window.addEventListener('resize', function() {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
        composer.setSize(window.innerWidth, window.innerHeight);
    });
    
    // Add event listeners for WASD controls
    window.addEventListener('keydown', function(event) {
        switch(event.key.toLowerCase()) {
            case 'w': moveForward = true; break;
            case 's': moveBackward = true; break;
            case 'a': moveLeft = true; break;
            case 'd': moveRight = true; break;
        }
    });
    
    window.addEventListener('keyup', function(event) {
        switch(event.key.toLowerCase()) {
            case 'w': moveForward = false; break;
            case 's': moveBackward = false; break;
            case 'a': moveLeft = false; break;
            case 'd': moveRight = false; break;
        }
    });
    
    window.addEventListener('keydown', function(event) {
        if (event.code === 'Space') {
            shootProjectile(raycaster);
        }
    });    
}

control();

function onMouseDown(event) {
    isMouseDown = true;
}

function onMouseUp(event) {
    isMouseDown = false;
}

function onMouseMove(event) {
    if (document.pointerLockElement === renderer.domElement) {
        const movementX = event.movementX || event.mozMovementX || event.webkitMovementX || 0;
        const movementY = event.movementY || event.mozMovementY || event.webkitMovementY || 0;

        const rotationSpeed = 0.002;
        const euler = new THREE.Euler(0, 0, 0, 'YXZ');
        euler.setFromQuaternion(camera.quaternion);

        euler.y -= movementX * rotationSpeed;
        euler.x -= movementY * rotationSpeed;

        // Clamp vertical rotation to avoid flipping
        euler.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, euler.x));

        camera.quaternion.setFromEuler(euler);
        cameraDirection.set(0, 0, -1).applyQuaternion(camera.quaternion);
    }
}
