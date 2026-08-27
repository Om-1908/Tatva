import React, { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'

// Phase angle to color spectrum (matching Q-sphere phase wheel)
function phaseToHexColor(phaseRad) {
  let p = phaseRad % (2 * Math.PI)
  if (p < 0) p += 2 * Math.PI
  const hue = (p / (2 * Math.PI)) * 360
  const color = new THREE.Color()
  color.setHSL(hue / 360, 0.9, 0.55)
  return color.getHex()
}

// High-DPI Ultra-Sharp & Perfectly Balanced 3D Canvas Text Sprite Creation
function makeTextSprite(text, colorStr = '#81d4fa', fontSize = 80, scaleW = 1.4, scaleH = 0.7) {
  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = 512
  const ctx = canvas.getContext('2d')

  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.font = `Bold ${fontSize}px "JetBrains Mono", "Space Mono", "Consolas", monospace`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  // Crisp text shadow for pop contrast
  ctx.shadowColor = 'rgba(0, 0, 0, 0.95)'
  ctx.shadowBlur = 10
  ctx.shadowOffsetX = 0
  ctx.shadowOffsetY = 2

  ctx.fillStyle = colorStr
  ctx.fillText(text, canvas.width / 2, canvas.height / 2)

  const texture = new THREE.CanvasTexture(canvas)
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.generateMipmaps = false
  texture.needsUpdate = true

  const spriteMaterial = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
  })
  const sprite = new THREE.Sprite(spriteMaterial)
  sprite.scale.set(scaleW, scaleH, 1)
  return sprite
}

