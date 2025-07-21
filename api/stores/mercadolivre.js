// API do Mercado Livre
const axios = require('axios');

class MercadoLivreAPI {
  constructor() {
    this.baseURL = 'https://api.mercadolibre.com';
    this.siteId = 'MLB'; // Brasil
  }

  async searchProducts(query, options = {}) {
    try {
      const params = {
        q: query,
        limit: options.limit || 20,
        offset: options.offset || 0,
        sort: 'relevance',
        condition: 'new'
      };

      // Filtros de preço
      if (options.priceMin) params.price = `${options.priceMin}-${options.priceMax || 999999}`;
      if (options.category) params.category = options.category;

      const response = await axios.get(`${this.baseURL}/sites/${this.siteId}/search`, {
        params,
        timeout: 10000,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'GiftGenie/1.0' // Evita erro com header malformado
        }
      });

      return this.formatProducts(response.data.results);
    } catch (error) {
      console.error('Erro na API do Mercado Livre:', error.message);
      return [];
    }
  }

  formatProducts(products) {
    return products.map(product => ({
      id: product.id,
      name: product.title,
      price: product.price,
      originalPrice: product.original_price,
      image: product.thumbnail.replace('I.jpg', 'O.jpg'), // Imagem maior
      url: product.permalink,
      store: 'Mercado Livre',
      rating: this.calculateRating(product),
      reviews: product.sold_quantity || 0,
      shipping: product.shipping?.free_shipping ? 'Frete grátis' : 'Frete pago',
      condition: product.condition === 'new' ? 'Novo' : 'Usado',
      seller: {
        name: product.seller?.nickname || 'Vendedor',
        reputation: product.seller?.seller_reputation?.level_id || 'bronze'
      }
    }));
  }

  calculateRating(product) {
    // Mercado Livre não retorna rating diretamente, calculamos baseado em outros fatores
    let rating = 3.5; // Base

    if (product.sold_quantity > 100) rating += 0.5;
    if (product.sold_quantity > 500) rating += 0.3;
    if (product.shipping?.free_shipping) rating += 0.2;
    if (product.seller?.seller_reputation?.level_id === 'gold') rating += 0.3;

    return Math.min(5, rating).toFixed(1);
  }

  async getCategories() {
    try {
      const response = await axios.get(`${this.baseURL}/sites/${this.siteId}/categories`, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'GiftGenie/1.0'
        }
      });
      return response.data;
    } catch (error) {
      console.error('Erro ao buscar categorias:', error.message);
      return [];
    }
  }

  async getProductDetails(productId) {
    try {
      const response = await axios.get(`${this.baseURL}/items/${productId}`, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'GiftGenie/1.0'
        }
      });
      return response.data;
    } catch (error) {
      console.error('Erro ao buscar detalhes do produto:', error.message);
      return null;
    }
  }
}

module.exports = MercadoLivreAPI;
