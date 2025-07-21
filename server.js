// Carregar variáveis de ambiente PRIMEIRO
require('dotenv').config();

// Servidor principal
const express = require('express');
const path = require('path');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { router: statsRouter, initializeDatabase } = require('./api/stats');
const { router: authRouter } = require('./api/auth');
const giftsRouter = require('./api/gifts');
const stripeRouter = require('./api/stripe');

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// Rotas da API
app.use('/api', statsRouter);
app.use('/api/auth', authRouter);
app.use('/api/gifts', giftsRouter);
app.use('/api/stripe', stripeRouter);

// Servir arquivos estáticos
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/questionario', (req, res) => {
  res.sendFile(path.join(__dirname, 'questionario.html'));
});

app.get('/processando', (req, res) => {
  res.sendFile(path.join(__dirname, 'processando.html'));
});

app.get('/resultados', (req, res) => {
  res.sendFile(path.join(__dirname, 'resultados.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'login.html'));
});

app.get('/verify-email', (req, res) => {
  res.sendFile(path.join(__dirname, 'verify-email.html'));
});
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard.html'));
});

// Inicializar servidor
async function startServer() {
  try {
    // Inicializar banco de dados
    await initializeDatabase();
    console.log('✅ Banco de dados inicializado');
    
    // Iniciar servidor
    app.listen(PORT, () => {
      console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
      console.log('📊 Sistema de estatísticas reais ativo');
      console.log('🔐 Sistema de autenticação ativo');
      console.log('🎁 Sistema de busca de presentes ativo');
      console.log('🛍️  Integração com lojas: Mercado Livre, Shopee, Magazine Luiza, Amazon');
    });
    
  } catch (error) {
    console.error('❌ Erro ao iniciar servidor:', error);
    process.exit(1);
  }
}

startServer();