import { useEffect, useRef } from 'react'
import * as THREE from 'three'

const QuantumSphere = () => {
  const containerRef = useRef(null)
  const rendererRef = useRef(null)
  const frameRef = useRef(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const width = container.clientWidth || 800
    const height = container.clientHeight || 400

    // Scene
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000)
    camera.position.z = 10

    // Renderer
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true })
    renderer.setSize(width, height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    container.appendChild(renderer.domElement)
    rendererRef.current = renderer

    // Group
    const group = new THREE.Group()
    scene.add(group)

    // Quantum Core - Glowing Sphere
    const coreGeom = new THREE.SphereGeometry(1.2, 32, 32)
    const coreMat = new THREE.MeshPhongMaterial({
      color: 0x6366f1,
      emissive: 0x4f46e5,
      emissiveIntensity: 0.5,
      transparent: true,
      opacity: 0.8,
      shininess: 100,
    })
    const core = new THREE.Mesh(coreGeom, coreMat)
    group.add(core)

    // Inner Rings (Rotating)
    const ringGeom = new THREE.TorusGeometry(2, 0.05, 16, 100)
    const ringMat = new THREE.MeshPhongMaterial({ color: 0x22d3ee })

    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(ringGeom, ringMat)
      ring.rotation.x = Math.random() * Math.PI
      ring.rotation.y = Math.random() * Math.PI
      group.add(ring)
    }

    // Outer Structure - Cage
    const cageGeom = new THREE.IcosahedronGeometry(3, 1)
    const cageMat = new THREE.MeshBasicMaterial({
      color: 0x4f46e5,
      wireframe: true,
      transparent: true,
      opacity: 0.2,
    })
    const cage = new THREE.Mesh(cageGeom, cageMat)
    group.add(cage)

    // Particle Cloud (Qubits)
    const particlesCount = 100
    const posArray = new Float32Array(particlesCount * 3)
    for (let i = 0; i < particlesCount * 3; i++) {
      posArray[i] = (Math.random() - 0.5) * 8
    }
    const particlesGeom = new THREE.BufferGeometry()
    particlesGeom.setAttribute('position', new THREE.BufferAttribute(posArray, 3))
    const particlesMat = new THREE.PointsMaterial({
      size: 0.05,
      color: 0x22d3ee,
      transparent: true,
      opacity: 0.8,
    })
    const particles = new THREE.Points(particlesGeom, particlesMat)
    group.add(particles)

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4)
    scene.add(ambientLight)

    const pointLight = new THREE.PointLight(0x6366f1, 1, 100)
    pointLight.position.set(5, 5, 5)
    scene.add(pointLight)

    const blueLight = new THREE.PointLight(0x22d3ee, 1, 100)
    blueLight.position.set(-5, -5, 5)
    scene.add(blueLight)

    // Animation
    const animate = () => {
      frameRef.current = requestAnimationFrame(animate)
      group.rotation.y += 0.005
      group.rotation.x += 0.002
      const time = Date.now() * 0.001
      group.children[0].scale.setScalar(1 + Math.sin(time * 2) * 0.05)
      renderer.render(scene, camera)
    }
    animate()

    // Resize observer
    const resizeObserver = new ResizeObserver(() => {
      const w = container.clientWidth
      const h = container.clientHeight || 400
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    })
    resizeObserver.observe(container)

    // Cleanup
    return () => {
      resizeObserver.disconnect()
      if (frameRef.current) cancelAnimationFrame(frameRef.current)
      if (rendererRef.current) {
        rendererRef.current.dispose()
        if (container.contains(rendererRef.current.domElement)) {
          container.removeChild(rendererRef.current.domElement)
        }
      }
      // Dispose geometry and materials
      scene.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose()
        if (obj.material) {
          if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose())
          else obj.material.dispose()
        }
      })
    }
  }, [])

  return (
    <div
      ref={containerRef}
      className="w-full max-w-[800px] h-[400px] bg-transparent"
    />
  )
}

export default QuantumSphere
