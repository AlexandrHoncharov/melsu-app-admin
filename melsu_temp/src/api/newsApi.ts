import apiClient from './apiClient';

// Types for news items
export interface NewsItem {
  id: string;
  title: string;
  category?: string;
  date?: string;
  description?: string;
  image_url?: string;
  url?: string;
}

export interface NewsDetail {
  id: string;
  title: string;
  date?: string;
  category?: string;
  content_html?: string;
  content_text?: string;
  images?: string[];
  prev_article?: {
    id: string;
    title: string;
  } | null;
  next_article?: {
    id: string;
    title: string;
  } | null;
}

// API for working with news
const newsApi = {
  /**
   * Get list of news items with pagination
   * @param page Page number (starts from 1)
   * @returns List of news items and pagination info
   */
  getNews: async (page: number = 1): Promise<{
    news: NewsItem[];
    page: number;
    has_next_page: boolean;
    success: boolean;
  }> => {
    try {
      const response = await apiClient.get('/news', {
        params: { page }
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching news:', error);
      throw error;
    }
  },

  /**
   * Get detailed information about a specific news article
   * @param newsId News article ID
   * @returns Detailed news article information
   */
  getNewsDetail: async (newsId: string): Promise<NewsDetail> => {
    try {
      const response = await apiClient.get(`/news/${newsId}`);
      return response.data;
    } catch (error) {
      console.error(`Error fetching news detail for ID ${newsId}:`, error);
      throw error;
    }
  }
};

export default newsApi;