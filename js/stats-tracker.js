// Sistema de tracking no frontend
class StatsTracker {
  constructor() {
    this.sessionId = this.generateSessionId();
    this.searchStartTime = null;
    this.hasTrackedUser = false;
    
    // Inicializar tracking
    this.initializeTracking();
  }
  
  generateSessionId() {
    return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }
  
  async initializeTracking() {
    // Registrar usuário único
    if (!this.hasTrackedUser) {
      await this.trackUser();
      this.hasTrackedUser = true;
    }
    
    // Carregar estatísticas atuais
    await this.loadCurrentStats();
  }
  
  async trackUser() {
    try {
      await fetch('/api/track-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: this.sessionId })
      });
    } catch (error) {
      console.error('Erro ao registrar usuário:', error);
    }
  }
  
  startSearch() {
    this.searchStartTime = Date.now();
  }
  
  async endSearch(giftsFound, userSatisfied = null) {
    if (!this.searchStartTime) return;
    
    const processingTime = Date.now() - this.searchStartTime;
    
    try {
      await fetch('/api/track-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: this.sessionId,
          processingTime,
          giftsFound,
          userSatisfied
        })
      });
      
      // Atualizar estatísticas na tela
      await this.loadCurrentStats();
      
    } catch (error) {
      console.error('Erro ao registrar busca:', error);
    }
  }
  
  async loadCurrentStats() {
    try {
      const response = await fetch('/api/stats');
      const stats = await response.json();
      
      // Atualizar elementos na página
      this.updateStatsDisplay(stats);
      
    } catch (error) {
      console.error('Erro ao carregar estatísticas:', error);
    }
  }
  
  updateStatsDisplay(stats) {
    // Atualizar números na homepage
    const elements = {
      'gifts-found': this.formatNumber(stats.gifts_found),
      'satisfaction-rate': stats.satisfaction_rate,
      'avg-time': stats.avg_processing_time,
      'total-users': this.formatNumber(stats.total_users)
    };
    
    Object.entries(elements).forEach(([id, value]) => {
      const element = document.getElementById(id);
      if (element) {
        this.animateNumber(element, value);
      }
    });
    
    // Atualizar timestamp de última atualização
    const lastUpdateElement = document.getElementById('last-update');
    if (lastUpdateElement) {
      const updateTime = new Date(stats.last_price_update);
      lastUpdateElement.textContent = `Última atualização: ${updateTime.toLocaleString('pt-BR')}`;
    }
  }
  
  formatNumber(num) {
    if (num >= 1000) {
      return (num / 1000).toFixed(0) + 'k+';
    }
    return num.toString();
  }
  
  animateNumber(element, newValue) {
    const currentValue = element.textContent;
    if (currentValue !== newValue) {
      element.style.transform = 'scale(1.1)';
      element.style.color = '#8b5cf6';
      
      setTimeout(() => {
        element.textContent = newValue;
        element.style.transform = 'scale(1)';
        element.style.color = '';
      }, 200);
    }
  }
  
  // Método para feedback do usuário
  async submitFeedback(rating, comments = '') {
    const satisfied = rating >= 4;
    
    try {
      await fetch('/api/track-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: this.sessionId,
          processingTime: 0,
          giftsFound: 0,
          userSatisfied: satisfied,
          feedback: comments
        })
      });
      
      await this.loadCurrentStats();
      
    } catch (error) {
      console.error('Erro ao enviar feedback:', error);
    }
  }
}

// Inicializar tracker globalmente
window.statsTracker = new StatsTracker();

// Integração com o formulário existente
document.addEventListener('DOMContentLoaded', () => {
  // Hook no formulário de questionário
  const questionnaireForm = document.getElementById('questionnaire-form');
  if (questionnaireForm) {
    questionnaireForm.addEventListener('submit', () => {
      window.statsTracker.startSearch();
    });
  }
  
  // Hook na página de resultados
  if (window.location.pathname.includes('resultados')) {
    // Simular que encontrou presentes
    const giftCards = document.querySelectorAll('.gift-card');
    window.statsTracker.endSearch(giftCards.length);
  }
  
  // Atualizar estatísticas a cada 30 segundos
  setInterval(() => {
    window.statsTracker.loadCurrentStats();
  }, 30000);
});