/* ============================================
   effects.js — Breathing Particles + Custom Cursor
   ============================================ */

// ── Three.js Particle System ──
class ParticleSystem {
  constructor() {
    this.canvas = document.getElementById('particle-canvas');
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      alpha: true,
      antialias: true,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      100
    );
    this.camera.position.z = 6;
    this.mouse = { x: 0, y: 0 };
    this.targetMouse = { x: 0, y: 0 };
    this.clock = new THREE.Clock();

    // Particle layers
    this.nearParticles = null;  // closer, larger, slower — "dust motes"
    this.farParticles = null;   // distant, tiny — "stars"

    this.init();
  }

  init() {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.createNearParticles();
    this.createFarParticles();

    window.addEventListener('mousemove', (e) => {
      this.targetMouse.x = (e.clientX / window.innerWidth) * 2 - 1;
      this.targetMouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    });

    window.addEventListener('resize', () => this.resize());
    this.animate();
  }

  createNearParticles() {
    const count = 120;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const randoms = new Float32Array(count); // per-particle random phase

    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 14;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 18;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 4;
      randoms[i] = Math.random() * Math.PI * 2;
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('random', new THREE.BufferAttribute(randoms, 1));

    const mat = new THREE.PointsMaterial({
      size: 0.025,
      color: 0xd4a574,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      opacity: 0.35,
    });

    this.nearParticles = new THREE.Points(geo, mat);
    this.nearParticles.userData = { positions, randoms, count };
    this.scene.add(this.nearParticles);
  }

  createFarParticles() {
    const count = 300;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 24;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 24;
      positions[i * 3 + 2] = -2 - Math.random() * 5;
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const mat = new THREE.PointsMaterial({
      size: 0.012,
      color: 0xc4b898,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      opacity: 0.3,
    });

    this.farParticles = new THREE.Points(geo, mat);
    this.farParticles.userData = { positions, count };
    this.scene.add(this.farParticles);
  }

  resize() {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }

  animate() {
    requestAnimationFrame(() => this.animate());

    const dt = Math.min(this.clock.getDelta(), 0.1);
    const time = performance.now() * 0.001;

    // Smooth mouse follow (very damped — gentle parallax)
    this.mouse.x += (this.targetMouse.x - this.mouse.x) * 0.8 * dt;
    this.mouse.y += (this.targetMouse.y - this.mouse.y) * 0.8 * dt;

    // ── Near particles: slow drift + subtle breathing ──
    if (this.nearParticles) {
      const { positions, randoms, count } = this.nearParticles.userData;
      const arr = this.nearParticles.geometry.attributes.position.array;

      for (let i = 0; i < count; i++) {
        const baseX = positions[i * 3];
        const baseY = positions[i * 3 + 1];
        const baseZ = positions[i * 3 + 2];
        const phase = randoms[i];

        // Gentle sine-wave breathing on Y axis
        const breathe = Math.sin(time * 0.4 + phase) * 0.3;
        arr[i * 3] = baseX + Math.cos(time * 0.3 + phase) * 0.15;
        arr[i * 3 + 1] = baseY + breathe;
        arr[i * 3 + 2] = baseZ + Math.sin(time * 0.35 + phase) * 0.1;
      }
      this.nearParticles.geometry.attributes.position.needsUpdate = true;

      // 缓慢自转，制造星云流动感
      this.nearParticles.rotation.y += 0.00015;
      this.nearParticles.rotation.x += 0.00008;

      // 鼠标视差：粒子层跟随鼠标微移，幅度克制不抢戏
      this.nearParticles.position.x +=
        (this.mouse.x * 0.4 - this.nearParticles.position.x) * 0.6 * dt;
      this.nearParticles.position.y +=
        (this.mouse.y * 0.25 - this.nearParticles.position.y) * 0.6 * dt;

      // 呼吸感：整体透明度随时间正弦波动
      const breatheCycle = Math.sin(time * 0.25) * 0.08;
      this.nearParticles.material.opacity = 0.35 + breatheCycle;
    }

    // ── Far particles: imperceptible drift ──
    if (this.farParticles) {
      this.farParticles.rotation.y += 0.00006;
      this.farParticles.rotation.x += 0.00003;

      this.farParticles.position.x +=
        (this.mouse.x * 0.15 - this.farParticles.position.x) * 0.3 * dt;
      this.farParticles.position.y +=
        (this.mouse.y * 0.1 - this.farParticles.position.y) * 0.3 * dt;
    }

    this.renderer.render(this.scene, this.camera);
  }
}

// ── Custom Cursor ──
class CustomCursor {
  constructor() {
    this.cursor = document.getElementById('cursor');
    this.trail = document.getElementById('cursor-trail');
    this.pos = { x: -100, y: -100 };
    this.trailPos = { x: -100, y: -100 };
    this.isHovering = false;

    if ('ontouchstart' in window) {
      this.cursor.style.display = 'none';
      this.trail.style.display = 'none';
      document.body.style.cursor = 'auto';
      return;
    }

    this.init();
  }

  init() {
    document.addEventListener('mousemove', (e) => {
      this.pos.x = e.clientX;
      this.pos.y = e.clientY;
    });

    const hoverTargets = document.querySelectorAll(
      'a, button, .event-card, .filter-chip, .nav-link, .search-input, .zoom-btn, .view-toggle, .theme-toggle, .timeline-event'
    );

    hoverTargets.forEach(el => {
      el.addEventListener('mouseenter', () => {
        this.isHovering = true;
        this.cursor.classList.add('hover');
        this.trail.classList.add('hover');
      });
      el.addEventListener('mouseleave', () => {
        this.isHovering = false;
        this.cursor.classList.remove('hover');
        this.trail.classList.remove('hover');
      });
    });

    this.animate();
  }

  animate() {
    requestAnimationFrame(() => this.animate());

    // Trail follows with spring-like damping
    this.trailPos.x += (this.pos.x - this.trailPos.x) * 0.12;
    this.trailPos.y += (this.pos.y - this.trailPos.y) * 0.12;

    this.cursor.style.left = this.pos.x + 'px';
    this.cursor.style.top = this.pos.y + 'px';
    this.trail.style.left = this.trailPos.x + 'px';
    this.trail.style.top = this.trailPos.y + 'px';
  }
}

// ── Scroll-triggered reveal ──
class ScrollReveal {
  constructor() {
    this.observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
    );
  }

  observe(el) { this.observer.observe(el); }
  unobserve(el) { this.observer.unobserve(el); }
}

window.ParticleSystem = ParticleSystem;
window.CustomCursor = CustomCursor;
window.ScrollReveal = ScrollReveal;
