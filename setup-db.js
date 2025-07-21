// setup-db.js - Script para configurar o banco de dados com variáveis de ambiente
const mysql = require('mysql2/promise');
require('dotenv').config();

async function setupDatabase() {
  try {
    console.log('🔧 Configurando banco de dados...');

    // Configurações do banco vindo do .env
    const dbConfig = {
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD
    };

    // Conectar ao MySQL (sem database)
    const connection = await mysql.createConnection(dbConfig);

    // Criar database se não existir
    await connection.execute('CREATE DATABASE IF NOT EXISTS giftgenius_stats');
    console.log('✅ Database criado/verificado');

    await connection.end();

    // Conectar ao database específico
    const dbConnection = await mysql.createConnection({
      ...dbConfig,
      database: 'giftgenius_stats'
    });

    // Criar tabelas
    const tables = [
      `CREATE TABLE IF NOT EXISTS email_verifications (
        id INT PRIMARY KEY AUTO_INCREMENT,
        email VARCHAR(255) NOT NULL,
        code VARCHAR(6) NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        used BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_email_code (email, code),
        INDEX idx_expires (expires_at)
      )`,

      `CREATE TABLE IF NOT EXISTS statistics (
        id INT PRIMARY KEY AUTO_INCREMENT,
        metric_name VARCHAR(50) UNIQUE,
        metric_value INT DEFAULT 0,
        last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )`,

      `CREATE TABLE IF NOT EXISTS users (
        id INT PRIMARY KEY AUTO_INCREMENT,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        email_verified BOOLEAN DEFAULT FALSE,
        email_verified_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_login TIMESTAMP NULL
      )`,

      `CREATE TABLE IF NOT EXISTS user_sessions (
        id INT PRIMARY KEY AUTO_INCREMENT,
        session_id VARCHAR(255) UNIQUE,
        start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        end_time TIMESTAMP NULL,
        gifts_found INT DEFAULT 0,
        satisfied BOOLEAN NULL
      )`,

      `CREATE TABLE IF NOT EXISTS gift_searches (
        id INT PRIMARY KEY AUTO_INCREMENT,
        user_id INT NULL,
        session_id VARCHAR(255),
        search_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        processing_time_ms INT,
        gifts_returned INT,
        user_satisfied BOOLEAN NULL,
        profile_data JSON,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )`,

      `CREATE TABLE IF NOT EXISTS price_updates (
        id INT PRIMARY KEY AUTO_INCREMENT,
        last_update TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        products_updated INT,
        stores_checked INT
      )`,

      `CREATE TABLE IF NOT EXISTS payments (
        id INT PRIMARY KEY AUTO_INCREMENT,
        user_id INT NOT NULL,
        stripe_session_id VARCHAR(255),
        plan VARCHAR(50),
        amount INT,
        status VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )`,

      `CREATE TABLE IF NOT EXISTS user_feedback (
        id INT PRIMARY KEY AUTO_INCREMENT,
        user_id INT NOT NULL,
        search_id INT NULL,
        rating INT CHECK (rating >= 1 AND rating <= 5),
        satisfied BOOLEAN,
        comments TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (search_id) REFERENCES gift_searches(id)
      )`
    ];

    for (const table of tables) {
      await dbConnection.execute(table);
    }
    console.log('✅ Tabelas criadas');

    // Inserir dados iniciais com INSERT IGNORE para evitar duplicatas
    await dbConnection.execute(`
      INSERT IGNORE INTO statistics (metric_name, metric_value) VALUES
      ('total_gifts_found', 47832),
      ('total_users', 12456),
      ('satisfied_users', 12289),
      ('total_searches', 15678)
    `);

    await dbConnection.execute(`
      INSERT IGNORE INTO price_updates (products_updated, stores_checked) VALUES
      (8543, 52),
      (7892, 48),
      (9234, 55)
    `);

    console.log('✅ Dados iniciais inseridos');

    await dbConnection.end();
    console.log('🎉 Setup completo! Execute "npm start" para iniciar o servidor.');

  } catch (error) {
    console.error('❌ Erro no setup:', error);
    console.log('\n📝 Verifique se:');
    console.log('1. MySQL está rodando');
    console.log('2. Credenciais estão corretas no arquivo .env');
    console.log('3. Usuário tem permissões para criar databases');
  }
}

setupDatabase();
