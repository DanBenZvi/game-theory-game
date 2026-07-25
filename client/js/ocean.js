// Fullscreen WebGL shader ocean: layered waves, depth gradient, moving
// shimmer highlight. Falls back to a static CSS gradient (see style.css
// `.ocean-fallback`) if WebGL isn't available.

(function () {
  const VERTEX_SRC = `
    attribute vec2 a_position;
    void main() {
      gl_Position = vec4(a_position, 0.0, 1.0);
    }
  `;

  const FRAGMENT_SRC = `
    precision mediump float;
    uniform float u_time;
    uniform vec2 u_resolution;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
    }

    void main() {
      vec2 uv = gl_FragCoord.xy / u_resolution;
      float aspect = u_resolution.x / u_resolution.y;
      float t = u_time;

      vec3 deep = vec3(0.008, 0.043, 0.106);
      vec3 mid = vec3(0.015, 0.140, 0.220);
      vec3 shallow = vec3(0.030, 0.260, 0.340);

      // Organic undulating swell: a few sine octaves at different
      // speeds/directions so the pattern drifts like real water instead
      // of scrolling as a rigid grid.
      float swell =
        sin(uv.x * 3.0 + t * 0.15) * 0.5 +
        sin(uv.x * 5.5 - uv.y * 2.0 + t * 0.27) * 0.3 +
        sin(uv.y * 6.0 + t * 0.11) * 0.2;
      swell *= 0.5;

      float depthMix = clamp(uv.y * 0.8 + swell * 0.12, 0.0, 1.0);
      vec3 color = mix(deep, mid, depthMix);
      color = mix(color, shallow, clamp(depthMix - 0.6, 0.0, 1.0) * 2.0);

      // Fine ripple highlight riding on the swell.
      float ripple = sin((uv.x * 10.0 + uv.y * 4.0) + swell * 4.0 + t * 0.6);
      ripple = smoothstep(0.6, 1.0, ripple) * 0.06;
      color += ripple * vec3(0.2, 0.6, 0.8);

      // Sparse twinkling light glints, like light catching moving water:
      // a coarse grid of cells, most inactive, the rest a small soft dot
      // (not a filled square) that fades in and out.
      vec2 cellUv = uv * vec2(46.0 * aspect, 46.0) + vec2(t * 1.2, 0.0);
      vec2 cellId = floor(cellUv);
      vec2 cellPos = fract(cellUv) - 0.5;
      float seed = hash(cellId);
      float active = step(0.994, seed);
      float twinkle = sin(t * 3.0 + seed * 62.83) * 0.5 + 0.5;
      float dot = smoothstep(0.22, 0.0, length(cellPos));
      float spark = active * dot * pow(twinkle, 3.0);
      color += spark * 0.9 * vec3(0.6, 0.95, 1.0);

      gl_FragColor = vec4(color, 1.0);
    }
  `;

  function compileShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const info = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error('Shader compile error: ' + info);
    }
    return shader;
  }

  function initOcean(canvas) {
    const gl =
      canvas.getContext('webgl', { antialias: false }) ||
      canvas.getContext('experimental-webgl', { antialias: false });

    if (!gl) {
      document.body.classList.add('ocean-fallback');
      return null;
    }

    const vertexShader = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SRC);
    const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SRC);

    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error('Program link error: ' + gl.getProgramInfoLog(program));
    }
    gl.useProgram(program);

    // Fullscreen triangle covering [-1,1] in both axes.
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW,
    );

    const positionLoc = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(positionLoc);
    gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);

    const timeLoc = gl.getUniformLocation(program, 'u_time');
    const resolutionLoc = gl.getUniformLocation(program, 'u_resolution');

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.floor(canvas.clientWidth * dpr);
      const height = Math.floor(canvas.clientHeight * dpr);
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        gl.viewport(0, 0, width, height);
      }
    }

    let rafId = null;
    function render(timeMs) {
      resize();
      gl.uniform1f(timeLoc, timeMs * 0.001);
      gl.uniform2f(resolutionLoc, canvas.width, canvas.height);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      rafId = requestAnimationFrame(render);
    }

    window.addEventListener('resize', resize);
    rafId = requestAnimationFrame(render);

    return {
      stop() {
        if (rafId) cancelAnimationFrame(rafId);
        window.removeEventListener('resize', resize);
      },
    };
  }

  window.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('oceanCanvas');
    if (!canvas) return;
    try {
      initOcean(canvas);
    } catch (err) {
      console.error('Ocean shader failed, falling back to CSS gradient.', err);
      document.body.classList.add('ocean-fallback');
    }
  });
})();
