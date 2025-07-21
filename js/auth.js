// Sistema de Autenticação Frontend
class AuthManager {
  constructor() {
    this.token = localStorage.getItem('giftgenius_token');
    this.user = JSON.parse(localStorage.getItem('giftgenius_user') || 'null');
    this.initializeAuth();
  }

  initializeAuth() {
    // Verificar se token ainda é válido
    if (this.token) {
      this.validateToken();
    }
    
    // Atualizar UI baseado no estado de autenticação
    this.updateAuthUI();
  }

  async validateToken() {
    try {
      const response = await fetch('/api/auth/profile', {
        headers: {
          'Authorization': `Bearer ${this.token}`
        }
      });

      if (!response.ok) {
        this.logout();
        return false;
      }

      const data = await response.json();
      this.user = data.user;
      localStorage.setItem('giftgenius_user', JSON.stringify(this.user));
      return true;
    } catch (error) {
      console.error('Erro ao validar token:', error);
      this.logout();
      return false;
    }
  }

  async login(email, password) {
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email, password })
      });

      const data = await response.json();

      if (!response.ok) {
        return { 
          success: false, 
          error: data.error || 'Erro no login',
          needsVerification: data.needsVerification || false
        };
      }

      // Salvar token e dados do usuário
      this.token = data.token;
      this.user = data.user;
      
      localStorage.setItem('giftgenius_token', this.token);
      localStorage.setItem('giftgenius_user', JSON.stringify(this.user));

      this.updateAuthUI();
      
      return { success: true, user: this.user };
    } catch (error) {
      console.error('Erro no login:', error);
      return { success: false, error: error.message };
    }
  }

  async register(name, email, password) {
    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ name, email, password })
      });

      const data = await response.json();

      if (!response.ok) {
        return { 
          success: false, 
          error: data.error || 'Erro no cadastro',
          needsVerification: data.needsVerification || false
        };
      }

      // Após cadastro, fazer login automaticamente
      if (data.needsVerification) {
        return { 
          success: true, 
          needsVerification: true,
          message: data.message 
        };
      } else {
        return await this.login(email, password);
      }
    } catch (error) {
      console.error('Erro no cadastro:', error);
      return { success: false, error: error.message };
    }
  }

  logout() {
    this.token = null;
    this.user = null;
    localStorage.removeItem('giftgenius_token');
    localStorage.removeItem('giftgenius_user');
    this.updateAuthUI();
  }

  updateAuthUI() {
    const loginButtons = document.querySelectorAll('.auth-login');
    const logoutButtons = document.querySelectorAll('.auth-logout');
    const userInfo = document.querySelectorAll('.auth-user-info');
    const dashboardBtn = document.getElementById('dashboard-btn');

    if (this.isAuthenticated()) {
      // Usuário logado
      loginButtons.forEach(btn => btn.style.display = 'none');
      logoutButtons.forEach(btn => btn.style.display = 'inline-flex');
      userInfo.forEach(info => {
        info.style.display = 'inline-flex';
        info.textContent = `Olá, ${this.user.name}`;
      });
      if (dashboardBtn) dashboardBtn.style.display = 'inline-flex';
    } else {
      // Usuário não logado
      loginButtons.forEach(btn => btn.style.display = 'inline-flex');
      logoutButtons.forEach(btn => btn.style.display = 'none');
      userInfo.forEach(info => info.style.display = 'none');
      if (dashboardBtn) dashboardBtn.style.display = 'none';
    }
  }

  isAuthenticated() {
    return this.token && this.user;
  }

  getAuthHeaders() {
    return this.token ? {
      'Authorization': `Bearer ${this.token}`,
      'Content-Type': 'application/json'
    } : {
      'Content-Type': 'application/json'
    };
  }

  async makeAuthenticatedRequest(url, options = {}) {
    const headers = this.getAuthHeaders();
    
    const response = await fetch(url, {
      ...options,
      headers: {
        ...headers,
        ...options.headers
      }
    });

    if (response.status === 401) {
      this.logout();
      window.location.href = '/login';
      return null;
    }

    return response;
  }
}

// Instância global
window.authManager = new AuthManager();

// Event listeners para formulários de login/cadastro
document.addEventListener('DOMContentLoaded', () => {
  // Formulário de login
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const email = document.getElementById('login-email').value;
      const password = document.getElementById('login-password').value;
      const button = loginForm.querySelector('button[type="submit"]');
      
      button.textContent = 'Entrando...';
      button.disabled = true;
      
      const result = await window.authManager.login(email, password);
      
      if (result.success) {
        alert('Login realizado com sucesso!');
        window.location.href = '/';
      } else {
        alert('Erro: ' + result.error);
        button.textContent = 'Entrar';
        button.disabled = false;
      }
    });
  }

  // Formulário de cadastro
  const registerForm = document.getElementById('register-form');
  if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const name = document.getElementById('register-name').value;
      const email = document.getElementById('register-email').value;
      const password = document.getElementById('register-password').value;
      const button = registerForm.querySelector('button[type="submit"]');
      
      button.textContent = 'Criando conta...';
      button.disabled = true;
      
      const result = await window.authManager.register(name, email, password);
      
      if (result.success) {
        if (result.needsVerification) {
          localStorage.setItem('verification_email', email);
          window.location.href = '/verify-email.html';
        } else {
          alert('Conta criada com sucesso!');
          window.location.href = '/';
        }
      } else {
        alert('Erro: ' + result.error);
        button.textContent = 'Criar conta gratuita';
        button.disabled = false;
      }
    });
  }

  // Botões de logout
  document.querySelectorAll('.auth-logout').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      window.authManager.logout();
      window.location.href = '/';
    });
  });
});