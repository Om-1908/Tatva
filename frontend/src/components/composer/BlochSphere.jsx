import React, { useEffect, useRef } from 'react'
import * as THREE from 'three'

// Calculate single qubit Bloch vector (x, y, z) for qubit k from N-qubit statevector
function getSingleQubitBlochVector(statevector, numQubits, qubitIndex) {
  const n = Math.max(1, numQubits || 1)
  const dim = 1 << n

  if (!Array.isArray(statevector) || statevector.length !== dim) {
    // Default ground state: q_k is |0>, so z = +1, x = 0, y = 0
    return { x: 0, y: 0, z: 1 }
  }

  let x = 0
  let y = 0
  let z = 0

  // Qubit index from right (LSB = 0)
  const shift = qubitIndex

  for (let i = 0; i < dim; i++) {
    const bit = (i >> shift) & 1
    const ampI = statevector[i] || { real: 0, imag: 0 }
    const rI = ampI.real ?? (typeof ampI === 'number' ? ampI : 0)
    const imI = ampI.imag ?? 0

    // Z expectation: Prob(bit=0) - Prob(bit=1)
    const probI = rI * rI + imI * imI
    z += bit === 0 ? probI : -probI

    // Off-diagonal terms for X & Y expectation: 2 * c_0* * c_1
    if (bit === 0) {
      const pairIdx = i | (1 << shift)
      const ampJ = statevector[pairIdx] || { real: 0, imag: 0 }
      const rJ = ampJ.real ?? (typeof ampJ === 'number' ? ampJ : 0)
      const imJ = ampJ.imag ?? 0

      // (rI - i*imI) * (rJ + i*imJ) = (rI*rJ + imI*imJ) + i*(rI*imJ - imI*rJ)
      x += 2 * (rI * rJ + imI * imJ)
      y += 2 * (rI * imJ - imI * rJ)
    }
  }

  return { x, y, z }
}

