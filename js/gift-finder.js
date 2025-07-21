// Sistema de Busca de Presentes
class GiftFinder {
  constructor() {
    this.isSearching = false;
    this.currentResults = [];
  }

  async findGifts(profileData) {
    if (this.isSearching) return;
    
    this.isSearching = true;
    
    try {
      // Verificar se usuário está logado
      if (!window.authManager.isAuthenticated()) {
        throw new Error('Você precisa estar logado para buscar presentes');
      }

      const response = await window.authManager.makeAuthenticatedRequest('/api/gifts/find-gifts', {
        method: 'POST',
        body: JSON.stringify(profileData)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Erro na busca de presentes');
      }

      const data = await response.json();
      this.currentResults = data.gifts;
      
      // Registrar busca nas estatísticas
      await this.trackSearch(data.gifts.length, data.analysis.processingTime);
      
      return data;
    } catch (error) {
      console.error('Erro na busca:', error);
      throw error;
    } finally {
      this.isSearching = false;
    }
  }

  async trackSearch(giftsFound, processingTime) {
    try {
      const userId = window.authManager.user?.id;
      const sessionId = this.getSessionId();
      
      await fetch('/api/track-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          userId,
          processingTime: parseFloat(processingTime) * 1000, // converter para ms
          giftsFound,
          userSatisfied: null
        })
      });
    } catch (error) {
      console.error('Erro ao registrar busca:', error);
    }
  }

  async trackInteraction(giftName, store, action) {
    try {
      const userId = window.authManager.user?.id;
      if (!userId) return;

      await fetch('/api/track-interaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          giftName,
          store,
          action
        })
      });
    } catch (error) {
      console.error('Erro ao registrar interação:', error);
    }
  }

  async submitFeedback(rating, satisfied, comments = '') {
    try {
      const response = await window.authManager.makeAuthenticatedRequest('/api/gifts/feedback', {
        method: 'POST',
        body: JSON.stringify({
          searchId: this.lastSearchId,
          rating,
          satisfied,
          comments
        })
      });

      if (response.ok) {
        // Atualizar estatísticas localmente
        await window.statsTracker.loadCurrentStats();
        return true;
      }
      return false;
    } catch (error) {
      console.error('Erro ao enviar feedback:', error);
      return false;
    }
  }

  getSessionId() {
    let sessionId = localStorage.getItem('giftgenius_session');
    if (!sessionId) {
      sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      localStorage.setItem('giftgenius_session', sessionId);
    }
    return sessionId;
  }

  renderGifts(gifts, containerId = 'gifts-grid') {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = gifts.map(gift => this.createGiftCard(gift)).join('');
    
    // Adicionar event listeners
    this.attachGiftEventListeners();
  }

  createGiftCard(gift) {
    return `
      <div class="gift-card" data-gift-name="${gift.name}" data-store="${gift.store}">
        <div class="gift-image">
          <img src="${gift.image}" alt="${gift.name}" loading="lazy">
          <button class="gift-like" data-action="like">
            <i class="fas fa-heart"></i>
          </button>
          <div class="gift-store">${gift.store}</div>
        </div>
        
        <div class="gift-content">
          <div class="gift-header">
            <h3 class="gift-title">${gift.name}</h3>
            <span class="gift-category">Presente</span>
          </div>
          
          <div class="gift-rating">
            <div class="stars">
              ${this.renderStars(gift.rating)}
            </div>
            <span class="rating-text">${gift.rating} (${gift.reviews})</span>
          </div>
          
          <div class="gift-footer">
            <div class="gift-price">
              <div class="current-price">R$ ${gift.price.toFixed(2)}</div>
            </div>
            <button class="buy-button" data-action="click" data-url="${gift.url}">
              <i class="fas fa-shopping-cart"></i>
              Comprar
              <i class="fas fa-external-link-alt"></i>
            </button>
          </div>
        </div>
      </div>
    `;
  }

  renderStars(rating) {
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 >= 0.5;
    let stars = '';
    
    for (let i = 0; i < fullStars; i++) {
      stars += '<i class="fas fa-star star"></i>';
    }
    
    if (hasHalfStar) {
      stars += '<i class="fas fa-star-half-alt star"></i>';
    }
    
    const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);
    for (let i = 0; i < emptyStars; i++) {
      stars += '<i class="far fa-star star"></i>';
    }
    
    return stars;
  }

  attachGiftEventListeners() {
    // Botões de like
    document.querySelectorAll('.gift-like').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const card = btn.closest('.gift-card');
        const giftName = card.dataset.giftName;
        const store = card.dataset.store;
        
        btn.classList.toggle('liked');
        this.trackInteraction(giftName, store, 'like');
      });
    });

    // Botões de compra
    document.querySelectorAll('.buy-button').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const card = btn.closest('.gift-card');
        const giftName = card.dataset.giftName;
        const store = card.dataset.store;
        const url = btn.dataset.url;
        
        this.trackInteraction(giftName, store, 'click');
        window.open(url, '_blank');
      });
    });

    // Visualização de presentes
    document.querySelectorAll('.gift-card').forEach(card => {
      card.addEventListener('mouseenter', () => {
        const giftName = card.dataset.giftName;
        const store = card.dataset.store;
        this.trackInteraction(giftName, store, 'view');
      });
    });
  }
}

// Instância global
window.giftFinder = new GiftFinder();