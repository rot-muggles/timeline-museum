/* ============================================
   main.js — App Orchestration
   ============================================ */

(function () {
  'use strict';

  let particleSystem, cursor, scrollReveal, timeline;
  let isAltView = false;

  function init() {
    particleSystem = new ParticleSystem();
    cursor = new CustomCursor();
    scrollReveal = new ScrollReveal();

    timeline = new Timeline('timeline-container');
    timeline.scrollReveal = scrollReveal;

    loadProfile();
    loadSiteSettings();
    loadStats();
    timeline.load();
    timeline.onEventClick = (event) => openLightbox(event);

    bindFilters();
    bindSearch();
    bindZoom();
    bindViewToggle();
    bindLightbox();
    bindNavScroll();
    bindSmoothScroll();
    bindTheme();
    bindGsapParallax();
    bindKeyboardNav();

    // 初始化完成标记（浏览器控制台可见）
    console.log('%c✦ 时间线博物馆已就绪 %c— 每个像素都有存在的理由',
      'color: #d4a574', 'color: #8b8b82');
  }

  // ── Profile ──
  async function loadProfile() {
    try {
      const res = await fetch('/api/events');
      const data = await res.json();
      const p = data.profile;

      document.getElementById('hero-name').textContent = p.name;
      document.getElementById('hero-bio').textContent = p.bio;
      document.title = p.name + ' | 时间线博物馆';

      const social = document.getElementById('hero-social');
      social.innerHTML = `
        <a href="${p.social.github}" target="_blank" rel="noopener">GitHub</a>
        <a href="${p.social.blog}" target="_blank" rel="noopener">Blog</a>
        <a href="mailto:${p.social.email}">Email</a>
      `;
    } catch (err) {
      console.error('Profile load failed:', err);
    }
  }

  // ── Site Settings ──
  async function loadSiteSettings() {
    try {
      const res = await fetch('/api/site');
      const s = await res.json();
      document.getElementById('footer-quote').textContent = s.footer_quote || '';
      document.getElementById('footer-copy').textContent = s.footer_copy || '';
      document.getElementById('hero-scroll-hint').textContent = s.hero_scroll_hint || '';
    } catch (err) {
      console.error('Site settings load failed:', err);
    }
  }

  // ── Stats ──
  async function loadStats() {
    try {
      const res = await fetch('/api/stats');
      const stats = await res.json();

      const catLabels = {
        life: '人生时刻', education: '学业旅程', project: '项目作品',
        travel: '旅行足迹', achievement: '成就荣誉',
      };

      const grid = document.getElementById('stats-grid');
      grid.innerHTML = `
        <div class="stat-card"><div class="stat-number">${stats.total}</div><div class="stat-label">重要时刻</div></div>
        <div class="stat-card"><div class="stat-number">${stats.year_span}</div><div class="stat-label">时间跨度</div></div>
        <div class="stat-card"><div class="stat-number">${stats.year_count}</div><div class="stat-label">个年份</div></div>
        ${Object.entries(stats.categories).map(([cat, count]) => `
          <div class="stat-card"><div class="stat-number">${count}</div><div class="stat-label">${catLabels[cat] || cat}</div></div>
        `).join('')}
      `;

      const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry, i) => {
          if (entry.isIntersecting) {
            setTimeout(() => entry.target.classList.add('visible'), i * 60);
            observer.unobserve(entry.target);
          }
        });
      }, { threshold: 0.2 });

      grid.querySelectorAll('.stat-card').forEach(c => observer.observe(c));
    } catch (err) {
      console.error('Stats load failed:', err);
    }
  }

  // ── Filters ──
  function bindFilters() {
    document.querySelectorAll('.filter-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        timeline.filter(chip.dataset.category);

        // Scroll to timeline if above it
        const timelineSection = document.querySelector('.timeline-section');
        if (timelineSection && window.scrollY < timelineSection.offsetTop - 200) {
          timelineSection.scrollIntoView({ behavior: 'smooth' });
        }
      });
    });
  }

  // ── Search ──
  function bindSearch() {
    const input = document.getElementById('search-input');
    let timeout;
    input.addEventListener('input', () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => timeline.search(input.value), 180);
    });
    // Clear on Escape
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { input.value = ''; timeline.search(''); input.blur(); }
    });
  }

  // ── Zoom ──
  function bindZoom() {
    document.getElementById('zoom-in').addEventListener('click', () => timeline.zoomIn());
    document.getElementById('zoom-out').addEventListener('click', () => timeline.zoomOut());

    // Ctrl+滚轮缩放时间线间距
    window.addEventListener('wheel', (e) => {
      if (e.ctrlKey) {
        e.preventDefault();  // 阻止浏览器的默认缩放
        if (e.deltaY < 0) timeline.zoomIn();
        else timeline.zoomOut();
      }
    }, { passive: false });  // passive=false 才能调用 preventDefault
  }

  // ── View Toggle ──
  function bindViewToggle() {
    document.getElementById('view-toggle').addEventListener('click', () => {
      isAltView = !isAltView;
      const icon = document.querySelector('.view-icon');
      const events = document.querySelector('.timeline-events');
      if (isAltView) {
        icon.textContent = '↔';
        events.style.flexDirection = 'row';
        events.style.overflowX = 'auto';
        events.style.gap = '0';
        document.querySelectorAll('.timeline-event').forEach(el => {
          el.style.width = '320px';
          el.style.minWidth = '320px';
          el.style.alignSelf = 'auto';
          el.style.textAlign = 'left';
          el.style.padding = '0 16px 32px';
        });
      } else {
        icon.textContent = '↕';
        events.style.flexDirection = 'column';
        events.style.overflowX = 'hidden';
        events.style.gap = '0';
        document.querySelectorAll('.timeline-event').forEach(el => {
          el.style.width = '';
          el.style.minWidth = '';
          el.style.alignSelf = '';
          el.style.textAlign = '';
          el.style.padding = '';
        });
        // Re-render to restore left/right alternation
        timeline.render();
      }
    });
  }

  // ── Lightbox ──
  function bindLightbox() {
    document.getElementById('lightbox-close').addEventListener('click', closeLightbox);
    document.querySelector('.lightbox-backdrop').addEventListener('click', closeLightbox);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeLightbox();
    });
  }

  function openLightbox(event) {
    const lightbox = document.getElementById('lightbox');
    const body = document.getElementById('lightbox-body');

    const iconMap = {
      baby: '👶', school: '🏫', code: '💻', celebration: '🎉',
      plane: '✈️', star: '⭐', trophy: '🏆', globe: '🌍',
      laptop: '💻', github: '🐙', bike: '🚴', briefcase: '💼',
      users: '👥', mountain: '🏔️', pen: '✍️', robot: '🤖', heart: '❤️',
    };

    body.innerHTML = `
      <div class="event-card ${event.category}">
        ${event.featured ? '<div class="event-featured">✦ 精选</div>' : ''}
        <div class="event-date">${formatDate(event.date)}</div>
        <div class="event-icon">${iconMap[event.icon] || '📌'}</div>
        <h3 class="event-title">${event.title}</h3>
        <p class="event-description">${event.description}</p>
        ${event.location ? `<div class="event-location">📍 ${event.location}</div>` : ''}
        <div class="event-tags">${event.tags.map(t => `<span class="event-tag">#${t}</span>`).join('')}</div>
      </div>
    `;

    lightbox.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeLightbox() {
    document.getElementById('lightbox').classList.remove('open');
    document.body.style.overflow = '';
  }

  // ── Nav scroll effect ──
  function bindNavScroll() {
    const nav = document.getElementById('nav');
    const progressBar = document.getElementById('progress-bar');

    window.addEventListener('scroll', () => {
      if (window.scrollY > 40) {
        nav.classList.add('scrolled');
      } else {
        nav.classList.remove('scrolled');
      }

      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      const pct = docHeight > 0 ? (window.scrollY / docHeight) * 100 : 0;
      progressBar.style.width = Math.min(pct, 100) + '%';
    }, { passive: true });
  }

  // ── Smooth scroll ──
  function bindSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const target = document.querySelector(link.getAttribute('href'));
        if (target) target.scrollIntoView({ behavior: 'smooth' });
      });
    });
  }

  // ── Theme ──
  function bindTheme() {
    const toggle = document.getElementById('theme-toggle');
    const icon = toggle.querySelector('.theme-icon');

    // Load saved
    const saved = localStorage.getItem('timeline-theme') || 'dark';
    applyTheme(saved, icon);

    toggle.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme');
      const next = current === 'light' ? 'dark' : 'light';
      applyTheme(next, icon);
      localStorage.setItem('timeline-theme', next);
    });

    // Listen for system preference changes
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      if (!localStorage.getItem('timeline-theme')) {
        applyTheme(e.matches ? 'dark' : 'light', icon);
      }
    });
  }

  function applyTheme(theme, icon) {
    // 切换 data-theme 属性触发CSS变量切换
    // 添加过渡class让颜色切换有短暂动画
    document.documentElement.classList.add('theme-transitioning');
    document.documentElement.setAttribute('data-theme', theme);
    if (icon) icon.textContent = theme === 'light' ? '☀️' : '🌙';
    // 600ms后移除过渡标记，匹配CSS的transition时长
    setTimeout(() => {
      document.documentElement.classList.remove('theme-transitioning');
    }, 600);
  }

  // ── GSAP Parallax ──
  function bindGsapParallax() {
    if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') return;
    gsap.registerPlugin(ScrollTrigger);

    // Hero fade out on scroll
    gsap.to('.hero-content', {
      y: 120,
      opacity: 0,
      ease: 'none',
      scrollTrigger: {
        trigger: '.hero',
        start: 'top top',
        end: 'bottom top',
        scrub: 1,
      },
    });

    // Stats cards stagger in
    gsap.fromTo('.stat-card', {
      y: 40,
      opacity: 0,
    }, {
      y: 0,
      opacity: 1,
      stagger: 0.06,
      duration: 0.8,
      ease: 'power3.out',
      scrollTrigger: {
        trigger: '.stats-grid',
        start: 'top 85%',
        toggleActions: 'play none none none',
      },
    });
  }

  // ── Keyboard navigation ──
  function bindKeyboardNav() {
    document.addEventListener('keydown', (e) => {
      // 'F' to focus search
      if (e.key === 'f' && e.ctrlKey === false && e.metaKey === false &&
          document.activeElement === document.body) {
        e.preventDefault();
        document.getElementById('search-input').focus();
      }
    });
  }

  function formatDate(dateStr) {
    const d = new Date(dateStr);
    return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日`;
  }

  // ── Boot ──
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
