// email.js
require('dotenv').config();
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const mysql = require('mysql2/promise');

const dbConfig = {
  host: process.env.DB_HOST, 
  user: process.env.DB_USER, 
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
};

// Criar o transporter
let transporter;

// Verificar se as variáveis de email estão configuradas
const emailUser = process.env.EMAIL_USER || 'giftgenius17@gmail.com';
const emailPass = process.env.EMAIL_PASS;

if (emailUser && emailPass) {
  try {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: emailUser,
        pass: emailPass
      }
    });
    console.log('✅ Transporter de email configurado');
  } catch (error) {
    console.error('❌ Erro ao configurar email:', error);
    transporter = null;
  }
} else {
  console.log('❌ Variáveis de email não configuradas');
  transporter = null;
}

// Sem simulação - email deve estar configurado
if (!transporter) {
  throw new Error('Email não configurado. Verifique EMAIL_USER e EMAIL_PASS no arquivo .env');
}

class EmailService {
  
  static generateVerificationCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  static async saveVerificationCode(email, code) {
    try {
      const connection = await mysql.createConnection(dbConfig);
      await connection.execute('DELETE FROM email_verifications WHERE email = ?', [email]);
      await connection.execute(`
        INSERT INTO email_verifications (email, code, expires_at, created_at, used) 
        VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 15 MINUTE), NOW(), FALSE)
      `, [email, code]);
      await connection.end();
      return true;
    } catch (error) {
      console.error('Erro ao salvar código:', error);
      return false;
    }
  }

  static async verifyCode(email, code) {
    try {
      const connection = await mysql.createConnection(dbConfig);
      const [results] = await connection.execute(`
        SELECT id FROM email_verifications 
        WHERE email = ? AND code = ? AND expires_at > NOW() AND used = FALSE
      `, [email, code]);
      if (results.length > 0) {
        await connection.execute('UPDATE email_verifications SET used = TRUE WHERE id = ?', [results[0].id]);
        await connection.end();
        return true;
      }
      await connection.end();
      return false;
    } catch (error) {
      console.error('Erro ao verificar código:', error);
      return false;
    }
  }

