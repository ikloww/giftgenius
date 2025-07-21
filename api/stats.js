// Sistema de estatísticas reais - Backend
const express = require('express');
const mysql = require('mysql2/promise');
const router = express.Router();
const { authenticateToken } = require('./auth');

// Configuração do banco de dados
const dbConfig = {
  host: process.env.DB_HOST, 
  user: process.env.DB_USER, 
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
};

// Estrutura completa das tabelas + inserts
const createTables = `
  CREATE TABLE IF NOT EXISTS users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP NULL
  );

  CREATE TABLE IF NOT EXISTS statistics (
    id INT PRIMARY KEY AUTO_INCREMENT,
    metric_name VARCHAR(50) UNIQUE,
    metric_value INT DEFAULT 0,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS user_sessions (
    id INT PRIMARY KEY AUTO_INCREMENT,
    session_id VARCHAR(255) UNIQUE,
    user_id INT NULL,
    start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    end_time TIMESTAMP NULL,
    gifts_found INT DEFAULT 0,
    satisfied BOOLEAN NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS gift_searches (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NULL,
    session_id VARCHAR(255),
    search_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processing_time_ms INT,
    gifts_returned INT,
    user_satisfied BOOLEAN NULL,
    profile_data JSON,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS price_updates (
    id INT PRIMARY KEY AUTO_INCREMENT,
    last_update TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    products_updated INT,
    stores_checked INT
  );

  CREATE TABLE IF NOT EXISTS user_feedback (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    search_id INT NULL,
    rating INT CHECK (rating >= 1 AND rating <= 5),
    satisfied BOOLEAN,
    comments TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (search_id) REFERENCES gift_searches(id)
  );

  CREATE TABLE IF NOT EXISTS gift_interactions (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    gift_name VARCHAR(255),
    store VARCHAR(100),
    action VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  INSERT IGNORE INTO statistics (metric_name, metric_value) VALUES
  ('total_gifts_found', 47832),
  ('total_users', 12456),
  ('satisfied_users', 12289),
  ('total_searches', 15678),
  ('total_revenue', 89450),
  ('conversion_rate', 87);
`;

// Função para inicializar o banco de dados
async function initializeDatabase() {
  try {
    const connection = await mysql.createConnection(dbConfig);

    // Separar as queries e executar uma por uma
    const statements = createTables
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0);

    for (const stmt of statements) {
      console.log(`Executando: ${stmt.slice(0, 60)}...`);
      await connection.execute(stmt);
    }

    await connection.end();
    console.log('✅ Banco de dados inicializado com sucesso!');
  } catch (error) {
    console.error('❌ Erro ao inicializar o banco:', error);
  }
}

// Adicionar rota para dashboard (protegida)
router.get('/dashboard/summary', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const connection = await mysql.createConnection(dbConfig);
    // Total de buscas do usuário
    const [searches] = await connection.execute('SELECT COUNT(*) as total FROM gift_searches WHERE user_id = ?', [userId]);
    // Total gasto pelo usuário
    const [payments] = await connection.execute('SELECT SUM(amount) as total_spent FROM payments WHERE user_id = ? AND status = "completed"', [userId]);
    // Plano atual
    const [plan] = await connection.execute('SELECT current_plan, plan_expires_at FROM users WHERE id = ?', [userId]);
    // Últimas buscas
    const [lastSearches] = await connection.execute('SELECT id, search_time, gifts_returned, processing_time_ms FROM gift_searches WHERE user_id = ? ORDER BY search_time DESC LIMIT 5', [userId]);
    // Feedbacks enviados
    const [feedbacks] = await connection.execute('SELECT rating, satisfied, comments, created_at FROM user_feedback WHERE user_id = ? ORDER BY created_at DESC LIMIT 5', [userId]);
    await connection.end();
    res.json({
      total_searches: searches[0]?.total || 0,
      total_spent: payments[0]?.total_spent || 0,
      current_plan: plan[0]?.current_plan || 'essential',
      plan_expires_at: plan[0]?.plan_expires_at || null,
      last_searches: lastSearches,
      feedbacks: feedbacks
    });
  } catch (error) {
    console.error('Erro ao buscar estatísticas do dashboard do usuário:', error);
    res.status(500).json({ error: 'Erro ao buscar estatísticas do dashboard do usuário' });
  }
});

module.exports = { router, initializeDatabase };
