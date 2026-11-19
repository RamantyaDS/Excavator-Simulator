import { Environment, Lightformer, Sky, Stars } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Bloom, EffectComposer, N8AO } from '@react-three/postprocessing';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { applyHeld, padLook } from '../input';
import { tipWorld } from '../sim/excavator';
import { TRENCH } from '../sim/site';
import { heightAt } from '../sim/terrain';
import { playEvent, updateSound } from '../sound';
import { advance, ex, onEvent, useUI } from '../store';
import { FULL, MAX_DPR, NIGHT, SHADOW } from './Adaptive';
import { Ground } from './Ground';
import { PC800, excObj } from './PC800';
import { Site } from './Site';
import { Trucks } from './Trucks';

/** Camera look offsets, changed by mouse drags, the wheel and the gamepad's D-pad. */
const look = { yaw: 2.5, pitch: 0.35, dist: 26, cabYaw: 0, cabPitch: -0.12 };
if (import.meta.env.DEV) (globalThis as unknown as { look: typeof look }).look = look;

function Driver() {
  useEffect(() => onEvent(playEvent), []);
  useEffect(() => {
    const id = setInterval(() => useUI.getState().bump(), 120);
    return () => clearInterval(id);
  }, []);
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    if (import.meta.env.DEV) Object.assign(globalThis, { gl, scene });
  }, [gl, scene]);
  useFrame((_, dt) => {
    applyHeld(Math.min(dt, 0.05));
    advance(dt);
    updateSound(camera.position.distanceTo(ex.p), useUI.getState().cam === 'cab');
  });
  return null;
}

function Sun() {
  const light = useRef<THREE.DirectionalLight>(null);
  useFrame(() => {
    const l = light.current!;
    l.position.set(ex.p.x + 40, 60, ex.p.z + 25);
    l.target.position.set(ex.p.x, 0, ex.p.z);
    l.target.updateMatrixWorld();
  });
  return (
    <directionalLight
      ref={light}
      intensity={NIGHT ? 0.5 : 3.0}
      color={NIGHT ? '#9db4e0' : '#fff1da'}
      castShadow
      shadow-mapSize={[SHADOW, SHADOW]}
      shadow-camera-left={-35}
      shadow-camera-right={35}
      shadow-camera-top={35}
      shadow-camera-bottom={-35}
      shadow-camera-far={200}
      shadow-bias={-0.0004}
      shadow-normalBias={0.04}
    />
  );
}

/** Night: the cab and boom work lights light up the digging area. */
function WorkLights() {
  const a = useRef<THREE.SpotLight>(null);
  const tgt = useMemo(() => new THREE.Object3D(), []);
  useFrame(() => {
    const u = excObj.upper;
    if (!u) return;
    u.updateWorldMatrix(true, false);
    a.current!.position.set(1.0, 4.6, 2.2).applyMatrix4(u.matrixWorld);
    const T = tipWorld(ex);
    tgt.position.copy(T);
    tgt.updateMatrixWorld();
    a.current!.visible = ex.engine === 'running';
  });
  return (
    <>
      <primitive object={tgt} />
      <spotLight ref={a} target={tgt} color="#fff1dc" intensity={4000} distance={60} angle={0.7} penumbra={0.6} decay={2} />
    </>
  );
}