function SingleBlochCanvas({ qubitIndex, vector }) {
  const mountRef = useRef(null)

  useEffect(() => {
    if (!mountRef.current) return

    const width = mountRef.current.clientWidth || 180
    const height = mountRef.current.clientHeight || 180

    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#16191d')

    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100)
    camera.position.set(2.2, 1.6, 2.5)
    camera.lookAt(0, 0, 0)

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setSize(width, height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

    mountRef.current.innerHTML = ''
    mountRef.current.appendChild(renderer.domElement)

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8)
    scene.add(ambientLight)
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.6)
    dirLight.position.set(5, 8, 5)
    scene.add(dirLight)

    const group = new THREE.Group()
    scene.add(group)

    // Translucent Bloch Sphere Wireframe
    const radius = 1.0
    const sphereGeo = new THREE.SphereGeometry(radius, 32, 24)
    const sphereMat = new THREE.MeshStandardMaterial({
      color: 0x3b4858,
      wireframe: true,
      transparent: true,
      opacity: 0.25,
    })
    group.add(new THREE.Mesh(sphereGeo, sphereMat))

    // Equatorial ring
    const eqGeo = new THREE.RingGeometry(radius - 0.004, radius + 0.004, 64)
    const eqMat = new THREE.MeshBasicMaterial({ color: 0x546e7a, side: THREE.DoubleSide, transparent: true, opacity: 0.5 })
    const eqRing = new THREE.Mesh(eqGeo, eqMat)
    eqRing.rotation.x = Math.PI / 2
    group.add(eqRing)

    // Coordinate Axes (X: Red/Pink, Y: Green, Z: Blue/Cyan)
    const createAxis = (from, to, colorHex) => {
      const geo = new THREE.BufferGeometry().setFromPoints([from, to])
      const mat = new THREE.LineBasicMaterial({ color: colorHex, transparent: true, opacity: 0.6 })
      return new THREE.Line(geo, mat)
    }

    // X Axis (-X to +X)
    group.add(createAxis(new THREE.Vector3(-1.1, 0, 0), new THREE.Vector3(1.1, 0, 0), 0xf06292))
    // Y Axis (-Y to +Y) - Note: Three.js Y is UP, so we map Bloch Z to Three Y, Bloch Y to Three Z
    group.add(createAxis(new THREE.Vector3(0, 0, -1.1), new THREE.Vector3(0, 0, 1.1), 0x66bb6a))
    // Z Axis (-Z to +Z)
    group.add(createAxis(new THREE.Vector3(0, -1.1, 0), new THREE.Vector3(0, 1.1, 0), 0x29b6f6))

    // Bloch Vector Arrow (Three.js coordinates: Three X = Bloch X, Three Y = Bloch Z, Three Z = -Bloch Y)
    const vx = vector.x
    const vy = vector.z // Three Y is Bloch Z (North pole |0>)
    const vz = -vector.y // Three Z is -Bloch Y

    const targetPos = new THREE.Vector3(vx, vy, vz)
    const len = targetPos.length()

    if (len > 0.001) {
      // Shaft
      const arrowGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), targetPos])
      const arrowMat = new THREE.LineBasicMaterial({ color: 0x00e5ff, linewidth: 3 })
      group.add(new THREE.Line(arrowGeo, arrowMat))

      // Arrow Head Sphere
      const headGeo = new THREE.SphereGeometry(0.08, 16, 16)
      const headMat = new THREE.MeshStandardMaterial({
        color: 0x00e5ff,
        emissive: 0x00e5ff,
        emissiveIntensity: 0.6,
        roughness: 0.2,
      })
      const headMesh = new THREE.Mesh(headGeo, headMat)
      headMesh.position.copy(targetPos)
      group.add(headMesh)
    }

    // Rotation & Animation
    let isDragging = false
    let prevMouse = { x: 0, y: 0 }

    const onMouseDown = (e) => {
      isDragging = true
      prevMouse = { x: e.clientX, y: e.clientY }
    }
    const onMouseMove = (e) => {
      if (!isDragging) return
      const dx = e.clientX - prevMouse.x
      const dy = e.clientY - prevMouse.y
      group.rotation.y += dx * 0.01
      group.rotation.x += dy * 0.01
      prevMouse = { x: e.clientX, y: e.clientY }
    }
    const onMouseUp = () => {
      isDragging = false
    }

    const dom = renderer.domElement
    dom.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)

    let animId
    const animate = () => {
      animId = requestAnimationFrame(animate)
      if (!isDragging) {
        group.rotation.y += 0.003
      }
      renderer.render(scene, camera)
    }
    animate()

    return () => {
      cancelAnimationFrame(animId)
      dom.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      if (mountRef.current) mountRef.current.innerHTML = ''
    }
  }, [vector])

  return (
    <div className="flex flex-col items-center bg-[#191d24] p-2 rounded border border-[#262c33] shadow-md">
      <div className="flex items-center justify-between w-full text-xs font-mono px-1 pb-1">
        <span className="font-bold text-[#29b6f6]">q{qubitIndex}</span>
        <span className="text-[10px] text-[#8b949e]">
          x:{vector.x.toFixed(2)} y:{vector.y.toFixed(2)} z:{vector.z.toFixed(2)}
        </span>
      </div>
      <div ref={mountRef} className="w-full h-[180px] cursor-grab active:cursor-grabbing relative" />
    </div>
  )
}

export default function BlochSphere({ statevector, numQubits = 4 }) {
  const n = Math.max(1, numQubits || 1)
  const qubitIndices = Array.from({ length: n }, (_, i) => i)

  return (
    <div className="w-full h-full bg-[#16191d] rounded p-2 overflow-y-auto">
      <div
        className={`grid gap-3 w-full h-full ${
          n === 1
            ? 'grid-cols-1 max-w-[280px] mx-auto'
            : n === 2
            ? 'grid-cols-2'
            : 'grid-cols-2 md:grid-cols-2'
        }`}
      >
        {qubitIndices.map((qIdx) => {
          const vec = getSingleQubitBlochVector(statevector, n, qIdx)
          return <SingleBlochCanvas key={qIdx} qubitIndex={qIdx} vector={vec} />
        })}
      </div>
    </div>
  )
}
