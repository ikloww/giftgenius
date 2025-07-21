// stripe.js - backend seguro e blindado

// Checar logo a variável de ambiente (não pode faltar)
if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('❌ STRIPE_SECRET_KEY não configurado no ambiente');
}
if (!process.env.STRIPE_WEBHOOK_SECRET) {
  throw new Error('❌ STRIPE_WEBHOOK_SECRET não configurado no ambiente');
}

const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const mysql = require('mysql2/promise');
const { authenticateToken } = require('./auth');

const router = express.Router();

const dbConfig = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
};

// Helper para conexão MySQL
async function getDBConnection() {
  return mysql.createConnection(dbConfig);
}

// Validação dos planos disponíveis
const allowedPlans = {
  essential: {
    amount: 1490, // R$ 14,90
    name: 'GiftGenius Essencial',
    description: '5 sugestões personalizadas + análise de IA'
  },
  supremo: {
    amount: 3550, // R$ 35,50
    name: 'GiftGenius Supremo',
    description: '50 sugestões premium + cartão digital + PDF + bônus exclusivo'
  }
};

// Criar sessão de checkout
router.post('/create-checkout-session', authenticateToken, async (req, res) => {
  try {
    const { plan } = req.body;
    const userId = req.user.userId;

    if (!allowedPlans[plan]) {
      return res.status(400).json({ error: 'Plano inválido' });
    }

    const selectedPrice = allowedPlans[plan];

    const connection = await getDBConnection();

    // Verificar plano ativo do usuário
    const [users] = await connection.execute(
      'SELECT current_plan, plan_expires_at FROM users WHERE id = ?',
      [userId]
    );

    await connection.end();

    if (users.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    const user = users[0];
    const today = new Date();
    const planExpiresAt = user.plan_expires_at ? new Date(user.plan_expires_at) : new Date(0);

    if (user.current_plan === plan && planExpiresAt > today) {
      return res.status(409).json({
        error: 'Plano já ativo',
        message: `Você já possui o plano "${plan}" ativo até ${planExpiresAt.toLocaleDateString('pt-BR')}`
      });
    }

    // Criar sessão Stripe Checkout
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'brl',
          product_data: {
            name: selectedPrice.name,
            description: selectedPrice.description,
            images: ['https://your-domain.com/logo.png'] // substitua pela URL real
          },
          unit_amount: selectedPrice.amount,
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `${req.headers.origin}/processando?session_id={CHECKOUT_SESSION_ID}&plan=${plan}`,
      cancel_url: `${req.headers.origin}/dashboard`,
      metadata: {
        userId: userId.toString(),
        plan: plan
      }
    });

    res.json({ sessionId: session.id });

  } catch (error) {
    console.error('Erro ao criar sessão de checkout:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Webhook do Stripe (express.raw para receber body cru)
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;

    try {
      const connection = await getDBConnection();

      // Registrar pagamento
      await connection.execute(`
        INSERT INTO payments (
          user_id,
          stripe_session_id,
          plan,
          amount,
          status,
          created_at
        ) VALUES (?, ?, ?, ?, 'completed', NOW())
      `, [
        session.metadata.userId,
        session.id,
        session.metadata.plan,
        session.amount_total
      ]);

      // Atualizar plano do usuário (30 dias)
      await connection.execute(`
        UPDATE users
        SET current_plan = ?, plan_expires_at = DATE_ADD(NOW(), INTERVAL 30 DAY)
        WHERE id = ?
      `, [session.metadata.plan, session.metadata.userId]);

      // Atualizar estatísticas de receita
      await connection.execute(`
        UPDATE statistics
        SET metric_value = metric_value + ?
        WHERE metric_name = 'total_revenue'
      `, [session.amount_total / 100]);

      await connection.end();

      console.log('✅ Pagamento processado:', session.id);

    } catch (error) {
      console.error('Erro ao processar pagamento:', error);
    }
  }

  res.json({ received: true });
});

// Buscar informações de cobrança do usuário
router.get('/billing-info', authenticateToken, async (req, res) => {
  try {
    const connection = await getDBConnection();

    const [payments] = await connection.execute(`
      SELECT id, plan, amount, status, created_at
      FROM payments
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT 10
    `, [req.user.userId]);

    const [lastPayment] = await connection.execute(`
      SELECT current_plan AS plan, plan_expires_at FROM users
      WHERE id = ?
    `, [req.user.userId]);

    await connection.end();

    res.json({
      currentPlan: lastPayment[0]?.plan || 'Nenhum plano ativo',
      planExpiresAt: lastPayment[0]?.plan_expires_at || null,
      payments,
      totalSpent: payments.reduce((sum, p) => sum + (p.amount || 0), 0)
    });

  } catch (error) {
    console.error('Erro ao buscar informações de cobrança:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Criar portal de cobrança do Stripe
router.post('/create-portal-session', authenticateToken, async (req, res) => {
  try {
    const connection = await getDBConnection();

    const [users] = await connection.execute(
      'SELECT stripe_customer_id FROM users WHERE id = ?',
      [req.user.userId]
    );

    await connection.end();

    if (users.length === 0 || !users[0].stripe_customer_id) {
      return res.status(400).json({ error: 'Cliente não encontrado no Stripe' });
    }

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: users[0].stripe_customer_id,
      return_url: `${req.headers.origin}/dashboard`,
    });

    res.json({ url: portalSession.url });

  } catch (error) {
    console.error('Erro ao criar portal de cobrança:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

module.exports = router;
