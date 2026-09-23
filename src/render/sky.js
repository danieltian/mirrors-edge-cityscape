import * as THREE from 'three';

// Gradient sky dome that follows the camera. It draws first without writing
// depth, so sky pixels keep depth = 1 and the fog pass can leave them alone.

export class Sky {
  constructor() {
    this.uniforms = {
      uZenith: { value: new THREE.Color() },
      uHorizon: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunColor: { value: new THREE.Color(1, 0.97, 0.92) },
      uIntensity: { value: 2.4 },
    };
    const material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vec4 wp = modelMatrix * vec4( position, 1.0 );
          vDir = wp.xyz - cameraPosition;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uZenith;
        uniform vec3 uHorizon;
        uniform vec3 uSunDir;
        uniform vec3 uSunColor;
        uniform float uIntensity;
        varying vec3 vDir;
        void main() {
          vec3 d = normalize( vDir );
          float h = clamp( d.y, 0.0, 1.0 );
          vec3 col = mix( uHorizon, uZenith, pow( h, 0.55 ) );
          float s = max( dot( d, uSunDir ), 0.0 );
          col += uSunColor * ( pow( s, 900.0 ) * 3.0 + pow( s, 24.0 ) * 0.14 + pow( s, 4.0 ) * 0.06 );
          gl_FragColor = vec4( col * uIntensity, 1.0 );
        }`,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), material);
    this.mesh.renderOrder = -1000;
    this.mesh.frustumCulled = false;
    this.mesh.name = 'sky';
  }

  update(camera) {
    this.mesh.position.copy(camera.position);
    this.mesh.scale.setScalar(camera.far * 0.9);
  }
}