function CameraRig() {
  const cam = useUI((s) => s.cam);
  const camera = useThree((s) => s.camera as THREE.PerspectiveCamera);
  const gl = useThree((s) => s.gl);
  const tmp = useMemo(() => ({ v: new THREE.Vector3(), t: new THREE.Vector3(), q: new THREE.Quaternion(), e: new THREE.Euler() }), []);

  useEffect(() => {
    const el = gl.domElement;
    let down = false;
    const dn = (e: PointerEvent) => {
      down = true;
      el.setPointerCapture?.(e.pointerId);
    };
    const up = () => (down = false);
    const mv = (e: PointerEvent) => {
      if (!down) return;
      if (cam === 'cab' || cam === 'bucket') {
        look.cabYaw = Math.max(-2.6, Math.min(2.6, look.cabYaw - e.movementX * 0.004));
        look.cabPitch = Math.max(-1.3, Math.min(0.9, look.cabPitch - e.movementY * 0.004));
      } else {
        look.yaw -= e.movementX * 0.005;
        look.pitch = Math.max(0.03, Math.min(1.45, look.pitch + e.movementY * 0.004));
      }
    };
    const wheel = (e: WheelEvent) => (look.dist = Math.max(6, Math.min(160, look.dist * (1 + Math.sign(e.deltaY) * 0.1))));
    el.addEventListener('pointerdown', dn);
    addEventListener('pointerup', up);
    el.addEventListener('pointermove', mv);
    el.addEventListener('wheel', wheel, { passive: true });
    return () => {
      el.removeEventListener('pointerdown', dn);
      removeEventListener('pointerup', up);
      el.removeEventListener('pointermove', mv);
      el.removeEventListener('wheel', wheel);
    };
  }, [cam, gl]);

  useEffect(() => {
    camera.fov = cam === 'cab' ? 72 : cam === 'bucket' ? 65 : 50;
    camera.updateProjectionMatrix();
    look.cabYaw = 0;
    look.cabPitch = cam === 'bucket' ? -0.5 : -0.12;
  }, [cam, camera]);

  useFrame((_, raw) => {
    const dt = Math.min(raw, 0.05);
    look.yaw -= padLook.x * dt * 1.5;
    look.pitch = Math.max(0.03, Math.min(1.45, look.pitch + padLook.y * dt));
    const u = excObj.upper;
    if (cam === 'cab' && u) {
      u.updateWorldMatrix(true, false);
      tmp.v.set(1.15, 3.55, 0.75).applyMatrix4(u.matrixWorld);
      camera.position.copy(tmp.v);
      u.getWorldQuaternion(tmp.q);
      camera.quaternion.copy(tmp.q).multiply(new THREE.Quaternion().setFromEuler(tmp.e.set(look.cabPitch, look.cabYaw + Math.PI, 0, 'YXZ')));
      return;
    }
    if (cam === 'bucket' && excObj.arm) {
      // a camera on the arm looking at the bucket
      excObj.arm.updateWorldMatrix(true, false);
      tmp.v.set(0.9, 1.2, 1.0).applyMatrix4(excObj.arm.matrixWorld);
      camera.position.copy(tmp.v);
      const T = tipWorld(ex);
      camera.lookAt(T);
      camera.rotateY(look.cabYaw);
      camera.rotateX(look.cabPitch + 0.5);
      return;
    }
    const T = tipWorld(ex);
    const focus = tmp.t.set((ex.p.x * 2 + T.x) / 3, Math.max(1.5, (ex.p.y + 2.5 + T.y) / 2), (ex.p.z * 2 + T.z) / 3);
    let want: THREE.Vector3;
    if (cam === 'top') want = tmp.v.set(focus.x + 0.01, focus.y + look.dist * 1.6 + 10, focus.z + 0.01);
    else if (cam === 'spotter') {
      const x = TRENCH.x + 4.5;
      const z = -27;
      want = tmp.v.set(x + 0.4, heightAt(ex.terrain, x, z) + 1.7, z + 0.4);
      focus.copy(T);
    } else {
      const h = new THREE.Vector3(0, 0, 1).applyQuaternion(ex.q);
      const a = Math.atan2(h.x, h.z) + ex.swing + look.yaw;
      const r = Math.cos(look.pitch) * look.dist;
      want = tmp.v.set(focus.x + Math.sin(a) * r, focus.y + Math.sin(look.pitch) * look.dist, focus.z + Math.cos(a) * r);
    }
    camera.position.lerp(want, cam === 'spotter' ? 1 : 1 - Math.exp(-dt * 4));
    const gh = heightAt(ex.terrain, camera.position.x, camera.position.z) + 1.2;
    if (camera.position.y < gh) camera.position.y = gh;
    camera.lookAt(focus);
  });
  return null;
}

export function Experience() {
  return (
    <Canvas shadows dpr={[1, MAX_DPR]} camera={{ position: [30, 20, -30], fov: 50, near: 0.2, far: 1500 }} gl={{ antialias: true }}>
      <color attach="background" args={[NIGHT ? '#070c16' : '#bcd3e6']} />
      <fog attach="fog" args={[NIGHT ? '#0a111d' : '#c7d4dd', 140, 700]} />
      {NIGHT ? (
        <Stars radius={700} depth={80} count={2500} factor={5} saturation={0} fade speed={0.3} />
      ) : (
        <Sky sunPosition={[40, 26, 25]} turbidity={3.5} rayleigh={0.9} mieCoefficient={0.004} mieDirectionalG={0.8} />
      )}
      <hemisphereLight args={NIGHT ? ['#4a5f8c', '#1c1914', 0.6] : ['#dbe9ff', '#6b5f4c', 0.85]} />
      <Sun />
      <Environment resolution={128} frames={1} environmentIntensity={NIGHT ? 0.12 : 0.7}>
        <Lightformer form="rect" intensity={1.6} color="#dceaf7" scale={[80, 30, 1]} position={[0, 25, 0]} rotation={[Math.PI / 2, 0, 0]} />
        <Lightformer form="rect" intensity={1.0} color="#bfd3e6" scale={[60, 8, 1]} position={[0, 5, -40]} />
        <Lightformer form="circle" intensity={6} color="#fff0d6" scale={8} position={[40, 26, 25]} target={[0, 0, 0]} />
        <Lightformer form="rect" intensity={0.35} color="#6b6458" scale={[120, 120, 1]} position={[0, -2, 0]} rotation={[-Math.PI / 2, 0, 0]} />
      </Environment>
      <Ground />
      <Site />
      <Trucks />
      <PC800 />
      {NIGHT && <WorkLights />}
      <CameraRig />
      <Driver />
      {FULL ? (
        <EffectComposer>
          <N8AO aoRadius={1.4} intensity={2} distanceFalloff={0.6} halfRes quality="performance" aoSamples={10} denoiseSamples={4} />
          <Bloom mipmapBlur luminanceThreshold={1.15} intensity={0.35} />
        </EffectComposer>
      ) : (
        <></>
      )}
    </Canvas>
  );
}
