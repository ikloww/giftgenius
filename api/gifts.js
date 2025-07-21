const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const mysql = require('mysql2/promise');
const { authenticateToken } = require('./auth');
const router = express.Router();

const dbConfig = {
  host: process.env.DB_HOST, 
  user: process.env.DB_USER, 
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
};

// 🎯 Função de ranking (agora fora do router)
function rankGifts(gifts, analysis) {
  return gifts.map(gift => {
    let score = 0;

    if (gift.price <= analysis.priceRange.max && gift.price >= analysis.priceRange.min) {
      score += 30;
    }

    score += parseFloat(gift.rating) * 10;
    score += Math.min(gift.reviews / 100, 20);

    analysis.keywords.forEach(keyword => {
      if (gift.name.toLowerCase().includes(keyword.toLowerCase())) {
        score += 15;
      }
    });

    return { ...gift, score };
  }).sort((a, b) => b.score - a.score);
}

// 🔮 IA de sugestões de presentes
class GiftAI {
  static analyzeProfile(profile) {
    const { age, gender, interests, personality, budget, occasion } = profile;

    const categories = this.getCategories(age, gender, interests, personality);
    const keywords = this.generateKeywords(interests, occasion, age);
    const priceRange = this.getPriceRange(budget);

    return {
      categories,
      keywords,
      priceRange,
      priority: this.calculatePriority(personality, occasion)
    };
  }

  static getCategories(age, gender, interests, personality) {
    const categories = [];

    if (age <= 12) categories.push('brinquedos', 'jogos', 'livros infantis');
    else if (age <= 17) categories.push('games', 'eletrônicos', 'roupas', 'acessórios');
    else if (age <= 35) categories.push('tecnologia', 'casa', 'beleza', 'esportes');
    else categories.push('casa', 'jardinagem', 'livros', 'saúde');

    const interestMap = {
      'leitura': ['livros', 'e-readers', 'luminárias'],
      'culinária': ['utensílios cozinha', 'livros receitas', 'ingredientes'],
      'tecnologia': ['eletrônicos', 'gadgets', 'acessórios tech'],
      'esportes': ['equipamentos esportivos', 'roupas fitness', 'suplementos'],
      'arte': ['materiais arte', 'quadros', 'decoração'],
      'música': ['instrumentos', 'fones', 'vinis'],
      'viagem': ['acessórios viagem', 'guias', 'bagagem']
    };

    interests.split(',').forEach(interest => {
      const trimmed = interest.trim().toLowerCase();
      if (interestMap[trimmed]) {
        categories.push(...interestMap[trimmed]);
      }
    });

    return [...new Set(categories)];
  }

  static generateKeywords(interests, occasion, age) {
    const keywords = [];

    const occasionMap = {
      'aniversario': ['presente aniversário', 'gift birthday'],
      'natal': ['presente natal', 'christmas gift'],
      'dia-das-maes': ['presente mãe', 'dia das mães'],
      'dia-dos-pais': ['presente pai', 'dia dos pais'],
      'dia-dos-namorados': ['presente namorada', 'presente namorado']
    };

    if (occasionMap[occasion]) {
      keywords.push(...occasionMap[occasion]);
    }

    keywords.push(...interests.split(',').map(i => i.trim()));

    return keywords;
  }

  static getPriceRange(budget) {
    const ranges = {
      'ate-50': { min: 0, max: 50 },
      '50-100': { min: 50, max: 100 },
      '100-200': { min: 100, max: 200 },
      '200-500': { min: 200, max: 500 },
      '500-1000': { min: 500, max: 1000 },
      '1000-plus': { min: 1000, max: 10000 }
    };

    return ranges[budget] || { min: 0, max: 1000 };
  }

  static calculatePriority(personality, occasion) {
    const priorities = {
      'pratica': ['utilidade', 'funcionalidade'],
      'criativa': ['arte', 'DIY', 'personalização'],
      'aventureira': ['esportes', 'viagem', 'outdoor'],
      'intelectual': ['livros', 'cursos', 'tecnologia'],
      'social': ['experiências', 'jogos', 'acessórios'],
      'elegante': ['luxo', 'beleza', 'moda']
    };

    return priorities[personality] || ['geral'];
  }
}

// 🛒 Scrapers das lojas (atenção: Shopee e Magalu podem bloquear scraping real)

class StoreScraper {
  static async searchMercadoLivre(query, priceRange) {
    try {
      const url = `https://api.mercadolibre.com/sites/MLB/search?q=${encodeURIComponent(query)}&limit=5`;
      const response = await axios.get(url);
      const results = response.data.results || [];
      return results.map(item => ({
        name: item.title,
        price: item.price,
        image: item.thumbnail,
        store: 'Mercado Livre',
        url: item.permalink,
        rating: '4.5',
        reviews: item.sold_quantity || 0
      }));
    } catch (error) {
      console.error('Erro no Mercado Livre:', error);
      return [];
    }
  }

