import React, { useEffect, useRef } from 'react'
import * as THREE from 'three'

/**
 * High-performance Dedicated Three.js Visualizer per Step
 * Pre-loads immediately on mount so there is zero scroll delay.
 *
 * Step 0: Target State — Rotating Bloch Sphere with XYZ axes and cyan statevector arrow
 * Step 1: RL Agent Synthesis — 3D Quantum DAG/lattice with progressive path light pulse
 * Step 2: Evaluate & Visualize — 3D metric/fidelity bars growing upward with emissive tops
 * Step 3: Edit & Export — Isometric quantum chip unfolding upper layer to reveal quantum circuit
 */
export default function HowItWorksVisualizer({
  stepIndex = 0,
  activeStep = undefined,
  isActivated = false,
  isCurrentlyActive = false,
}) {
  const effectiveStep = stepIndex !== undefined ? stepIndex : (activeStep !== undefined ? activeStep : 0)
  const containerRef = useRef(null)
  const rendererRef = useRef(null)
  const frameIdRef = useRef(null)

  // Mutable animation state references for high 60fps performance without React re-renders
  const animStateRef = useRef({
    isDragging: false,
    prevMouse: { x: 0, y: 0 },
    userRotX: 0,
    userRotY: 0,
    pulseTime: 0,
    pathNodes: [],
    pathEdges: [],
    barGrowth: 0,
    bars: [],
    unfoldProgress: 0,
    topLayer: null,
    coreGroup: null,
  })

  const isActivatedRef = useRef(isActivated)
  useEffect(() => {
    isActivatedRef.current = isActivated
  }, [isActivated])

  const isCurrentlyActiveRef = useRef(isCurrentlyActive)
  useEffect(() => {
    isCurrentlyActiveRef.current = isCurrentlyActive
  }, [isCurrentlyActive])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const width = container.clientWidth || 280
    const height = container.clientHeight || 150

    // 1. Scene setup
    const scene = new THREE.Scene()

    // 2. Camera setup
    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100)
    camera.position.set(0, 1.2, 3.6)
    camera.lookAt(0, 0, 0)

    // 3. WebGL Renderer with transparent background and crisp pixel ratio
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    })
    renderer.setSize(width, height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.setClearColor(0x000000, 0)
    container.innerHTML = ''
    container.appendChild(renderer.domElement)
    rendererRef.current = renderer

    // 4. Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.85)
    scene.add(ambientLight)

    const dirLight1 = new THREE.DirectionalLight(0x22d3ee, 1.2)
    dirLight1.position.set(4, 6, 4)
    scene.add(dirLight1)

    const dirLight2 = new THREE.DirectionalLight(0x6366f1, 0.9)
    dirLight2.position.set(-4, -3, 3)
    scene.add(dirLight2)

    // Master container for interactive user rotation
    const masterGroup = new THREE.Group()
    scene.add(masterGroup)

    let modelGroup = new THREE.Group()

    // -------------------------------------------------------------
    // STEP 0: BLOCH SPHERE (Target State)
    // -------------------------------------------------------------
    if (effectiveStep === 0) {
      const sphereRadius = 0.95
      const sphereGeo = new THREE.SphereGeometry(sphereRadius, 24, 18)
      const sphereMat = new THREE.MeshStandardMaterial({
        color: 0x384556,
        wireframe: true,
        transparent: true,
        opacity: 0.35,
      })
      modelGroup.add(new THREE.Mesh(sphereGeo, sphereMat))

      // Equatorial Ring
      const eqGeo = new THREE.RingGeometry(sphereRadius - 0.005, sphereRadius + 0.005, 48)
      const eqMat = new THREE.MeshBasicMaterial({
        color: 0x22d3ee,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.5,
      })
      const eqRing = new THREE.Mesh(eqGeo, eqMat)
      eqRing.rotation.x = Math.PI / 2
      modelGroup.add(eqRing)

      // Coordinate Axes (X: Pink/Red, Y: Emerald, Z: Cyan)
      const makeAxis = (from, to, colorHex) => {
        const g = new THREE.BufferGeometry().setFromPoints([from, to])
        const m = new THREE.LineBasicMaterial({ color: colorHex, transparent: true, opacity: 0.7 })
        return new THREE.Line(g, m)
      }
      modelGroup.add(makeAxis(new THREE.Vector3(-1.15, 0, 0), new THREE.Vector3(1.15, 0, 0), 0xf43f5e)) // X
      modelGroup.add(makeAxis(new THREE.Vector3(0, 0, -1.15), new THREE.Vector3(0, 0, 1.15), 0x10b981)) // Y
      modelGroup.add(makeAxis(new THREE.Vector3(0, -1.15, 0), new THREE.Vector3(0, 1.15, 0), 0x22d3ee)) // Z

      // Target Bloch Statevector (|ψ⟩ in superposition)
      const targetBloch = new THREE.Vector3(0.68, 0.72, -0.42).normalize().multiplyScalar(sphereRadius)
      const arrowGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), targetBloch])
      const arrowMat = new THREE.LineBasicMaterial({ color: 0x00e5ff, linewidth: 3 })
      modelGroup.add(new THREE.Line(arrowGeo, arrowMat))

      // Arrow Head Glowing Sphere
      const headGeo = new THREE.SphereGeometry(0.08, 16, 16)
      const headMat = new THREE.MeshStandardMaterial({
        color: 0x00e5ff,
        emissive: 0x22d3ee,
        emissiveIntensity: 0.9,
        roughness: 0.1,
      })
      const headMesh = new THREE.Mesh(headGeo, headMat)
      headMesh.position.copy(targetBloch)
      modelGroup.add(headMesh)
    }

    // -------------------------------------------------------------
    // STEP 1: RL AGENT SYNTHESIS (Quantum Search Lattice DAG)
    // -------------------------------------------------------------
    else if (effectiveStep === 1) {
      const pathNodes = []
      const pathEdges = []

      const layerCount = 4
      const nodesPerLayer = [2, 3, 3, 2]
      const layerPositions = []

      const nodeGeo = new THREE.SphereGeometry(0.065, 12, 12)
      const baseNodeMat = new THREE.MeshStandardMaterial({
        color: 0x3b4858,
        emissive: 0x1e293b,
        roughness: 0.4,
      })

      const optimalPathIndices = [0, 1, 1, 0] // Optimal RL synthesis route

      for (let l = 0; l < layerCount; l++) {
        const x = (l - (layerCount - 1) / 2) * 0.72
        const count = nodesPerLayer[l]
        const currentLayer = []

        for (let n = 0; n < count; n++) {
          const y = (n - (count - 1) / 2) * 0.55
          const z = Math.sin(l * 1.5 + n) * 0.25
          const pos = new THREE.Vector3(x, y, z)

          const mesh = new THREE.Mesh(nodeGeo, baseNodeMat.clone())
          mesh.position.copy(pos)
          modelGroup.add(mesh)
          currentLayer.push({ pos, mesh, layer: l, index: n })

          if (n === optimalPathIndices[l]) {
            pathNodes.push(mesh)
          }
        }
        layerPositions.push(currentLayer)
      }

      // Connect adjacent layers with DAG edges
      for (let l = 0; l < layerCount - 1; l++) {
        const curr = layerPositions[l]
        const next = layerPositions[l + 1]

        for (let i = 0; i < curr.length; i++) {
          for (let j = 0; j < next.length; j++) {
            const isOptimal = (i === optimalPathIndices[l] && j === optimalPathIndices[l + 1])
            const geo = new THREE.BufferGeometry().setFromPoints([curr[i].pos, next[j].pos])
            const mat = new THREE.LineBasicMaterial({
              color: isOptimal ? 0x22d3ee : 0x27313f,
              transparent: true,
              opacity: isOptimal ? 0.9 : 0.25,
              linewidth: isOptimal ? 2 : 1,
            })
            const line = new THREE.Line(geo, mat)
            modelGroup.add(line)

            if (isOptimal) {
              pathEdges.push({ line, mat, layer: l })
            }
          }
        }
      }

      animStateRef.current.pathNodes = pathNodes
      animStateRef.current.pathEdges = pathEdges
    }

    // -------------------------------------------------------------
    // STEP 2: EVALUATE & VISUALIZE (3D Metric / Fidelity Bars)
    // -------------------------------------------------------------
    else if (effectiveStep === 2) {
      // Base Grid Platform
      const gridHelper = new THREE.GridHelper(1.8, 6, 0x22d3ee, 0x1f2937)
      gridHelper.position.y = -0.55
      modelGroup.add(gridHelper)

      const barConfigs = [
        { x: -0.52, maxH: 1.15, color: 0x22d3ee, emissive: 0x0891b2 },
        { x: 0, maxH: 0.85, color: 0x6366f1, emissive: 0x4338ca },
        { x: 0.52, maxH: 0.65, color: 0xa855f7, emissive: 0x7e22ce },
      ]

      const bars = []
      barConfigs.forEach((cfg) => {
        const barGeo = new THREE.BoxGeometry(0.28, 1, 0.28)
        barGeo.translate(0, 0.5, 0) // Bottom anchor

        const barMat = new THREE.MeshStandardMaterial({
          color: cfg.color,
          emissive: cfg.emissive,
          emissiveIntensity: 0.5,
          roughness: 0.2,
          metalness: 0.5,
          transparent: true,
          opacity: 0.9,
        })

        const mesh = new THREE.Mesh(barGeo, barMat)
        mesh.position.set(cfg.x, -0.55, 0)
        mesh.scale.set(1, 0.1, 1)
        modelGroup.add(mesh)

        // Glowing cap indicator
        const capGeo = new THREE.BoxGeometry(0.3, 0.04, 0.3)
        const capMat = new THREE.MeshBasicMaterial({ color: 0xffffff })
        const capMesh = new THREE.Mesh(capGeo, capMat)
        capMesh.position.y = 1
        mesh.add(capMesh)

        bars.push({ mesh, maxH: cfg.maxH })
      })

      animStateRef.current.bars = bars
      animStateRef.current.barGrowth = isActivatedRef.current ? 1 : 0.35
    }

    // -------------------------------------------------------------
    // STEP 3: EDIT & EXPORT (Isometric Unfolding Quantum Chip)
    // -------------------------------------------------------------
    else if (effectiveStep === 3) {
      modelGroup.rotation.x = 0.45
      modelGroup.rotation.y = -0.55

      // Base Circuit Board Wafer
      const baseChipGeo = new THREE.BoxGeometry(1.5, 0.08, 1.5)
      const baseChipMat = new THREE.MeshStandardMaterial({
        color: 0x111827,
        emissive: 0x0f172a,
        roughness: 0.3,
        metalness: 0.8,
      })
      const baseChip = new THREE.Mesh(baseChipGeo, baseChipMat)
      baseChip.position.y = -0.3
      modelGroup.add(baseChip)

      // Glowing Circuit Traces on Base
      const traceMat = new THREE.MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.75 })
      for (let i = -2; i <= 2; i++) {
        const traceGeo = new THREE.BoxGeometry(1.3, 0.01, 0.04)
        const trace = new THREE.Mesh(traceGeo, traceMat)
        trace.position.set(0, -0.25, i * 0.26)
        modelGroup.add(trace)
      }

      // Gate Blocks on Circuit (H, CNOT, RZ)
      const gateColors = [0x4f46e5, 0x22d3ee, 0x6366f1]
      for (let g = 0; g < 3; g++) {
        const gGeo = new THREE.BoxGeometry(0.24, 0.1, 0.2)
        const gMat = new THREE.MeshStandardMaterial({
          color: gateColors[g],
          emissive: gateColors[g],
          emissiveIntensity: 0.6,
          roughness: 0.2,
        })
        const gMesh = new THREE.Mesh(gGeo, gMat)
        gMesh.position.set((g - 1) * 0.42, -0.22, (g % 2 === 0 ? 0.12 : -0.15))
        modelGroup.add(gMesh)
      }

      // Top Unfolding Layer / Holographic Export Lid
      const topLayerGroup = new THREE.Group()
      topLayerGroup.position.set(0, -0.2, -0.75) // Pivot along back edge

      const topLidGeo = new THREE.BoxGeometry(1.5, 0.05, 1.5)
      topLidGeo.translate(0, 0, 0.75) // Move center relative to back pivot
      const topLidMat = new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        wireframe: true,
        transparent: true,
        opacity: 0.5,
      })
      const topLid = new THREE.Mesh(topLidGeo, topLidMat)
      topLayerGroup.add(topLid)
      modelGroup.add(topLayerGroup)

      // Inner Glowing Core / Beam
      const coreBeamGeo = new THREE.CylinderGeometry(0.12, 0.35, 0.8, 16)
      const coreBeamMat = new THREE.MeshBasicMaterial({
        color: 0x22d3ee,
        transparent: true,
        opacity: 0.4,
        wireframe: true,
      })
      const coreBeam = new THREE.Mesh(coreBeamGeo, coreBeamMat)
      coreBeam.position.set(0, 0.1, 0)
      const initialBeamScale = isActivatedRef.current ? 1 : 0.2
      coreBeam.scale.set(initialBeamScale, initialBeamScale, initialBeamScale)
      modelGroup.add(coreBeam)

      animStateRef.current.topLayer = topLayerGroup
      animStateRef.current.coreGroup = coreBeam
      animStateRef.current.unfoldProgress = isActivatedRef.current ? 1 : 0.15
    }

    masterGroup.add(modelGroup)

    // -------------------------------------------------------------
    // INTERACTIVE MOUSE / TOUCH DRAGGING
    // -------------------------------------------------------------
    const dom = renderer.domElement
    const onPointerDown = (e) => {
      animStateRef.current.isDragging = true
      animStateRef.current.prevMouse = {
        x: e.clientX || (e.touches && e.touches[0].clientX) || 0,
        y: e.clientY || (e.touches && e.touches[0].clientY) || 0,
      }
    }
    const onPointerMove = (e) => {
      if (!animStateRef.current.isDragging) return
      const curX = e.clientX || (e.touches && e.touches[0].clientX) || 0
      const curY = e.clientY || (e.touches && e.touches[0].clientY) || 0
      const dx = curX - animStateRef.current.prevMouse.x
      const dy = curY - animStateRef.current.prevMouse.y

      animStateRef.current.userRotY += dx * 0.015
      animStateRef.current.userRotX += dy * 0.015
      animStateRef.current.prevMouse = { x: curX, y: curY }
    }
    const onPointerUp = () => {
      animStateRef.current.isDragging = false
    }

    dom.addEventListener('mousedown', onPointerDown)
    window.addEventListener('mousemove', onPointerMove)
    window.addEventListener('mouseup', onPointerUp)

    dom.addEventListener('touchstart', onPointerDown, { passive: true })
    window.addEventListener('touchmove', onPointerMove, { passive: true })
    window.addEventListener('touchend', onPointerUp)

    // -------------------------------------------------------------
    // ANIMATION LOOP (Smooth, preloaded 60fps)
    // -------------------------------------------------------------
    let clock = new THREE.Clock()

    const animate = () => {
      frameIdRef.current = requestAnimationFrame(animate)
      const delta = clock.getDelta()
      const time = clock.getElapsedTime()

      const isAct = isActivatedRef.current

      // Apply user drag rotation
      masterGroup.rotation.y = animStateRef.current.userRotY
      masterGroup.rotation.x = animStateRef.current.userRotX

      // Step 0: Auto-rotation for Bloch sphere
      if (effectiveStep === 0) {
        if (!animStateRef.current.isDragging) {
          modelGroup.rotation.y += 0.012
          modelGroup.rotation.x = Math.sin(time * 0.8) * 0.08 + 0.1
        }
      }
      // Step 1: RL DAG Pulse animation along optimal path
      else if (effectiveStep === 1) {
        animStateRef.current.pulseTime += delta * 2.2
        const pPhase = animStateRef.current.pulseTime % 4

        const pNodes = animStateRef.current.pathNodes
        const pEdges = animStateRef.current.pathEdges

        pNodes.forEach((nodeMesh, idx) => {
          const dist = Math.abs(pPhase - idx)
          const intensity = Math.max(0.25, 1.0 - dist * 0.8)
          nodeMesh.material.color.setHex(intensity > 0.6 ? 0x22d3ee : 0x4f46e5)
          nodeMesh.material.emissive.setHex(0x00e5ff)
          nodeMesh.material.emissiveIntensity = intensity * 1.5
          nodeMesh.scale.setScalar(1 + intensity * 0.35)
        })

        pEdges.forEach((edgeObj) => {
          const edgeDist = Math.abs(pPhase - (edgeObj.layer + 0.5))
          edgeObj.mat.opacity = Math.max(0.25, 1.0 - edgeDist * 0.7)
        })

        if (!animStateRef.current.isDragging) {
          modelGroup.rotation.y = Math.sin(time * 0.6) * 0.2
        }
      }
      // Step 2: Metric bars growing upward
      else if (effectiveStep === 2) {
        const targetGrowth = isAct ? 1 : 0.35
        animStateRef.current.barGrowth += (targetGrowth - animStateRef.current.barGrowth) * 0.08

        animStateRef.current.bars.forEach((bar, bIdx) => {
          const targetH = bar.maxH * animStateRef.current.barGrowth
          bar.mesh.scale.y = Math.max(0.08, targetH + Math.sin(time * 2 + bIdx) * 0.02)
        })

        if (!animStateRef.current.isDragging) {
          modelGroup.rotation.y = Math.sin(time * 0.5) * 0.25 + 0.2
        }
      }
      // Step 3: Unfolding Isometric Circuit Chip
      else if (effectiveStep === 3) {
        const targetUnfold = isAct ? 1 : 0.15
        animStateRef.current.unfoldProgress += (targetUnfold - animStateRef.current.unfoldProgress) * 0.06

        const unfoldAngle = animStateRef.current.unfoldProgress * -1.2
        if (animStateRef.current.topLayer) {
          animStateRef.current.topLayer.rotation.x = unfoldAngle
        }

        if (animStateRef.current.coreGroup) {
          const beamScale = animStateRef.current.unfoldProgress
          animStateRef.current.coreGroup.scale.set(beamScale, beamScale, beamScale)
          animStateRef.current.coreGroup.rotation.y += 0.02
        }

        if (!animStateRef.current.isDragging) {
          modelGroup.rotation.y = -0.55 + Math.sin(time * 0.7) * 0.15
        }
      }

      renderer.render(scene, camera)
    }

    animate()

    // Resize observer
    const resizeObserver = new ResizeObserver(() => {
      if (!container) return
      const w = container.clientWidth
      const h = container.clientHeight || 150
      if (w > 0 && h > 0) {
        camera.aspect = w / h
        camera.updateProjectionMatrix()
        renderer.setSize(w, h)
      }
    })
    resizeObserver.observe(container)

    return () => {
      resizeObserver.disconnect()
      if (frameIdRef.current) cancelAnimationFrame(frameIdRef.current)
      dom.removeEventListener('mousedown', onPointerDown)
      window.removeEventListener('mousemove', onPointerMove)
      window.removeEventListener('mouseup', onPointerUp)
      dom.removeEventListener('touchstart', onPointerDown)
      window.removeEventListener('touchmove', onPointerMove)
      window.removeEventListener('touchend', onPointerUp)

      if (rendererRef.current) {
        rendererRef.current.dispose()
        if (container.contains(rendererRef.current.domElement)) {
          container.removeChild(rendererRef.current.domElement)
        }
      }

      scene.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose()
        if (obj.material) {
          if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose())
          else obj.material.dispose()
        }
      })
    }
  }, [effectiveStep])

  return (
    <div
      ref={containerRef}
      className="w-full h-full cursor-grab active:cursor-grabbing select-none"
      title="Drag to rotate 3D visualization"
    />
  )
}
