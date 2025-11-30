import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react';
import * as THREE from 'three';

const RubiksCube3D = forwardRef(({ onMoveComplete }, ref) => {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const cubiesRef = useRef([]);
  const isAnimatingRef = useRef(false);
  const pivotRef = useRef(null);

  // Dimensions
  const CUBE_SIZE = 1;
  const SPACING = 0.02;
  const TOTAL_SIZE = CUBE_SIZE + SPACING;

  useEffect(() => {
    if (!mountRef.current) return;

    // --- Setup Scene ---
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0f172a'); // matches slate-950
    sceneRef.current = scene;

    // --- Setup Camera ---
    const aspect = mountRef.current.clientWidth / mountRef.current.clientHeight;
    const camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 100);
    camera.position.set(5, 4, 6);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // --- Setup Renderer ---
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // --- Lighting ---
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1);
    dirLight.position.set(10, 20, 10);
    dirLight.castShadow = true;
    scene.add(dirLight);
    
    const fillLight = new THREE.DirectionalLight(0x818cf8, 0.5); // Indigo tint
    fillLight.position.set(-10, 0, -10);
    scene.add(fillLight);

    // --- Materials ---
    // Colors: Right(Red), Left(Orange), Up(White), Down(Yellow), Front(Green), Back(Blue)
    const colors = [
      0xb91c1c, // Right - Red
      0xea580c, // Left - Orange
      0xffffff, // Up - White
      0xfacc15, // Down - Yellow
      0x16a34a, // Front - Green
      0x2563eb, // Back - Blue
    ];

    const loader = new THREE.TextureLoader();
    // Creating materials for each face + black core
    const blackMat = new THREE.MeshStandardMaterial({ 
      color: 0x1e293b, 
      roughness: 0.6,
      metalness: 0.1
    });
    
    const faceMaterials = colors.map(c => new THREE.MeshStandardMaterial({ 
      color: c, 
      roughness: 0.2,
      metalness: 0.0,
      polygonOffset: true,
      polygonOffsetFactor: 1, // Push back slightly to avoid z-fighting if overlapping
      polygonOffsetUnits: 1
    }));

    // --- Build Cube ---
    const cubies = [];
    const geometry = new THREE.BoxGeometry(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE);

    // Helper to create a cubie with stickers
    // x, y, z are indices from -1 to 1
    for (let x = -1; x <= 1; x++) {
      for (let y = -1; y <= 1; y++) {
        for (let z = -1; z <= 1; z++) {
          const materials = [
            x === 1 ? faceMaterials[0] : blackMat,  // Right
            x === -1 ? faceMaterials[1] : blackMat, // Left
            y === 1 ? faceMaterials[2] : blackMat,  // Up
            y === -1 ? faceMaterials[3] : blackMat, // Down
            z === 1 ? faceMaterials[4] : blackMat,  // Front
            z === -1 ? faceMaterials[5] : blackMat, // Back
          ];

          const mesh = new THREE.Mesh(geometry, materials);
          
          // Position with spacing
          mesh.position.set(
            x * TOTAL_SIZE,
            y * TOTAL_SIZE,
            z * TOTAL_SIZE
          );
          
          // Store logical coordinates for filtering
          mesh.userData = { x, y, z, isAnimating: false };
          
          // Add slightly rounded edges effect (optional visual polish)
          const edges = new THREE.LineSegments(
            new THREE.EdgesGeometry(geometry),
            new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 })
          );
          mesh.add(edges);

          scene.add(mesh);
          cubies.push(mesh);
        }
      }
    }
    cubiesRef.current = cubies;

    // Pivot for rotation
    const pivot = new THREE.Object3D();
    pivot.rotation.order = 'XYZ'; // Important for predictable rotations
    scene.add(pivot);
    pivotRef.current = pivot;

    // --- Animation Loop ---
    let animationId;
    const animate = () => {
      animationId = requestAnimationFrame(animate);
      renderer.render(scene, camera);
    };
    animate();

    // --- Resize Handler ---
    const handleResize = () => {
      if (!mountRef.current) return;
      const width = mountRef.current.clientWidth;
      const height = mountRef.current.clientHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationId);
      if (mountRef.current && renderer.domElement) {
        mountRef.current.removeChild(renderer.domElement);
      }
      // Cleanup Three.js resources
      geometry.dispose();
      faceMaterials.forEach(m => m.dispose());
      blackMat.dispose();
      renderer.dispose();
    };
  }, []);

  // --- Camera Controls ---
  const isDragging = useRef(false);
  const previousMousePosition = useRef({ x: 0, y: 0 });
  
  // Spherical coordinates for camera
  // Initial pos: (5, 4, 6) -> r ≈ 8.77
  const radius = 9;
  const thetaRef = useRef(Math.atan2(5, 6)); // Horizontal angle
  const phiRef = useRef(Math.acos(4 / radius)); // Vertical angle (from y-axis)

  const updateCamera = () => {
    if (!cameraRef.current) return;
    const theta = thetaRef.current;
    const phi = phiRef.current;
    
    // Clamp phi to avoid flipping
    const clampedPhi = Math.max(0.1, Math.min(Math.PI - 0.1, phi));
    phiRef.current = clampedPhi;

    cameraRef.current.position.x = radius * Math.sin(clampedPhi) * Math.sin(theta);
    cameraRef.current.position.y = radius * Math.cos(clampedPhi);
    cameraRef.current.position.z = radius * Math.sin(clampedPhi) * Math.cos(theta);
    cameraRef.current.lookAt(0, 0, 0);
  };

  const handleMouseDown = (e) => {
    isDragging.current = true;
    previousMousePosition.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e) => {
    if (!isDragging.current) return;

    const deltaMove = {
      x: e.clientX - previousMousePosition.current.x,
      y: e.clientY - previousMousePosition.current.y
    };

    previousMousePosition.current = { x: e.clientX, y: e.clientY };

    // Rotate camera based on delta
    const rotateSpeed = 0.005;
    thetaRef.current -= deltaMove.x * rotateSpeed;
    phiRef.current -= deltaMove.y * rotateSpeed;

    updateCamera();
  };

  const handleMouseUp = () => {
    isDragging.current = false;
  };

  // --- Rotation Logic ---
  const rotateLayer = (axis, index, direction, duration = 300) => {
    if (isAnimatingRef.current) return Promise.resolve(false);
    isAnimatingRef.current = true;

    const pivot = pivotRef.current;
    const cubies = cubiesRef.current;
    const epsilon = 0.1;

    // 1. Identify cubies in the layer
    // We check the WORLD position of the cubies because they might have been rotated before
    const activeCubies = cubies.filter(mesh => {
      // Get world position
      const worldPos = new THREE.Vector3();
      mesh.getWorldPosition(worldPos);
      
      // Check if it lies on the axis/index we want
      // index is -1, 0, or 1.
      // Multiplied by TOTAL_SIZE to match world coords
      const targetPos = index * (1 + 0.02); // Approximate
      
      if (axis === 'x') return Math.abs(worldPos.x - targetPos) < 0.5;
      if (axis === 'y') return Math.abs(worldPos.y - targetPos) < 0.5;
      if (axis === 'z') return Math.abs(worldPos.z - targetPos) < 0.5;
      return false;
    });

    // 2. Attach to Pivot
    pivot.rotation.set(0, 0, 0);
    pivot.position.set(0, 0, 0);
    
    // We need to attach them to the pivot without moving them visually
    activeCubies.forEach(mesh => {
      pivot.attach(mesh);
    });

    // 3. Animate Pivot
    return new Promise((resolve) => {
      const startRotation = { value: 0 };
      const targetRotation = (Math.PI / 2) * direction; // 90 degrees
      
      const startTime = Date.now();

      const animateRotation = () => {
        const now = Date.now();
        const progress = Math.min((now - startTime) / duration, 1);
        
        // Ease out cubic
        const eased = 1 - Math.pow(1 - progress, 3);
        
        const currentAngle = targetRotation * eased;
        
        if (axis === 'x') pivot.rotation.x = currentAngle;
        if (axis === 'y') pivot.rotation.y = currentAngle;
        if (axis === 'z') pivot.rotation.z = currentAngle;

        if (progress < 1) {
          requestAnimationFrame(animateRotation);
        } else {
          // 4. Cleanup
          // Snap to exact angle
          if (axis === 'x') pivot.rotation.x = targetRotation;
          if (axis === 'y') pivot.rotation.y = targetRotation;
          if (axis === 'z') pivot.rotation.z = targetRotation;
          
          pivot.updateMatrixWorld();
          
          // Detach and put back to scene, keeping new transform
          activeCubies.forEach(mesh => {
             sceneRef.current.attach(mesh);
             // Round positions and rotations to prevent drift errors
             // Snap positions to grid to prevent drift affecting selection logic
             mesh.position.x = Math.round(mesh.position.x / 1.02) * 1.02;
             mesh.position.y = Math.round(mesh.position.y / 1.02) * 1.02;
             mesh.position.z = Math.round(mesh.position.z / 1.02) * 1.02;
             
             // Snap rotations to nearest 90 degrees to maintain axis alignment
             mesh.rotation.x = Math.round(mesh.rotation.x / (Math.PI/2)) * (Math.PI/2);
             mesh.rotation.y = Math.round(mesh.rotation.y / (Math.PI/2)) * (Math.PI/2);
             mesh.rotation.z = Math.round(mesh.rotation.z / (Math.PI/2)) * (Math.PI/2);

             mesh.updateMatrix();
          });
          
          pivot.rotation.set(0,0,0);
          isAnimatingRef.current = false;
          if(onMoveComplete) onMoveComplete();
          resolve(true);
        }
      };
      animateRotation();
    });
  };

  // Expose methods
  useImperativeHandle(ref, () => ({
    // U D L R F B notation
    // Axis: y(U/D), x(R/L), z(F/B)
    // Index: 1(U/R/F), -1(D/L/B)
    // Direction: -1 is clockwise looking from positive axis? Needs testing.
    
    // Standard Notation: Clockwise usually means looking AT the face.
    // U (Up): Rotate top layer (y=1) clockwise (looking from top). Rotation around Y axis. Negative direction in right-handed Y-up? 
    // Let's standardize: 
    // Right-handed system. 
    // Rotation around Y axis: + is Counter-Clockwise looking from top. - is Clockwise.
    
    rotateFace: (face, invert = false, duration = 300) => {
      // Map standard notation faces to axis/index/direction
      // Faces: U, D, L, R, F, B
      // Direction: 1 = CCW around axis, -1 = CW around axis (Standard Right Hand Rule)
      // Wait, "Clockwise" in Rubik's notation is relative to looking at the face.
      
      let axis, index, dir;
      
      // NOTE: These directions are tuned for Standard Rubik's Notation in a Three.js Right-Handed Coordinate System
      
      switch(face) {
        case 'R': // Right Face (x=1). Look from +x. CW is -x rotation.
          axis = 'x'; index = 1; dir = -1; 
          break;
        case 'L': // Left Face (x=-1). Look from -x. CW is +x rotation.
          axis = 'x'; index = -1; dir = 1; 
          break;
        case 'U': // Up Face (y=1). Look from +y. CW is -y rotation.
          axis = 'y'; index = 1; dir = -1;
          break;
        case 'D': // Down Face (y=-1). Look from -y. CW is +y rotation.
          axis = 'y'; index = -1; dir = 1; 
          break;
        case 'F': // Front Face (z=1). Look from +z. CW is -z rotation.
          axis = 'z'; index = 1; dir = -1; 
          break;
        case 'B': // Back Face (z=-1). Look from -z. CW is +z rotation.
          axis = 'z'; index = -1; dir = 1; 
          break;
        default: return Promise.resolve();
      }

      if (invert) dir *= -1; // Prime move (e.g. R')

      return rotateLayer(axis, index, dir, duration);
    },
    
    reset: () => {
       // Quick hack: just reload or re-mount. 
       // Better: Animate back or reset positions manually.
       // For simplicity in this version, we might just rely on the parent to remount if needed, 
       // or implement a hard reset logic here. 
       // Let's stick to simple moves for now.
    }
  }));

  return (
    <div 
      ref={mountRef} 
      className="w-full h-full cursor-move touch-none"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    />
  );
});

export default RubiksCube3D;
