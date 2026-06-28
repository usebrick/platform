/* ============================================================
   Brick shader — full-bleed WebGL fragment shader hero.
   Renders a procedural brick wall with running-bond stagger,
   parallax on mouse, fade on scroll, and a 60s ambient pulse.
   Falls back to a static SVG picture on mobile.
   ============================================================ */

interface Uniforms {
  u_resolution: WebGLUniformLocation | null;
  u_mouse: WebGLUniformLocation | null;
  u_time: WebGLUniformLocation | null;
  u_scroll: WebGLUniformLocation | null;
}

const VERTEX = `
  attribute vec2 a_position;
  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`;

const FRAGMENT = `
  precision mediump float;
  uniform vec2 u_resolution;
  uniform vec2 u_mouse;
  uniform float u_time;
  uniform float u_scroll;

  void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution.xy;

    // Brick cell coords (12 cols × 18 rows)
    vec2 cell = floor(vec2(uv.x * 12.0, uv.y * 18.0));

    // Half-bond stagger — every other row offset by half a brick
    if (mod(cell.y, 2.0) > 0.5) cell.x += 0.5;

    // Brick color varies with vertical position (mortar darkens bottom)
    vec3 brickColor = mix(
      vec3(0.42, 0.18, 0.10),
      vec3(0.72, 0.35, 0.18),
      uv.y
    );

    // Per-brick position within the cell (0..1)
    vec2 brickUv = fract(vec2(uv.x * 12.0, uv.y * 18.0));

    // Mortar lines at the edges of each brick
    float mortar =
      step(brickUv.x, 0.04) +
      step(0.96, brickUv.x) +
      step(brickUv.y, 0.04) +
      step(0.96, brickUv.y);

    // Mouse parallax — subtle horizontal shift, max ±5°
    float parallax = u_mouse.x * 0.05 * (uv.y - 0.5);

    // Scroll-driven fade — the wall dims as the user scrolls
    float fade = 1.0 - u_scroll * 0.7;

    // Ambient pulse — 60s cycle, subtle brick "breathing"
    float pulse = 0.5 + 0.5 * sin(u_time * 0.1);
    mortar *= (0.4 + pulse * 0.4);

    // Composite
    vec3 col = mix(brickColor, vec3(0.10, 0.05, 0.03), mortar);
    col *= fade;
    col += vec3(parallax * 0.04); // subtle parallax warmth

    gl_FragColor = vec4(col, 1.0);
  }
`;

export function initBrickShader(canvas: HTMLCanvasElement): () => void {
  const gl = canvas.getContext('webgl', { antialias: false, alpha: false });
  if (!gl) {
    canvas.style.display = 'none';
    return () => {};
  }

  // Compile vertex + fragment shaders
  const vs = gl.createShader(gl.VERTEX_SHADER)!;
  gl.shaderSource(vs, VERTEX);
  gl.compileShader(vs);
  if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
    console.error('vertex shader:', gl.getShaderInfoLog(vs));
    return () => {};
  }

  const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
  gl.shaderSource(fs, FRAGMENT);
  gl.compileShader(fs);
  if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
    console.error('fragment shader:', gl.getShaderInfoLog(fs));
    return () => {};
  }

  const program = gl.createProgram()!;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error('program link:', gl.getProgramInfoLog(program));
    return () => {};
  }
  gl.useProgram(program);

  // Fullscreen quad
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
    gl.STATIC_DRAW
  );
  const posLoc = gl.getAttribLocation(program, 'a_position');
  gl.enableVertexAttribArray(posLoc);
  gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

  // Uniforms
  const uniforms: Uniforms = {
    u_resolution: gl.getUniformLocation(program, 'u_resolution'),
    u_mouse: gl.getUniformLocation(program, 'u_mouse'),
    u_time: gl.getUniformLocation(program, 'u_time'),
    u_scroll: gl.getUniformLocation(program, 'u_scroll'),
  };

  // State
  const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
  let scroll = 0;
  const tStart = performance.now();

  const onMouse = (e: MouseEvent) => {
    mouse.tx = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.ty = (e.clientY / window.innerHeight) * 2 - 1;
  };
  const onScroll = () => {
    const max = window.innerHeight * 1.5;
    scroll = Math.min(1, window.scrollY / max);
  };

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const w = Math.floor(canvas.clientWidth * dpr);
    const h = Math.floor(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      gl!.viewport(0, 0, w, h);
    }
  }
  resize();
  window.addEventListener('resize', resize);
  window.addEventListener('mousemove', onMouse);
  window.addEventListener('scroll', onScroll, { passive: true });

  // ResizeObserver for layout-driven size changes
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);

  let raf = 0;
  function render() {
    raf = requestAnimationFrame(render);
    // Lerp the mouse for a 100ms easing
    mouse.x += (mouse.tx - mouse.x) * 0.08;
    mouse.y += (mouse.ty - mouse.y) * 0.08;

    const t = (performance.now() - tStart) / 1000;
    gl!.uniform2f(uniforms.u_resolution, canvas.width, canvas.height);
    gl!.uniform2f(uniforms.u_mouse, mouse.x, -mouse.y);
    gl!.uniform1f(uniforms.u_time, t);
    gl!.uniform1f(uniforms.u_scroll, scroll);
    gl!.drawArrays(gl!.TRIANGLES, 0, 6);
  }
  render();

  // Cleanup
  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', resize);
    window.removeEventListener('mousemove', onMouse);
    window.removeEventListener('scroll', onScroll);
    ro.disconnect();
  };
}
