import * as THREE from 'three';
import {
  EffectComposer,
  RenderPass,
  EffectPass,
  Effect,
  EffectAttribute,
  BlendFunction,
  BloomEffect,
  ToneMappingEffect,
  ToneMappingMode,
  VignetteEffect,
  SMAAEffect,
  SMAAPreset,
} from 'postprocessing';
import { N8AOPostPass } from 'n8ao';
import { WORLD } from '../config.js';

// Pipeline: scene -> N8AO (blue-tinted AO) -> height fog -> bloom + tone
// mapping + grade + vignette -> SMAA.

const fogFrag = /* glsl */ `
uniform mat4 uProjInv;
uniform mat4 uCamWorld;
uniform vec3 uFogEye;
uniform vec3 uFogColor;
uniform vec3 uSunDir;
uniform vec3 uSunGlow;
uniform float uDensity;
uniform float uFalloff;
uniform float uStart;
uniform float uExposure;
uniform float uFarHaze;

void mainImage( const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor ) {
  vec3 col = inputColor.rgb;
  if ( depth < 0.9999999 ) {
    vec4 vp = uProjInv * vec4( uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0 );
    vp /= vp.w;
    vec3 wp = ( uCamWorld * vp ).xyz;
    vec3 rd = wp - uFogEye;
    float dist = length( rd );
    vec3 dir = rd / max( dist, 1e-3 );
    float d = max( dist - uStart, 0.0 );
    float hs = max( uFogEye.y + dir.y * min( uStart, dist ) - ${WORLD.waterY.toFixed(2)}, 0.0 );
    float k = uFalloff;
    float e0 = uDensity * exp( -k * hs );
    float kd = k * dir.y * d;
    float integral = abs( kd ) > 1e-4 ? e0 * ( 1.0 - exp( -kd ) ) / ( k * dir.y ) : e0 * d;
    float fog = 1.0 - exp( -max( integral, 0.0 ) - max( dist - 3500.0, 0.0 ) * uFarHaze );
    float sun = pow( max( dot( dir, uSunDir ), 0.0 ), 6.0 );
    col = mix( col, uFogColor + uSunGlow * sun, clamp( fog, 0.0, 1.0 ) );
  }
  outputColor = vec4( col * uExposure, inputColor.a );
}
`;

class FogEffect extends Effect {
  constructor() {
    super('FogEffect', fogFrag, {
      attributes: EffectAttribute.DEPTH,
      blendFunction: BlendFunction.NORMAL,
      uniforms: new Map([
        ['uProjInv', new THREE.Uniform(new THREE.Matrix4())],
        ['uCamWorld', new THREE.Uniform(new THREE.Matrix4())],
        ['uFogEye', new THREE.Uniform(new THREE.Vector3())],
        ['uFogColor', new THREE.Uniform(new THREE.Color())],
        ['uSunDir', new THREE.Uniform(new THREE.Vector3(0, 1, 0))],
        ['uSunGlow', new THREE.Uniform(new THREE.Color(0.3, 0.25, 0.18))],
        ['uDensity', new THREE.Uniform(0.0003)],
        ['uFalloff', new THREE.Uniform(0.001)],
        ['uStart', new THREE.Uniform(200)],
        ['uExposure', new THREE.Uniform(1)],
        ['uFarHaze', new THREE.Uniform(0.00012)],
      ]),
    });
  }
}

const gradeFrag = /* glsl */ `
uniform vec3 uShadowTint;
uniform float uShadowAmt;
uniform float uSaturation;
uniform float uContrast;
uniform float uHighlightNeutral;

void mainImage( const in vec4 inputColor, const in vec2 uv, out vec4 outputColor ) {
  vec3 c = clamp( inputColor.rgb, 0.0, 1.0 );
  const vec3 W = vec3( 0.2126, 0.7152, 0.0722 );
  float l = dot( c, W );
  // Push shadows and mid-tones toward the tint while keeping luminance.
  vec3 tinted = uShadowTint * ( l / max( dot( uShadowTint, W ), 1e-4 ) );
  float w = 1.0 - smoothstep( 0.05, 0.9, l );
  c = mix( c, tinted, w * uShadowAmt );
  c = mix( vec3( dot( c, W ) ), c, uSaturation );
  // Sunlit whites read as clean, neutral white.
  float lh = dot( c, W );
  c = mix( c, vec3( lh ), smoothstep( 0.55, 0.92, lh ) * uHighlightNeutral );
  // Contrast around mid-grey in a perceptual-ish space.
  vec3 g = pow( max( c, 0.0 ), vec3( 1.0 / 2.2 ) );
  g = ( g - 0.5 ) * uContrast + 0.5;
  c = pow( clamp( g, 0.0, 1.0 ), vec3( 2.2 ) );
  outputColor = vec4( c, inputColor.a );
}
`;