export default function Qsphere({ statevector, numQubits = 4 }) {
  const containerRef = useRef(null)
  const [showStateLabels, setShowStateLabels] = useState(true)
  const [showPhaseAngle, setShowPhaseAngle] = useState(false)

  useEffect(() => {
    if (!containerRef.current) return

    const width = containerRef.current.clientWidth || 400
    const height = containerRef.current.clientHeight || 240

    // Scene, Camera, Renderer
    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#16191d')

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000)
    camera.position.set(1.6, 1.3, 3.5)
    camera.lookAt(0, 0, 0)

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setSize(width, height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 3))
    
    // Clear existing canvas
    containerRef.current.innerHTML = ''
    containerRef.current.appendChild(renderer.domElement)

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.0)
    scene.add(ambientLight)
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.9)
    dirLight.position.set(5, 10, 7)
    scene.add(dirLight)

    // Main Group for Rotation
    const sphereGroup = new THREE.Group()
    scene.add(sphereGroup)

    // Outer Translucent Porcelain White Sphere
    const sphereRadius = 1.0
    const sphereGeo = new THREE.SphereGeometry(sphereRadius, 32, 24)
    const sphereMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.3,
      metalness: 0.1,
      transparent: true,
      opacity: 0.35,
    })
    const mainSphere = new THREE.Mesh(sphereGeo, sphereMat)
    sphereGroup.add(mainSphere)

    // White Wireframe Overlay
    const wireMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      wireframe: true,
      transparent: true,
      opacity: 0.2,
    })
    const wireSphere = new THREE.Mesh(sphereGeo, wireMat)
    sphereGroup.add(wireSphere)

    // Translucent Equatorial Plane Disc (Qiskit / Bloch Sphere Style)
    const discGeo = new THREE.CircleGeometry(sphereRadius, 64)
    const discMat = new THREE.MeshBasicMaterial({
      color: 0x94a3b8,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.12,
    })
    const discMesh = new THREE.Mesh(discGeo, discMat)
    discMesh.rotation.x = Math.PI / 2
    sphereGroup.add(discMesh)

    // Internal Axis Lines (X, Y, Z)
    const axisMat = new THREE.LineBasicMaterial({ color: 0x94a3b8, transparent: true, opacity: 0.8, linewidth: 2 })
    
    // X Axis line
    const xAxisGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-1.18, 0, 0), new THREE.Vector3(1.18, 0, 0)])
    sphereGroup.add(new THREE.Line(xAxisGeo, axisMat))

    // Y Axis line
    const yAxisGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, -1.18), new THREE.Vector3(0, 0, 1.18)])
    sphereGroup.add(new THREE.Line(yAxisGeo, axisMat))

    // Z Axis line
    const zAxisGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, -1.18, 0), new THREE.Vector3(0, 1.18, 0)])
    sphereGroup.add(new THREE.Line(zAxisGeo, axisMat))

    // Crisp & Balanced Axis Tip Labels (x, y, z)
    const xLabel = makeTextSprite('x', '#ffffff', 80, 1.3, 0.65)
    xLabel.position.set(1.30, 0, 0)
    sphereGroup.add(xLabel)

    const yLabel = makeTextSprite('y', '#ffffff', 80, 1.3, 0.65)
    yLabel.position.set(0, 0, 1.30)
    sphereGroup.add(yLabel)

    const zLabel = makeTextSprite('z', '#cbd5e1', 70, 1.1, 0.55)
    zLabel.position.set(0.18, 1.25, 0)
    sphereGroup.add(zLabel)

    // Balanced North |0> and South |1> Pole Labels (Moved clear of arrow heads)
    const northLabel = makeTextSprite('|0⟩', '#00e5ff', 90, 1.5, 0.75)
    northLabel.position.set(0, 1.42, 0)
    sphereGroup.add(northLabel)

    const southLabel = makeTextSprite('|1⟩', '#00e5ff', 90, 1.5, 0.75)
    southLabel.position.set(0, -1.42, 0)
    sphereGroup.add(southLabel)

    // Equatorial Ring
    const ringGeo = new THREE.RingGeometry(sphereRadius - 0.005, sphereRadius + 0.005, 64)
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x94a3b8, side: THREE.DoubleSide, opacity: 0.5, transparent: true })
    const eqRing = new THREE.Mesh(ringGeo, ringMat)
    eqRing.rotation.x = Math.PI / 2
    sphereGroup.add(eqRing)

    // Latitude Ring at 45 degrees
    const latGeo = new THREE.RingGeometry(0.707 - 0.005, 0.707 + 0.005, 64)
    const latRing = new THREE.Mesh(latGeo, ringMat)
    latRing.rotation.x = Math.PI / 2
    latRing.position.y = 0.707
    sphereGroup.add(latRing)

    const latRingSouth = latRing.clone()
    latRingSouth.position.y = -0.707
    sphereGroup.add(latRingSouth)

    // Calculate non-zero state components
    const n = Math.max(1, numQubits || 2)
    const totalStates = 1 << n

    const parsedAmps = []
    if (Array.isArray(statevector) && statevector.length > 0) {
      statevector.forEach((amp, idx) => {
        const real = amp?.real ?? (typeof amp === 'number' ? amp : 0)
        const imag = amp?.imag ?? 0
        const mag = Math.sqrt(real * real + imag * imag)
        const phase = Math.atan2(imag, real)
        if (mag > 0.001 || idx === 0) {
          parsedAmps.push({ idx, real, imag, mag, phase })
        }
      })
    } else {
      // Default ground state |0...0>
      parsedAmps.push({ idx: 0, real: 1, imag: 0, mag: 1, phase: 0 })
    }

    // Position state nodes on Q-sphere
    parsedAmps.forEach((item) => {
      const bitstring = item.idx.toString(2).padStart(n, '0')
      const onesCount = (bitstring.match(/1/g) || []).length
      
      // Latitude: theta angle based on Hamming weight
      const latAngle = Math.PI * (onesCount / n)
      const y = sphereRadius * Math.cos(latAngle)
      const ringRadius = sphereRadius * Math.sin(latAngle)

      // Longitude: phi angle spaced evenly among states with same Hamming weight
      const statesWithSameWeight = []
      for (let i = 0; i < totalStates; i++) {
        const b = i.toString(2).padStart(n, '0')
        if ((b.match(/1/g) || []).length === onesCount) {
          statesWithSameWeight.push(i)
        }
      }
      const weightIndex = statesWithSameWeight.indexOf(item.idx)
      const longAngle = (2 * Math.PI * weightIndex) / Math.max(1, statesWithSameWeight.length)

      const x = ringRadius * Math.sin(longAngle)
      const z = ringRadius * Math.cos(longAngle)

      const nodePos = new THREE.Vector3(x, y, z)
      const hexColor = phaseToHexColor(item.phase)

      // Vector Line from origin to node
      const lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), nodePos])
      const lineMat = new THREE.LineBasicMaterial({ color: hexColor, linewidth: 2 })
      const line = new THREE.Line(lineGeo, lineMat)
      sphereGroup.add(line)

      // Node Sphere (sized by magnitude)
      const nodeRadius = 0.05 + 0.08 * Math.min(1, item.mag)
      const nodeGeo = new THREE.SphereGeometry(nodeRadius, 16, 16)
      const nodeMat = new THREE.MeshStandardMaterial({
        color: hexColor,
        roughness: 0.2,
        metalness: 0.3,
        emissive: hexColor,
        emissiveIntensity: 0.4,
      })
      const nodeMesh = new THREE.Mesh(nodeGeo, nodeMat)
      nodeMesh.position.copy(nodePos)
      sphereGroup.add(nodeMesh)

      // Crisp 3D State Label (if enabled)
      if (showStateLabels) {
        const labelSprite = makeTextSprite(`|${bitstring}⟩`, '#81d4fa', 68, 1.3, 0.65)
        const labelPos = nodePos.clone().multiplyScalar(1.32)
        labelSprite.position.copy(labelPos)
        sphereGroup.add(labelSprite)
      }

      // Crisp 3D Phase Angle Label (if enabled)
      if (showPhaseAngle) {
        let pNorm = item.phase % (2 * Math.PI)
        if (pNorm < 0) pNorm += 2 * Math.PI
        const piFraction = (pNorm / Math.PI).toFixed(2)
        const phaseText = `φ=${piFraction}π`

        const phaseSprite = makeTextSprite(phaseText, '#76ff03', 60, 1.2, 0.6)
        const phasePos = nodePos.clone().multiplyScalar(showStateLabels ? 1.52 : 1.32)
        phaseSprite.position.copy(phasePos)
        sphereGroup.add(phaseSprite)
      }
    })

    // Interactive Drag Rotation
    let isDragging = false
    let prevMousePos = { x: 0, y: 0 }

    const onMouseDown = (e) => {
      isDragging = true
      prevMousePos = { x: e.clientX, y: e.clientY }
    }

    const onMouseMove = (e) => {
      if (!isDragging) return
      const deltaX = e.clientX - prevMousePos.x
      const deltaY = e.clientY - prevMousePos.y

      sphereGroup.rotation.y += deltaX * 0.008
      sphereGroup.rotation.x += deltaY * 0.008
      prevMousePos = { x: e.clientX, y: e.clientY }
    }

    const onMouseUp = () => {
      isDragging = false
    }

    const domElem = renderer.domElement
    domElem.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)

    // Animation Loop
    let animId
    const animate = () => {
      animId = requestAnimationFrame(animate)
      if (!isDragging) {
        sphereGroup.rotation.y += 0.003 // Slow continuous spin
      }
      renderer.render(scene, camera)
    }
    animate()

    // Handle Window and Container Resize dynamically via ResizeObserver
    const handleResize = () => {
      if (!containerRef.current) return
      const newW = containerRef.current.clientWidth
      const newH = containerRef.current.clientHeight
      if (newW > 0 && newH > 0) {
        camera.aspect = newW / newH
        camera.updateProjectionMatrix()
        renderer.setSize(newW, newH)
      }
    }

    const resizeObserver = new ResizeObserver(handleResize)
    resizeObserver.observe(containerRef.current)
    window.addEventListener('resize', handleResize)

    return () => {
      cancelAnimationFrame(animId)
      resizeObserver.disconnect()
      domElem.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      window.removeEventListener('resize', handleResize)
      if (containerRef.current) containerRef.current.innerHTML = ''
    }
  }, [statevector, numQubits, showStateLabels, showPhaseAngle])

  return (
    <div className="relative w-full h-full flex flex-col justify-between bg-[#16191d] rounded overflow-hidden select-none border border-[#262c33]">
      {/* 3D Canvas Container (Dynamically fills height) */}
      <div ref={containerRef} className="w-full flex-1 min-h-[220px] cursor-grab active:cursor-grabbing" />

      {/* Bottom Controls Bar */}
      <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between pointer-events-auto select-none">
        {/* Left Phase Color Wheel Legend */}
        <div className="relative w-14 h-14 flex items-center justify-center">
          <div
            className="w-11 h-11 rounded-full p-0.5 flex items-center justify-center shadow-lg"
            style={{
              background: 'conic-gradient(from 90deg, #00e5ff, #76ff03, #ff6e40, #e040fb, #00e5ff)',
            }}
          >
            <div className="w-7 h-7 rounded-full bg-[#16191d] flex items-center justify-center text-[7px] font-mono font-bold text-[#a8b2c1]">
              Phase
            </div>
          </div>
          <span className="absolute -top-0.5 text-[9px] font-mono text-[#a8b2c1]">π/2</span>
          <span className="absolute -right-2 text-[9px] font-mono text-[#a8b2c1]">0</span>
          <span className="absolute -bottom-0.5 text-[9px] font-mono text-[#a8b2c1]">3π/2</span>
          <span className="absolute -left-2 text-[9px] font-mono text-[#a8b2c1]">π</span>
        </div>

        {/* Right Checkbox Toggles */}
        <div className="flex flex-col gap-1 items-end text-xs text-[#a8b2c1]">
          <span className="text-[11px] font-medium text-[#8b949e]">Labels</span>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 cursor-pointer hover:text-white transition-colors">
              <input
                type="checkbox"
                checked={showStateLabels}
                onChange={(e) => setShowStateLabels(e.target.checked)}
                className="accent-[#29b6f6] rounded w-3.5 h-3.5 cursor-pointer"
              />
              <span>State</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer hover:text-white transition-colors">
              <input
                type="checkbox"
                checked={showPhaseAngle}
                onChange={(e) => setShowPhaseAngle(e.target.checked)}
                className="accent-[#29b6f6] rounded w-3.5 h-3.5 cursor-pointer"
              />
              <span>Phase angle</span>
            </label>
          </div>
        </div>
      </div>
    </div>
  )
}