  static async sendVerificationEmail(email, name, code) {
    const mailOptions = {
      from: {
        name: 'GiftGenius',
        address: process.env.EMAIL_USER || 'giftgenius17@gmail.com'
      },
      to: email,
      subject: '🎁 Confirme seu email no GiftGenius',
      html: this.getVerificationEmailTemplate(name, code)
    };

    try {
      await transporter.sendMail(mailOptions);
      console.log(`✅ Email de verificação enviado para: ${email}`);
      return true;
    } catch (error) {
      console.error('Erro ao enviar email:', error);
      return false;
    }
  }

// Template do email de verificação
  static getVerificationEmailTemplate(name, code) {
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Verificação de Email - GiftGenius</title>
        <style>
            body { font-family: 'Arial', sans-serif; margin: 0; padding: 0; background-color: #f8fafc; }
            .container { max-width: 600px; margin: 0 auto; background: white; }
            .header { background: linear-gradient(135deg, #8b5cf6, #ec4899); padding: 40px 20px; text-align: center; }
            .logo { color: white; font-size: 28px; font-weight: bold; margin-bottom: 10px; }
            .header-text { color: white; font-size: 16px; opacity: 0.9; }
            .content { padding: 40px 30px; }
            .greeting { font-size: 24px; font-weight: bold; color: #1f2937; margin-bottom: 20px; }
            .message { color: #6b7280; line-height: 1.6; margin-bottom: 30px; }
            .code-container { background: #f3f4f6; border-radius: 12px; padding: 30px; text-align: center; margin: 30px 0; }
            .code-label { color: #6b7280; font-size: 14px; margin-bottom: 10px; }
            .verification-code { font-size: 36px; font-weight: bold; color: #8b5cf6; letter-spacing: 8px; font-family: 'Courier New', monospace; }
            .warning { background: #fef3cd; border: 1px solid #fbbf24; border-radius: 8px; padding: 15px; margin: 20px 0; }
            .warning-text { color: #92400e; font-size: 14px; }
            .footer { background: #f8fafc; padding: 30px; text-align: center; border-top: 1px solid #e5e7eb; }
            .footer-text { color: #9ca3af; font-size: 14px; line-height: 1.5; }
            .button { display: inline-block; background: linear-gradient(135deg, #8b5cf6, #ec4899); color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; margin: 20px 0; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <div class="logo">🎁 GiftGenius</div>
                <div class="header-text">Inteligência Artificial para Presentes Perfeitos</div>
            </div>
            
            <div class="content">
                <div class="greeting">Olá, ${name}! 👋</div>
                
                <div class="message">
                    Obrigado por se cadastrar no <strong>GiftGenius</strong>! Para garantir a segurança da sua conta 
                    e começar a encontrar presentes incríveis, precisamos verificar seu email.
                </div>
                
                <div class="code-container">
                    <div class="code-label">Seu código de verificação é:</div>
                    <div class="verification-code">${code}</div>
                </div>
                
                <div class="message">
                    Digite este código na página de verificação para ativar sua conta. 
                    <strong>O código expira em 15 minutos</strong> por segurança.
                </div>
                
                <div class="warning">
                    <div class="warning-text">
                        <strong>⚠️ Importante:</strong> Se você não se cadastrou no GiftGenius, 
                        ignore este email. Sua segurança é nossa prioridade!
                    </div>
                </div>
                
                <div style="text-align: center;">
                    <a href="http://localhost:3000/verify-email" class="button">
                        Verificar Email Agora
                    </a>
                </div>
            </div>
            
            <div class="footer">
                <div class="footer-text">
                    Este email foi enviado pelo <strong>GiftGenius</strong><br>
                    Se você tem dúvidas, entre em contato: contato@giftgenius.com<br><br>
                    © 2024 GiftGenius. Todos os direitos reservados.
                </div>
            </div>
        </div>
    </body>
    </html>
    `;
  }

  static async sendWelcomeEmail(email, name) {
    const mailOptions = {
      from: {
        name: 'GiftGenius',
        address: process.env.EMAIL_USER || 'giftgenius17@gmail.com'
      },
      to: email,
      subject: '🎉 Bem-vindo ao GiftGenius!',
      html: this.getWelcomeEmailTemplate(name)
    };

    try {
      await transporter.sendMail(mailOptions);
      console.log(`✅ Email de boas-vindas enviado para: ${email}`);
      return true;
    } catch (error) {
      console.error('Erro ao enviar email de boas-vindas:', error);
      return false;
    }
  }

   static getWelcomeEmailTemplate(name) {
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <style>
            body { font-family: Arial, sans-serif; margin: 0; padding: 0; background-color: #f8fafc; }
            .container { max-width: 600px; margin: 0 auto; background: white; }
            .header { background: linear-gradient(135deg, #8b5cf6, #ec4899); padding: 40px 20px; text-align: center; color: white; }
            .content { padding: 40px 30px; }
            .button { display: inline-block; background: linear-gradient(135deg, #8b5cf6, #ec4899); color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; margin: 20px 0; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>🎉 Bem-vindo ao GiftGenius!</h1>
            </div>
            <div class="content">
                <h2>Olá, ${name}!</h2>
                <p>Sua conta foi verificada com sucesso! Agora você pode:</p>
                <ul>
                    <li>🎁 Encontrar presentes personalizados com IA</li>
                    <li>💰 Comparar preços em múltiplas lojas</li>
                    <li>📊 Acompanhar seu histórico de buscas</li>
                    <li>⭐ Avaliar e salvar seus presentes favoritos</li>
                </ul>
                <div style="text-align: center;">
                    <a href="http://localhost:3000/questionnaire" class="button">
                        Encontrar Meu Primeiro Presente
                    </a>
                </div>
            </div>
        </div>
    </body>
    </html>
    `;
  }
}

module.exports = EmailService;
