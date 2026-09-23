import * as THREE from 'three';

// One shared matte white material for every building, plus a ground variant.
// A small shader hook darkens and cools building bases toward the street,
// imitating the soft baked bounce lighting of the original game.

export function createMaterials(look) {
  const uniforms = {
    uBaseDarken: { value: look.baseDarken },
    uBaseHeight: { value: look.baseHeight },
    uBaseTint: { value: new THREE.Color('#7fa6cf') },
  };

  const patch = (material, key, useBase) => {
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying float vWorldY;')
        .replace(
          '#include <project_vertex>',
          `#include <project_vertex>
          {
            vec4 wpos = vec4( transformed, 1.0 );
            #ifdef USE_INSTANCING
              wpos = instanceMatrix * wpos;
            #endif
            vWorldY = ( modelMatrix * wpos ).y;
          }`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          varying float vWorldY;
          uniform float uBaseDarken;
          uniform float uBaseHeight;
          uniform vec3 uBaseTint;`,
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          ${useBase ? `float baseF = 1.0 - smoothstep( 0.0, uBaseHeight, vWorldY );
          diffuseColor.rgb *= mix( vec3( 1.0 ), uBaseTint, baseF * uBaseDarken );` : ''}`,
        );
    };
    material.customProgramCacheKey = () => key;
  };

  const building = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.86, metalness: 0 });
  patch(building, 'me-building', true);

  const ground = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.9, 0.91, 0.92), roughness: 0.95, metalness: 0 });
  patch(ground, 'me-ground', false);

  return { building, ground, uniforms };
}
