// Sistema de Autenticação
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const mysql = require('mysql2/promise');
const EmailService = require('./email'); // Certifique-se de que o caminho para 'email.js' está correto
const router = express.Router();

// Carrega variáveis de ambiente (como JWT_SECRET)
require('dotenv').config(); 

const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
};


const JWT_SECRET = process.env.JWT_SECRET;

// Verifica se JWT_SECRET está configurado
if (!JWT_SECRET) {
    console.error('❌ ERRO: JWT_SECRET não está configurado no arquivo .env!');
    process.exit(1); 
}

// Middleware de autenticação
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Token de acesso requerido' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Token inválido ou expirado' });
        req.user = user;
        next();
    });
};

// Cadastro de usuário
router.post('/register', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        
        // Validações
        if (!name || !email || !password) {
            return res.status(400).json({ error: 'Todos os campos são obrigatórios' });
        }
        
        if (password.length < 6) {
            return res.status(400).json({ error: 'Senha deve ter pelo menos 6 caracteres' });
        }
        
        const connection = await mysql.createConnection(dbConfig);
        
        // Verificar se email já existe
        const [existingUser] = await connection.execute(
            'SELECT id, email_verified FROM users WHERE email = ?',
            [email]
        );
        
        if (existingUser.length > 0) {
            await connection.end();
            
            // Se email já existe mas não está verificado, permitir reenvio
            if (!existingUser[0].email_verified) {
                // Gerar novo código e enviar email
                const verificationCode = EmailService.generateVerificationCode();
                const codeSaved = await EmailService.saveVerificationCode(email, verificationCode);
                
                if (codeSaved) {
                    const emailSent = await EmailService.sendVerificationEmail(email, name, verificationCode);
                    
                    if (emailSent) {
                        return res.status(200).json({ 
                            message: 'Código de verificação reenviado! Verifique seu email.',
                            needsVerification: true,
                            email: email // Adiciona o email na resposta para o frontend usar
                        });
                    }
                }
            }
            
            return res.status(400).json({ error: 'Email já cadastrado' });
        }
        
        // Hash da senha
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);
        
        // Inserir usuário (não verificado ainda)
        const [result] = await connection.execute(
            'INSERT INTO users (name, email, password, email_verified, created_at) VALUES (?, ?, ?, FALSE, NOW())',
            [name, email, hashedPassword]
        );
        
        await connection.end();
        
        // Gerar e enviar código de verificação
        const verificationCode = EmailService.generateVerificationCode();
        const codeSaved = await EmailService.saveVerificationCode(email, verificationCode);
        
        console.log(`📧 Código gerado: ${verificationCode} para ${email}`);
        
        if (codeSaved) {
            const emailSent = await EmailService.sendVerificationEmail(email, name, verificationCode);
            
            if (emailSent) {
                console.log(`✅ Email enviado com sucesso para ${email}`);
                res.status(201).json({ 
                    message: 'Usuário cadastrado! Verifique seu email para ativar a conta.',
                    userId: result.insertId,
                    needsVerification: true,
                    email: email 
                });
            } else {
                console.log(`❌ Falha ao enviar email para ${email} - Código: ${verificationCode}`);
                res.status(201).json({ 
                    message: `Usuário cadastrado! Não foi possível enviar o email de verificação. Código: ${verificationCode}`,
                    userId: result.insertId,
                    needsVerification: true,
                    email: email, 
                    debugCode: verificationCode 
                });
            }
        } else {
            console.log(`❌ Erro ao salvar código para ${email}`);
            res.status(500).json({ error: 'Erro ao gerar código de verificação' });
        }
        
    } catch (error) {
        console.error('Erro no cadastro:', error);
        
        // Tratar erro de email duplicado
        if (error.code === 'ER_DUP_ENTRY' && error.sqlMessage.includes('users.email')) {
            return res.status(400).json({ error: 'Email já cadastrado' });
        }
        
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// Verificar email com código
router.post('/verify-email', async (req, res) => {
    try {
        const { email, code } = req.body;
        
        if (!email || !code) {
            return res.status(400).json({ error: 'Email e código são obrigatórios' });
        }
        
        // Verificar código
        const isValidCode = await EmailService.verifyCode(email, code);
        
        if (!isValidCode) {
            return res.status(400).json({ error: 'Código inválido ou expirado' });
        }
        
        const connection = await mysql.createConnection(dbConfig);
        
        // Ativar usuário
        const [updateResult] = await connection.execute(
            'UPDATE users SET email_verified = TRUE, email_verified_at = NOW() WHERE email = ?',
            [email]
        );
        
        if (updateResult.affectedRows === 0) {
            await connection.end();
            return res.status(404).json({ error: 'Usuário não encontrado para atualização' });
        }
        
        // Buscar dados completos do usuário para gerar o JWT
        const [users] = await connection.execute(
            'SELECT id, name, email FROM users WHERE email = ?',
            [email]
        );

        if (users.length === 0) {
            await connection.end();
            return res.status(404).json({ error: 'Usuário não encontrado após verificação de email' });
        }
        
        const user = users[0];

        // Atualizar estatísticas (só agora conta como usuário ativo)
        await connection.execute(
            'UPDATE statistics SET metric_value = metric_value + 1 WHERE metric_name = "total_users"'
        );
        
        // Enviar email de boas-vindas
        await EmailService.sendWelcomeEmail(email, user.name);
        
        await connection.end(); // Fecha a conexão após todas as operações de DB
        
        // Gerar JWT após a verificação bem-sucedida para login automático
        const token = jwt.sign(
            { userId: user.id, email: user.email },
            JWT_SECRET,
            { expiresIn: '24h' } // Token expira em 24 horas
        );
        
        // Retornar o token e os dados do usuário para o frontend
        res.json({ 
            message: 'Email verificado com sucesso! Sua conta está ativa.',
            verified: true,
            token: token, // Adiciona o token JWT na resposta
            user: {      // Adiciona os dados do usuário na resposta
                id: user.id,
                name: user.name,
                email: user.email
            }
        });
        
    } catch (error) {
        console.error('Erro na verificação:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// Reenviar código de verificação
router.post('/resend-verification', async (req, res) => {
    try {
        const { email } = req.body;
        
        if (!email) {
            return res.status(400).json({ error: 'Email é obrigatório' });
        }
        
        const connection = await mysql.createConnection(dbConfig);
        
        // Verificar se usuário existe e não está verificado
        const [users] = await connection.execute(
            'SELECT name, email_verified FROM users WHERE email = ?',
            [email]
        );
        
        if (users.length === 0) {
            await connection.end();
            return res.status(404).json({ error: 'Usuário não encontrado' });
        }
        
        if (users[0].email_verified) {
            await connection.end();
            return res.status(400).json({ error: 'Email já verificado' });
        }
        
        await connection.end();
        
        // Gerar novo código
        const verificationCode = EmailService.generateVerificationCode();
        const codeSaved = await EmailService.saveVerificationCode(email, verificationCode);
        
        if (codeSaved) {
            const emailSent = await EmailService.sendVerificationEmail(email, users[0].name, verificationCode);
            
            if (emailSent) {
                res.json({ message: 'Novo código enviado para seu email!' });
            } else {
                res.status(500).json({ error: 'Erro ao enviar email' });
            }
        } else {
            res.status(500).json({ error: 'Erro ao gerar código' });
        }
        
    } catch (error) {
        console.error('Erro ao reenviar código:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// Login de usuário
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({ error: 'Email e senha são obrigatórios' });
        }
        
        const connection = await mysql.createConnection(dbConfig);
        
        // Buscar usuário
        const [users] = await connection.execute(
            'SELECT id, name, email, password, email_verified FROM users WHERE email = ?', // Adicionado email_verified
            [email]
        );
        
        if (users.length === 0) {
            await connection.end();
            return res.status(401).json({ error: 'Email ou senha incorretos' });
        }
        
        const user = users[0];
        
        // Verificar senha
        const passwordMatch = await bcrypt.compare(password, user.password);
        
        if (!passwordMatch) {
            await connection.end();
            return res.status(401).json({ error: 'Email ou senha incorretos' });
        }
        
        // Verificar se email foi verificado
        if (!user.email_verified) {
            await connection.end();
            return res.status(401).json({ 
                error: 'Email não verificado. Verifique sua caixa de entrada.',
                needsVerification: true,
                email: email
            });
        }
        
        // Atualizar último login
        await connection.execute(
            'UPDATE users SET last_login = NOW() WHERE id = ?',
            [user.id]
        );
        
        await connection.end();
        
        // Gerar JWT
        const token = jwt.sign(
            { userId: user.id, email: user.email },
            JWT_SECRET,
            { expiresIn: '24h' }
        );
        
        res.json({
            message: 'Login realizado com sucesso',
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email
            }
        });
        
    } catch (error) {
        console.error('Erro no login:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// Perfil do usuário (protegido)
router.get('/profile', authenticateToken, async (req, res) => {
    try {
        const connection = await mysql.createConnection(dbConfig);
        
        const [users] = await connection.execute(
            'SELECT id, name, email, created_at, last_login FROM users WHERE id = ?',
            [req.user.userId]
        );
        
        if (users.length === 0) {
            await connection.end();
            return res.status(404).json({ error: 'Usuário não encontrado' });
        }
        
        // Buscar histórico de buscas do usuário
        const [searches] = await connection.execute(
            'SELECT id, search_time, processing_time_ms, gifts_returned, user_satisfied, profile_data FROM gift_searches WHERE user_id = ? ORDER BY search_time DESC LIMIT 20',
            [req.user.userId]
        );

        // Buscar estatísticas pessoais
        const [personalStats] = await connection.execute(`
            SELECT 
                COUNT(*) as total_searches,
                SUM(gifts_returned) as total_gifts,
                AVG(processing_time_ms) as avg_processing_time,
                SUM(CASE WHEN user_satisfied = 1 THEN 1 ELSE 0 END) as satisfied_searches
            FROM gift_searches 
            WHERE user_id = ?
        `, [req.user.userId]);

          const [lastPayment] = await connection.execute(
            'SELECT plan FROM payments WHERE user_id = ? ORDER BY created_at DESC LIMIT 1',
           [req.user.userId]
        );
       
        
        await connection.end();
        
        res.json({
            user: users[0],
            recentSearches: searches,
            personalStats: personalStats[0],
            currentPlan: lastPayment[0]?.plan || 'essential'
        });
        
    } catch (error) {
        console.error('Erro ao buscar perfil:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// Atualizar perfil do usuário (protegido)
router.put('/update-profile', authenticateToken, async (req, res) => {
    try {
        const { name, email, password } = req.body;
        const connection = await mysql.createConnection(dbConfig);
        
        // Verificar se email já existe (se mudou)
        if (email !== req.user.email) {
            const [existingUser] = await connection.execute(
                'SELECT id FROM users WHERE email = ? AND id != ?',
                [email, req.user.userId]
            );
            
            if (existingUser.length > 0) {
                await connection.end();
                return res.status(400).json({ error: 'Email já está em uso' });
            }
        }
        
        // Preparar query de atualização
        let query = 'UPDATE users SET name = ?, email = ?';
        let params = [name, email];
        
        // Se senha foi fornecida, incluir na atualização
        if (password) {
            const hashedPassword = await bcrypt.hash(password, 10);
            query += ', password = ?';
            params.push(hashedPassword);
        }
        
        query += ' WHERE id = ?';
        params.push(req.user.userId);
        
        await connection.execute(query, params);
        await connection.end();
        
        res.json({ message: 'Perfil atualizado com sucesso' });
        
    } catch (error) {
        console.error('Erro ao atualizar perfil:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

module.exports = { router, authenticateToken };