  static async searchShopee(query, priceRange) {
    try {
      const url = `https://shopee.com.br/search?keyword=${encodeURIComponent(query)}`;
      const { data } = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      const $ = cheerio.load(data);
      const items = [];
      $('.shopee-search-item-result__item').slice(0, 5).each((i, el) => {
        const name = $(el).find('._10Wbs- _5SSWfi UjjMrh').text() || $(el).find('._1NoI8_ _16BAGk').text();
        const price = parseFloat($(el).find('._29R_un').first().text().replace(/\D/g, '')) || 0;
        const image = $(el).find('img').attr('src');
        const url = 'https://shopee.com.br' + ($(el).find('a').attr('href') || '');
        items.push({ name, price, image, store: 'Shopee', url, rating: '4.5', reviews: 0 });
      });
      return items;
    } catch (error) {
      console.error('Erro na Shopee:', error);
      return [];
    }
  }

  static async searchMagalu(query, priceRange) {
    try {
      const url = `https://www.magazineluiza.com.br/busca/${encodeURIComponent(query)}`;
      const { data } = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      const $ = cheerio.load(data);
      const items = [];
      $('.sc-dcJsrY').slice(0, 5).each((i, el) => {
        const name = $(el).find('.sc-iBEsjs').text();
        const price = parseFloat($(el).find('.sc-jTzLTM').text().replace(/\D/g, '')) || 0;
        const image = $(el).find('img').attr('src');
        const url = 'https://www.magazineluiza.com.br' + ($(el).find('a').attr('href') || '');
        items.push({ name, price, image, store: 'Magazine Luiza', url, rating: '4.5', reviews: 0 });
      });
      return items;
    } catch (error) {
      console.error('Erro no Magazine Luiza:', error);
      return [];
    }
  }

  static async searchAmazon(query, priceRange) {
    try {
      const url = `https://www.amazon.com.br/s?k=${encodeURIComponent(query)}`;
      const { data } = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      const $ = cheerio.load(data);
      const items = [];
      $('.s-result-item').slice(0, 5).each((i, el) => {
        const name = $(el).find('h2 span').text();
        const priceWhole = $(el).find('.a-price-whole').first().text().replace(/\D/g, '');
        const priceFraction = $(el).find('.a-price-fraction').first().text().replace(/\D/g, '');
        const price = parseFloat(`${priceWhole}.${priceFraction}`) || 0;
        const image = $(el).find('img').attr('src');
        const url = 'https://www.amazon.com.br' + ($(el).find('a.a-link-normal').attr('href') || '');
        items.push({ name, price, image, store: 'Amazon', url, rating: '4.5', reviews: 0 });
      });
      return items;
    } catch (error) {
      console.error('Erro na Amazon:', error);
      return [];
    }
  }
}

// 🚀 Endpoint de busca de presentes
router.post('/find-gifts', async (req, res) => {
  try {
    const startTime = Date.now();
    const profile = req.body;
    const userId = req.user?.userId || null;

    const analysis = GiftAI.analyzeProfile(profile);
    const maxResults = profile.plan === 'supremo' ? 50 : 15;

    const searchPromises = [];
    const keywordLimit = profile.plan === 'supremo' ? 5 : 3;

    for (const keyword of analysis.keywords.slice(0, keywordLimit)) {
      searchPromises.push(
        StoreScraper.searchMercadoLivre(keyword, analysis.priceRange),
        StoreScraper.searchShopee(keyword, analysis.priceRange),
        StoreScraper.searchMagalu(keyword, analysis.priceRange),
        StoreScraper.searchAmazon(keyword, analysis.priceRange)
      );
    }

    const results = await Promise.all(searchPromises);
    const allGifts = results.flat();

    const rankedGifts = rankGifts(allGifts, analysis);
    const selectedGifts = rankedGifts.slice(0, maxResults);

    const processingTime = Date.now() - startTime;

    const connection = await mysql.createConnection(dbConfig);

    await connection.execute(
      'INSERT INTO gift_searches (user_id, search_time, processing_time_ms, gifts_returned, profile_data) VALUES (?, NOW(), ?, ?, ?)',
      [userId, processingTime, selectedGifts.length, JSON.stringify(profile)]
    );

    await connection.execute(
      'UPDATE statistics SET metric_value = metric_value + ? WHERE metric_name = "total_gifts_found"',
      [selectedGifts.length]
    );

    await connection.execute(
      'UPDATE statistics SET metric_value = metric_value + 1 WHERE metric_name = "total_searches"'
    );

    await connection.end();

    res.json({
      gifts: selectedGifts,
      plan: profile.plan,
      maxResults,
      analysis: {
        categories: analysis.categories,
        processingTime: `${(processingTime / 1000).toFixed(1)}s`,
        totalFound: allGifts.length,
        selected: selectedGifts.length
      }
    });

  } catch (error) {
    console.error('Erro na busca de presentes:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// 📢 Feedback do usuário
router.post('/feedback', authenticateToken, async (req, res) => {
  try {
    const { searchId, rating, satisfied, comments } = req.body;
    const userId = req.user.userId;

    const connection = await mysql.createConnection(dbConfig);

    await connection.execute(
      'INSERT INTO user_feedback (user_id, search_id, rating, satisfied, comments, created_at) VALUES (?, ?, ?, ?, ?, NOW())',
      [userId, searchId, rating, satisfied, comments]
    );

    if (satisfied) {
      await connection.execute(
        'UPDATE statistics SET metric_value = metric_value + 1 WHERE metric_name = "satisfied_users"'
      );
    }

    await connection.end();

    res.json({ message: 'Feedback registrado com sucesso' });

  } catch (error) {
    console.error('Erro ao salvar feedback:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

module.exports = router;
