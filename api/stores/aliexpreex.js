const express = require('express');
const axios = require('axios');
const mysql = require('mysql2/promise');
const { authenticateToken } = require('./auth');
const cheerio = require('cheerio');
const router = express.Router();

// Config do banco
const dbConfig = {
  host: 'localhost',
  user: 'root',
  password: '@1Sacramento',
  database: 'giftgenius_stats'
};

// Classe da IA
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

    if (age <= 12) categories.push('brinquedos', 'jogos');
    else if (age <= 17) categories.push('games', 'eletrônicos');
    else if (age <= 35) categories.push('tecnologia', 'beleza');
    else categories.push('casa', 'jardinagem');

    return categories;
  }

  static generateKeywords(interests, occasion, age) {
    const keywords = interests.split(',').map(i => i.trim());

    const occasionMap = {
      'aniversario': ['presente aniversário'],
      'natal': ['presente natal'],
      'dia-das-maes': ['presente mãe'],
      'dia-dos-pais': ['presente pai']
    };

    if (occasionMap[occasion]) {
      keywords.push(...occasionMap[occasion]);
    }

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
    return ['relevancia'];
  }
}

// Classe da AliExpress
class AliExpressAPI {
  constructor(appKey) {
    this.appKey = appKey;
    this.baseUrl = 'https://gw.api.alibaba.com/openapi/param2/2/portals.open';
  }

  async searchProducts(query, limit = 5) {
    const url = `${this.baseUrl}/api.listPromotionProduct/${this.appKey}`;

    const params = {
      keywords: query,
      pageSize: limit,
      targetCurrency: 'BRL'
    };

    try {
      const { data } = await axios.post(url, null, { params });

      if (!data.result || !data.result.products) return [];

      return data.result.products.map(product => ({
        name: product.productTitle,
        price: parseFloat(product.salePrice.replace('BRL', '').trim()),
        image: product.productMainImageUrl,
        url: product.productDetailUrl,
        store: 'AliExpress'
      }));

    } catch (err) {
      console.error('❌ Erro na API AliExpress:', err.message);
      return [];
    }
  }

  async generateAffiliateLink(productUrl, trackingId) {
    const url = `${this.baseUrl}/api.promotion.link.generate/${this.appKey}`;

    const params = {
      promotionLinkType: '0',
      sourceValues: productUrl,
      trackingId: trackingId
    };

    try {
      const { data } = await axios.post(url, null, { params });

      if (data.result && data.result.promotionUrls.length > 0) {
        return data.result.promotionUrls[0].promotionUrl;
      }

      return productUrl;
    } catch (err) {
      console.error('❌ Erro ao gerar link afiliado AliExpress:', err.message);
      return productUrl;
    }
  }
}

// Integração
const aliExpress = new AliExpressAPI('SUA_APP_KEY');
const trackingId = 'SEU_TRACKING_ID';

// Endpoint principal
router.post('/find-gifts', async (req, res) => {
  try {
    const startTime = Date.now();
    const profile = req.body;
    const userId = req.user?.userId || null;

    const analysis = GiftAI.analyzeProfile(profile);
    const maxResults = profile.plan === 'supremo' ? 50 : 15;
    const keywordLimit = profile.plan === 'supremo' ? 5 : 3;

    // Buscas na AliExpress
    const aliPromises = analysis.keywords.slice(0, keywordLimit).map(keyword => 
      aliExpress.searchProducts(keyword, 5)
    );

    const aliResults = await Promise.all(aliPromises);
    const aliGifts = aliResults.flat();

    // Gerar links afiliados
    for (let gift of aliGifts) {
      gift.url = await aliExpress.generateAffiliateLink(gift.url, trackingId);
    }

    // Ranking
    const rankedGifts = aliGifts.map(gift => {
      let score = 0;

      if (gift.price <= analysis.priceRange.max && gift.price >= analysis.priceRange.min) {
        score += 30;
      }

      score += 10; // Padrão
      analysis.keywords.forEach(keyword => {
        if (gift.name.toLowerCase().includes(keyword.toLowerCase())) {
          score += 15;
        }
      });

      return { ...gift, score };
    }).sort((a, b) => b.score - a.score);

    const selectedGifts = rankedGifts.slice(0, maxResults);
    const processingTime = Date.now() - startTime;

    // Salvar no banco
    const connection = await mysql.createConnection(dbConfig);

    await connection.execute(
      'INSERT INTO gift_searches (user_id, search_time, processing_time_ms, gifts_returned, profile_data) VALUES (?, NOW(), ?, ?, ?)',
      [userId, processingTime, selectedGifts.length, JSON.stringify(profile)]
    );

    await connection.end();

    res.json({
      gifts: selectedGifts,
      plan: profile.plan,
      analysis: {
        categories: analysis.categories,
        processingTime: `${(processingTime / 1000).toFixed(1)}s`,
        totalFound: aliGifts.length,
        selected: selectedGifts.length
      }
    });

  } catch (err) {
    console.error('❌ Erro:', err.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

module.exports = router;
