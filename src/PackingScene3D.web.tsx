import { memo, useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import {
  LAYER_SEPARATOR_HEIGHT,
  buildVoidFillBlocks,
  getDisplayItemWrapKind,
  getDisplayItemWrapPadding,
  type Recommendation,
} from '@/packing'

type SceneDimensions = {
  cartonX: number
  cartonY: number
  cartonZ: number
  effectiveX: number
  effectiveY: number
  effectiveZ: number
  sidePadding: number
  topPadding: number
  bottomPadding: number
}

function mmToSceneUnits(value: number): number {
  return value / 10
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function getSceneDimensions(recommendation: Recommendation): SceneDimensions {
  return {
    cartonX: mmToSceneUnits(recommendation.carton.inner.length),
    cartonY: mmToSceneUnits(recommendation.carton.inner.height),
    cartonZ: mmToSceneUnits(recommendation.carton.inner.width),
    effectiveX: mmToSceneUnits(recommendation.effectiveInner.length),
    effectiveY: mmToSceneUnits(recommendation.effectiveInner.height),
    effectiveZ: mmToSceneUnits(recommendation.effectiveInner.width),
    sidePadding: mmToSceneUnits(recommendation.cushion.sidePadding),
    topPadding: mmToSceneUnits(recommendation.cushion.topPadding),
    bottomPadding: mmToSceneUnits(recommendation.bottomFillHeight),
  }
}

function getBlockPosition({
  cartonX,
  cartonZ,
  x,
  y,
  z,
  length,
  width,
  height,
}: {
  cartonX: number
  cartonZ: number
  x: number
  y: number
  z: number
  length: number
  width: number
  height: number
}) {
  return new THREE.Vector3(
    -cartonX / 2 + x + length / 2,
    z + height / 2,
    -cartonZ / 2 + y + width / 2,
  )
}

function addBox({
  args,
  color,
  edgeColor,
  group,
  opacity = 1,
  position = new THREE.Vector3(),
  roughness = 0.8,
}: {
  args: [number, number, number]
  color: string
  edgeColor?: string
  group: THREE.Group
  opacity?: number
  position?: THREE.Vector3
  roughness?: number
}) {
  const geometry = new THREE.BoxGeometry(...args)
  const material = new THREE.MeshStandardMaterial({
    color,
    depthWrite: opacity >= 0.28,
    opacity,
    roughness,
    transparent: opacity < 1,
  })
  const mesh = new THREE.Mesh(geometry, material)

  mesh.position.copy(position)
  group.add(mesh)

  if (edgeColor) {
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(geometry),
      new THREE.LineBasicMaterial({
        color: edgeColor,
        transparent: true,
        opacity: 0.62,
      }),
    )

    edges.position.copy(position)
    group.add(edges)
  }
}

function buildPackingGroup(recommendation: Recommendation) {
  const dims = getSceneDimensions(recommendation)
  const group = new THREE.Group()
  const voidFillBlocks = buildVoidFillBlocks(recommendation)
  const itemWrapKind = getDisplayItemWrapKind(recommendation.cushion)
  const itemWrapPadding = getDisplayItemWrapPadding(recommendation.cushion)
  const sideSpan = Math.max(dims.cartonZ - dims.sidePadding * 2, 0)
  const sideHeight = Math.max(
    dims.cartonY - dims.topPadding - dims.bottomPadding,
    0,
  )
  const topGuideY = dims.cartonY - dims.topPadding
  const frameThickness = 0.14
  const floorGeometry = new THREE.PlaneGeometry(
    dims.cartonX * 2.25,
    dims.cartonZ * 2.25,
  )
  const floor = new THREE.Mesh(
    floorGeometry,
    new THREE.MeshStandardMaterial({ color: '#ebe6dc', roughness: 1 }),
  )

  floor.rotation.x = -Math.PI / 2
  floor.position.y = -0.04
  group.add(floor)

  addBox({
    args: [dims.cartonX, dims.cartonY, dims.cartonZ],
    color: '#ffffff',
    edgeColor: '#836652',
    group,
    opacity: 0.02,
    position: new THREE.Vector3(0, dims.cartonY / 2, 0),
  })

  for (const position of [
    [
      -dims.cartonX / 2 + frameThickness / 2,
      dims.cartonY / 2,
      -dims.cartonZ / 2 + frameThickness / 2,
    ],
    [
      dims.cartonX / 2 - frameThickness / 2,
      dims.cartonY / 2,
      -dims.cartonZ / 2 + frameThickness / 2,
    ],
    [
      -dims.cartonX / 2 + frameThickness / 2,
      dims.cartonY / 2,
      dims.cartonZ / 2 - frameThickness / 2,
    ],
    [
      dims.cartonX / 2 - frameThickness / 2,
      dims.cartonY / 2,
      dims.cartonZ / 2 - frameThickness / 2,
    ],
  ]) {
    addBox({
      args: [frameThickness, dims.cartonY, frameThickness],
      color: '#e4d5c4',
      group,
      position: new THREE.Vector3(...position),
      roughness: 0.95,
    })
  }

  for (const [x, y, z, sx, sy, sz] of [
    [
      0,
      frameThickness / 2,
      -dims.cartonZ / 2 + frameThickness / 2,
      dims.cartonX,
      frameThickness,
      frameThickness,
    ],
    [
      0,
      frameThickness / 2,
      dims.cartonZ / 2 - frameThickness / 2,
      dims.cartonX,
      frameThickness,
      frameThickness,
    ],
    [
      -dims.cartonX / 2 + frameThickness / 2,
      frameThickness / 2,
      0,
      frameThickness,
      frameThickness,
      dims.cartonZ,
    ],
    [
      dims.cartonX / 2 - frameThickness / 2,
      frameThickness / 2,
      0,
      frameThickness,
      frameThickness,
      dims.cartonZ,
    ],
    [
      0,
      dims.cartonY - frameThickness / 2,
      -dims.cartonZ / 2 + frameThickness / 2,
      dims.cartonX,
      frameThickness,
      frameThickness,
    ],
    [
      0,
      dims.cartonY - frameThickness / 2,
      dims.cartonZ / 2 - frameThickness / 2,
      dims.cartonX,
      frameThickness,
      frameThickness,
    ],
    [
      -dims.cartonX / 2 + frameThickness / 2,
      dims.cartonY - frameThickness / 2,
      0,
      frameThickness,
      frameThickness,
      dims.cartonZ,
    ],
    [
      dims.cartonX / 2 - frameThickness / 2,
      dims.cartonY - frameThickness / 2,
      0,
      frameThickness,
      frameThickness,
      dims.cartonZ,
    ],
  ] as Array<[number, number, number, number, number, number]>) {
    addBox({
      args: [sx, sy, sz],
      color: '#eadfd3',
      group,
      position: new THREE.Vector3(x, y, z),
      roughness: 0.95,
    })
  }

  addBox({
    args: [dims.effectiveX, 0.03, dims.effectiveZ],
    color: '#8f7664',
    group,
    opacity: 0.24,
    position: new THREE.Vector3(0, topGuideY, 0),
  })
  addBox({
    args: [dims.cartonX, dims.bottomPadding, dims.cartonZ],
    color: '#d5b18c',
    group,
    opacity: 0.48,
    position: new THREE.Vector3(0, dims.bottomPadding / 2, 0),
  })

  if (sideHeight > 0 && dims.sidePadding > 0) {
    addBox({
      args: [dims.cartonX, sideHeight, dims.sidePadding],
      color: '#d9b28a',
      group,
      opacity: 0.38,
      position: new THREE.Vector3(
        0,
        dims.bottomPadding + sideHeight / 2,
        -dims.cartonZ / 2 + dims.sidePadding / 2,
      ),
    })
    addBox({
      args: [dims.cartonX, sideHeight, dims.sidePadding],
      color: '#d9b28a',
      group,
      opacity: 0.38,
      position: new THREE.Vector3(
        0,
        dims.bottomPadding + sideHeight / 2,
        dims.cartonZ / 2 - dims.sidePadding / 2,
      ),
    })

    if (sideSpan > 0) {
      addBox({
        args: [dims.sidePadding, sideHeight, sideSpan],
        color: '#c99d77',
        group,
        opacity: 0.34,
        position: new THREE.Vector3(
          -dims.cartonX / 2 + dims.sidePadding / 2,
          dims.bottomPadding + sideHeight / 2,
          0,
        ),
      })
      addBox({
        args: [dims.sidePadding, sideHeight, sideSpan],
        color: '#c99d77',
        group,
        opacity: 0.34,
        position: new THREE.Vector3(
          dims.cartonX / 2 - dims.sidePadding / 2,
          dims.bottomPadding + sideHeight / 2,
          0,
        ),
      })
    }
  }

  for (const placement of recommendation.placements) {
    const length = mmToSceneUnits(placement.length)
    const width = mmToSceneUnits(placement.width)
    const height = mmToSceneUnits(placement.height)
    const x = mmToSceneUnits(recommendation.cushion.sidePadding + placement.x)
    const y = mmToSceneUnits(recommendation.cushion.sidePadding + placement.y)
    const z = mmToSceneUnits(recommendation.bottomFillHeight + placement.z)
    const hasItemWrap = placement.useItemWrap
    const sideWrap = hasItemWrap
      ? mmToSceneUnits(
          Math.min(
            itemWrapPadding.side,
            placement.length * 0.18,
            placement.width * 0.18,
          ),
        )
      : 0
    const verticalWrap = hasItemWrap
      ? mmToSceneUnits(
          Math.min(itemWrapPadding.vertical, placement.height * 0.18),
        )
      : 0
    const coreHeight = hasItemWrap
      ? Math.max(height - verticalWrap * 2, height * 0.58)
      : height
    const coreLength = hasItemWrap
      ? Math.max(length - sideWrap * 2, length * 0.58)
      : length
    const coreWidth = hasItemWrap
      ? Math.max(width - sideWrap * 2, width * 0.58)
      : width
    const position = getBlockPosition({
      cartonX: dims.cartonX,
      cartonZ: dims.cartonZ,
      x,
      y,
      z,
      length,
      width,
      height,
    })

    addBox({
      args: [coreLength, coreHeight, coreWidth],
      color: placement.color,
      edgeColor: '#fff7ef',
      group,
      position,
      roughness: 0.72,
    })

    if (hasItemWrap) {
      addBox({
        args: [length, height, width],
        color: itemWrapKind === 'paper-fill' ? '#ceb08b' : '#e5c39f',
        edgeColor: itemWrapKind === 'paper-fill' ? '#9f7a52' : '#c69063',
        group,
        opacity: itemWrapKind === 'paper-fill' ? 0.16 : 0.14,
        position,
        roughness: 0.92,
      })
    }
  }

  for (const layer of recommendation.layers.slice(0, -1)) {
    const separatorHeight = mmToSceneUnits(LAYER_SEPARATOR_HEIGHT)
    const separatorLength = dims.effectiveX
    const separatorWidth = dims.effectiveZ
    const x = dims.sidePadding
    const y = dims.sidePadding
    const z = mmToSceneUnits(
      recommendation.bottomFillHeight + layer.z + layer.height,
    )

    addBox({
      args: [separatorLength, separatorHeight, separatorWidth],
      color: '#e7d1ad',
      edgeColor: '#b89061',
      group,
      opacity: 0.24,
      position: getBlockPosition({
        cartonX: dims.cartonX,
        cartonZ: dims.cartonZ,
        x,
        y,
        z,
        length: separatorLength,
        width: separatorWidth,
        height: separatorHeight,
      }),
      roughness: 0.94,
    })
  }

  for (const block of voidFillBlocks) {
    const length = mmToSceneUnits(block.length)
    const width = mmToSceneUnits(block.width)
    const height = mmToSceneUnits(block.height)
    const x = mmToSceneUnits(recommendation.cushion.sidePadding + block.x)
    const y = mmToSceneUnits(recommendation.cushion.sidePadding + block.y)
    const z = mmToSceneUnits(recommendation.bottomFillHeight + block.z)

    addBox({
      args: [length, height, width],
      color: '#dfbc98',
      group,
      opacity: 0.14,
      position: getBlockPosition({
        cartonX: dims.cartonX,
        cartonZ: dims.cartonZ,
        x,
        y,
        z,
        length,
        width,
        height,
      }),
      roughness: 0.96,
    })
  }

  return { dims, group }
}

function disposeObject(object: THREE.Object3D) {
  object.traverse((item) => {
    if (item instanceof THREE.Mesh || item instanceof THREE.LineSegments) {
      item.geometry.dispose()

      if (Array.isArray(item.material)) {
        for (const material of item.material) {
          material.dispose()
        }
      } else {
        item.material.dispose()
      }
    }
  })
}

function canUseWebGL() {
  if (typeof document === 'undefined') {
    return true
  }

  const canvas = document.createElement('canvas')

  return Boolean(
    canvas.getContext('webgl2') ||
      canvas.getContext('webgl') ||
      canvas.getContext('experimental-webgl'),
  )
}

function PackingScene3D({
  onGestureActiveChange,
  recommendation,
  viewSyncToken = 0,
}: {
  onGestureActiveChange?: (active: boolean) => void
  recommendation: Recommendation
  viewSyncToken?: number
}) {
  const mountRef = useRef<HTMLDivElement | null>(null)
  const [webGlUnavailable, setWebGlUnavailable] = useState(() => !canUseWebGL())

  useEffect(() => {
    const mount = mountRef.current

    if (!mount || webGlUnavailable) {
      return
    }

    const canvas = document.createElement('canvas')
    const { dims, group } = buildPackingGroup(recommendation)
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 1000)
    let renderer: THREE.WebGLRenderer

    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        canvas,
        failIfMajorPerformanceCaveat: false,
      })
    } catch {
      window.setTimeout(() => setWebGlUnavailable(true), 0)
      return
    }
    const maxSize = Math.max(dims.cartonX, dims.cartonY, dims.cartonZ)
    const target = new THREE.Vector3(0, dims.cartonY * 0.42, 0)
    let yaw = viewSyncToken > 0 ? 0 : -0.12
    let pitch = 0
    let zoom = 1
    let startX = 0
    let startY = 0
    let startYaw = yaw
    let startPitch = pitch
    let isDragging = false
    let frameId: number | null = null

    scene.background = new THREE.Color('#f7f8f4')
    scene.add(new THREE.AmbientLight('#ffffff', 1.15))

    const mainLight = new THREE.DirectionalLight('#ffffff', 1.25)
    mainLight.position.set(maxSize * 1.8, maxSize * 1.7, maxSize * 1.4)
    scene.add(mainLight)

    const fillLight = new THREE.DirectionalLight('#ffffff', 0.42)
    fillLight.position.set(-maxSize * 1.2, maxSize * 0.8, -maxSize)
    scene.add(fillLight)
    scene.add(group)
    mount.appendChild(canvas)

    const updateCamera = () => {
      if (viewSyncToken > 0 && !isDragging) {
        camera.position.set(0, maxSize * 2.2 * zoom, 0.001)
        camera.up.set(0, 0, -1)
      } else {
        camera.position.set(
          maxSize * 1.55 * zoom,
          maxSize * 1.18 * zoom,
          maxSize * 1.65 * zoom,
        )
        camera.up.set(0, 1, 0)
      }

      camera.lookAt(target)
      camera.updateProjectionMatrix()
    }
    const resize = () => {
      const width = mount.clientWidth
      const height = mount.clientHeight

      if (width === 0 || height === 0) {
        return
      }

      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
      renderer.setSize(width, height, false)
      camera.aspect = width / height
      updateCamera()
      renderScene()
    }
    const renderScene = () => {
      if (frameId !== null) {
        return
      }

      frameId = window.requestAnimationFrame(() => {
        frameId = null
        group.rotation.set(pitch, yaw, 0)
        renderer.render(scene, camera)
      })
    }
    const handlePointerDown = (event: PointerEvent) => {
      event.preventDefault()
      isDragging = true
      startX = event.clientX
      startY = event.clientY
      startYaw = yaw
      startPitch = pitch
      onGestureActiveChange?.(true)
      mount.setPointerCapture(event.pointerId)
      renderScene()
    }
    const handlePointerMove = (event: PointerEvent) => {
      if (!isDragging) {
        return
      }

      event.preventDefault()
      yaw = startYaw + (event.clientX - startX) * 0.008
      pitch = clamp(startPitch + (event.clientY - startY) * 0.006, -0.56, 0.46)
      updateCamera()
      renderScene()
    }
    const handlePointerUp = (event: PointerEvent) => {
      isDragging = false
      onGestureActiveChange?.(false)

      if (mount.hasPointerCapture(event.pointerId)) {
        mount.releasePointerCapture(event.pointerId)
      }
    }
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault()
      zoom = clamp(zoom + event.deltaY * 0.0018, 0.68, 1.85)
      updateCamera()
      renderScene()
    }
    const observer = new ResizeObserver(resize)

    mount.addEventListener('pointerdown', handlePointerDown)
    mount.addEventListener('pointermove', handlePointerMove)
    mount.addEventListener('pointerup', handlePointerUp)
    mount.addEventListener('pointercancel', handlePointerUp)
    mount.addEventListener('wheel', handleWheel, { passive: false })
    observer.observe(mount)
    resize()

    return () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId)
      }

      observer.disconnect()
      mount.removeEventListener('pointerdown', handlePointerDown)
      mount.removeEventListener('pointermove', handlePointerMove)
      mount.removeEventListener('pointerup', handlePointerUp)
      mount.removeEventListener('pointercancel', handlePointerUp)
      mount.removeEventListener('wheel', handleWheel)
      onGestureActiveChange?.(false)

      if (canvas.parentNode === mount) {
        mount.removeChild(canvas)
      }

      disposeObject(group)
      renderer.dispose()
    }
  }, [onGestureActiveChange, recommendation, viewSyncToken, webGlUnavailable])

  return (
    <div
      ref={mountRef}
      style={{
        alignItems: 'center',
        backgroundColor: '#eef2ee',
        border: '1px solid #cbd8d0',
        borderRadius: 8,
        boxSizing: 'border-box',
        display: 'flex',
        height: 340,
        justifyContent: 'center',
        overflow: 'hidden',
        position: 'relative',
        touchAction: 'none',
        width: '100%',
      }}
    >
      {webGlUnavailable ? (
        <div
          style={{
            color: '#59645e',
            fontSize: 13,
            lineHeight: '19px',
            maxWidth: 320,
            padding: 18,
            textAlign: 'center',
          }}
        >
          <strong
            style={{
              color: '#17221d',
              display: 'block',
              fontSize: 16,
              marginBottom: 6,
            }}
          >
            3D preview needs WebGL
          </strong>
          Enable hardware acceleration or open this app in Chrome, Safari, or Expo Go.
        </div>
      ) : null}
    </div>
  )
}

export default memo(PackingScene3D)