class GradeEffect extends Effect {
  constructor() {
    super('GradeEffect', gradeFrag, {
      blendFunction: BlendFunction.NORMAL,
      uniforms: new Map([
        ['uShadowTint', new THREE.Uniform(new THREE.Color())],
        ['uShadowAmt', new THREE.Uniform(0.2)],
        ['uSaturation', new THREE.Uniform(1)],
        ['uContrast', new THREE.Uniform(1)],
        ['uHighlightNeutral', new THREE.Uniform(0.5)],
      ]),
    });
  }
}

const TONE = {
  ACES: ToneMappingMode.ACES_FILMIC,
  AgX: ToneMappingMode.AGX,
  Neutral: ToneMappingMode.NEUTRAL,
  Reinhard: ToneMappingMode.REINHARD2,
};
export const TONE_MODES = Object.keys(TONE);

export class Post {
  constructor(renderer, scene, camera, look) {
    this.renderer = renderer;
    this.camera = camera;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());

    this.composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType });
    this.renderPass = new RenderPass(scene, camera);
    this.ao = new N8AOPostPass(scene, camera, size.x, size.y);
    this.ao.configuration.gammaCorrection = false;
    this.ao.configuration.distanceFalloff = 1.0;
    this.ao.configuration.halfRes = true;
    this.ao.setQualityMode('Medium');

    this.fog = new FogEffect();
    this.fogPass = new EffectPass(camera, this.fog);

    this.bloom = new BloomEffect({
      mipmapBlur: true,
      luminanceThreshold: look.bloomThreshold,
      luminanceSmoothing: look.bloomSmoothing,
      intensity: look.bloomIntensity,
      radius: 0.55,
    });
    this.tone = new ToneMappingEffect({ mode: TONE[look.toneMapping] ?? ToneMappingMode.ACES_FILMIC });
    this.grade = new GradeEffect();
    this.vignette = new VignetteEffect({ darkness: look.vignette, offset: 0.3 });
    this.mainPass = new EffectPass(camera, this.bloom, this.tone, this.grade, this.vignette);
    this.smaaPass = new EffectPass(camera, new SMAAEffect({ preset: SMAAPreset.HIGH }));

    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.ao);
    this.composer.addPass(this.fogPass);
    this.composer.addPass(this.mainPass);
    this.composer.addPass(this.smaaPass);
  }

  setCamera(camera) {
    this.camera = camera;
    this.composer.setMainCamera(camera);
    const ao = this.ao;
    ao.camera = camera;
    const type = ao.configuration.depthBufferType;
    const ortho = !!camera.isOrthographicCamera;
    ao.configureAOPass(type, ortho);
    ao.configureDenoisePass(type, ortho);
    ao.configureEffectCompositer(type, ortho);
    ao.firstFrame();
  }

  setToneMapping(name) {
    this.tone.mode = TONE[name] ?? ToneMappingMode.ACES_FILMIC;
  }

  setSize(w, h) {
    this.composer.setSize(w, h);
  }

  // Per-frame uniform sync. fogEye is where the fog integral starts (the
  // camera for perspective, a virtual eye for orthographic views).
  update(camera, fogEye) {
    const u = this.fog.uniforms;
    u.get('uProjInv').value.copy(camera.projectionMatrixInverse);
    u.get('uCamWorld').value.copy(camera.matrixWorld);
    u.get('uFogEye').value.copy(fogEye);
  }

  render(dt) {
    this.composer.render(dt);
  }
}
