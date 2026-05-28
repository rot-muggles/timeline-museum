/* ============================================
   timeline.js — Timeline Rendering & Interaction
   ============================================ */

class Timeline {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.eventsContainer = document.getElementById('timeline-events');
    this.loadingEl = document.getElementById('timeline-loading');
    this.emptyEl = document.getElementById('timeline-empty');
    this.events = [];
    this.filteredEvents = [];
    this.activeCategory = 'all';
    this.searchQuery = '';
    this.zoomLevel = 1;
    this.scrollReveal = null;
    this.onEventClick = null;
  }

  async load() {
    this.showLoading();
    try {
      const res = await fetch('/api/events');
      const data = await res.json();
      this.events = data.events;
      this.filteredEvents = [...this.events];
      this.render();
    } catch (err) {
      console.error('Failed to load events:', err);
      this.emptyEl.style.display = 'block';
      this.emptyEl.querySelector('p').textContent = '加载失败，请检查网络连接';
    }
    this.hideLoading();
  }

  showLoading() {
    this.loadingEl.style.display = 'block';
    this.eventsContainer.innerHTML = '';
    this.emptyEl.style.display = 'none';
  }

  hideLoading() {
    this.loadingEl.style.display = 'none';
  }

  filter(category) {
    this.activeCategory = category;
    this.applyFilters();
  }

  search(query) {
    this.searchQuery = query.toLowerCase().trim();
    this.applyFilters();
  }

  applyFilters() {
    this.filteredEvents = this.events.filter(e => {
      const catMatch = this.activeCategory === 'all' || e.category === this.activeCategory;
      const searchMatch = !this.searchQuery ||
        e.title.toLowerCase().includes(this.searchQuery) ||
        e.description.toLowerCase().includes(this.searchQuery) ||
        e.tags.some(t => t.toLowerCase().includes(this.searchQuery)) ||
        (e.location && e.location.toLowerCase().includes(this.searchQuery));
      return catMatch && searchMatch;
    });
    this.render();
  }

  setZoom(level) {
    // 限制缩放范围 50% ~ 200%，用 scaleY 垂直拉伸事件间距
    this.zoomLevel = Math.max(0.5, Math.min(2, level));
    document.getElementById('zoom-label').textContent = Math.round(this.zoomLevel * 100) + '%';
    this.eventsContainer.style.transform = `scaleY(${this.zoomLevel})`;
    this.eventsContainer.style.transformOrigin = 'top center';
  }

  zoomIn() {
    this.setZoom(this.zoomLevel + 0.25);
  }

  zoomOut() {
    this.setZoom(this.zoomLevel - 0.25);
  }

  render() {
    if (this.filteredEvents.length === 0) {
      this.eventsContainer.innerHTML = '';
      this.emptyEl.style.display = 'block';
      return;
    }

    this.emptyEl.style.display = 'none';

    // Group events by year
    const grouped = {};
    this.filteredEvents.forEach(e => {
      const year = e.date.substring(0, 4);
      if (!grouped[year]) grouped[year] = [];
      grouped[year].push(e);
    });

    // Sort years
    // 同一年内的多件事按日期升序排列，新事件自动插入正确位置
    Object.values(grouped).forEach(events => {
      events.sort((a, b) => a.date.localeCompare(b.date));
    });

    const sortedYears = Object.keys(grouped).sort();

    let html = '';
    let eventIndex = 0;

    sortedYears.forEach(year => {
      html += `<div class="year-marker"><span>${year}</span></div>`;

      grouped[year].forEach((event, i) => {
        // 奇偶交替：第0个事件左边，第1个右边，以此类推
        const side = eventIndex % 2 === 0 ? 'left' : 'right';
        const featuredBadge = event.featured
          ? `<div class="event-featured">✦ 精选</div>`
          : '';

        const tagsHtml = event.tags
          .map(t => `<span class="event-tag">#${t}</span>`)
          .join('');

        const locationHtml = event.location
          ? `<div class="event-location">📍 ${event.location}</div>`
          : '';

        const iconMap = {
          baby: '👶', school: '🏫', code: '💻', celebration: '🎉',
          plane: '✈️', star: '⭐', trophy: '🏆', globe: '🌍',
          laptop: '💻', github: '🐙', bike: '🚴', briefcase: '💼',
          users: '👥', mountain: '🏔️', pen: '✍️', robot: '🤖',
          heart: '❤️',
        };
        const icon = iconMap[event.icon] || '📌';

        html += `
          <div class="timeline-event ${side} event-card ${event.category}"
               data-id="${event.id}"
               data-category="${event.category}">
            <div class="event-dot"></div>
            ${featuredBadge}
            <div class="event-date">${this.formatDate(event.date)}</div>
            <div class="event-icon">${icon}</div>
            <h3 class="event-title">${this.escapeHtml(event.title)}</h3>
            <p class="event-description">${this.escapeHtml(event.description)}</p>
            ${locationHtml}
            <div class="event-tags">${tagsHtml}</div>
          </div>
        `;

        eventIndex++;
      });
    });

    this.eventsContainer.innerHTML = html;

    // Setup scroll reveal for new elements
    document.querySelectorAll('.timeline-event, .year-marker').forEach(el => {
      if (this.scrollReveal) this.scrollReveal.observe(el);
    });

    // Setup click handlers
    document.querySelectorAll('.timeline-event').forEach(el => {
      el.addEventListener('click', () => {
        if (this.onEventClick) {
          const id = parseInt(el.dataset.id);
          const event = this.events.find(e => e.id === id);
          if (event) this.onEventClick(event);
        }
      });
    });
  }

  formatDate(dateStr) {
    const d = new Date(dateStr);
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    const day = d.getDate();
    return `${year} 年 ${month} 月 ${day} 日`;
  }

  // 用DOM API做HTML转义，防XSS
  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}

window.Timeline = Timeline;
