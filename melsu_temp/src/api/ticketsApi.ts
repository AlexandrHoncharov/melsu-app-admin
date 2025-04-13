import apiClient from './apiClient';
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';

// Типы для тикетов
export interface Ticket {
  id: number;
  title: string;
  category: 'technical' | 'schedule' | 'verification' | 'other';
  priority: 'low' | 'medium' | 'high';
  status: 'new' | 'in_progress' | 'waiting' | 'resolved' | 'closed';
  created_at: string;
  updated_at: string;
  has_unread: boolean;
  messages_count: number;
  last_message?: TicketMessage;
}

export interface TicketMessage {
  id: number;
  text: string;
  is_from_admin: boolean;
  created_at: string;
  is_read: boolean;
  attachment?: string;
  user: {
    id: number;
    name: string;
  };
}

export interface CreateTicketRequest {
  title: string;
  category: 'technical' | 'schedule' | 'verification' | 'other';
  message: string;
  priority?: 'low' | 'medium' | 'high';
  related_type?: string;
  related_id?: number;
}

export interface TicketDetail {
  ticket: Ticket;
  messages: TicketMessage[];
}

// API для работы с тикетами
const ticketsApi = {
  /**
   * Получение списка тикетов пользователя
   * @param status Опциональный фильтр по статусу
   * @returns Список тикетов
   */
  getTickets: async (status?: string): Promise<Ticket[]> => {
    try {
      const params: Record<string, string> = {};
      if (status && status !== 'all') {
        params.status = status;
      }

      const response = await apiClient.get('/tickets', { params });
      return response.data;
    } catch (error) {
      console.error('Error fetching tickets:', error);
      throw error;
    }
  },

  /**
   * Создание нового тикета
   * @param ticketData Данные для создания тикета
   * @returns Созданный тикет
   */
  createTicket: async (ticketData: CreateTicketRequest): Promise<{ ticket: Ticket, message: string }> => {
    try {
      const response = await apiClient.post('/tickets', ticketData);
      return response.data;
    } catch (error) {
      console.error('Error creating ticket:', error);
      throw error;
    }
  },

  /**
   * Получение подробной информации о тикете
   * @param ticketId ID тикета
   * @returns Подробная информация о тикете и сообщения
   */
  getTicketDetails: async (ticketId: number): Promise<TicketDetail> => {
    try {
      const response = await apiClient.get(`/tickets/${ticketId}`);
      return response.data;
    } catch (error) {
      console.error(`Error fetching ticket details for ticket ${ticketId}:`, error);
      throw error;
    }
  },

  /**
   * Добавление сообщения к тикету
   * @param ticketId ID тикета
   * @param text Текст сообщения
   * @returns Созданное сообщение
   */
  addMessage: async (ticketId: number, text: string): Promise<{ ticket_message: TicketMessage, message: string }> => {
    try {
      const response = await apiClient.post(`/tickets/${ticketId}/messages`, { text });
      return response.data;
    } catch (error) {
      console.error(`Error adding message to ticket ${ticketId}:`, error);
      throw error;
    }
  },

  /**
   * Обновление статуса тикета
   * @param ticketId ID тикета
   * @param status Новый статус
   * @param comment Опциональный комментарий
   * @returns Обновленный тикет
   */
  updateTicketStatus: async (
    ticketId: number,
    status: 'waiting' | 'closed',
    comment?: string
  ): Promise<{ ticket: Ticket, message: string }> => {
    try {
      const response = await apiClient.put(`/tickets/${ticketId}/status`, {
        status,
        comment
      });
      return response.data;
    } catch (error) {
      console.error(`Error updating ticket ${ticketId} status:`, error);
      throw error;
    }
  },

  /**
   * Загрузка файла к тикету
   * @param ticketId ID тикета
   * @param fileUri URI файла для загрузки
   * @param text Опциональный текст сообщения
   * @returns Результат загрузки
   */
  uploadAttachment: async (
    ticketId: number,
    fileUri: string,
    text: string = ''
  ): Promise<{ ticket_message: TicketMessage, message: string }> => {
    try {
      // Получаем информацию о файле
      const fileInfo = await FileSystem.getInfoAsync(fileUri);
      if (!fileInfo.exists) {
        throw new Error('File does not exist');
      }

      // Создаем FormData
      const formData = new FormData();

      // Получаем имя файла из URI
      const fileName = fileUri.split('/').pop() || 'file';

      // Определяем тип файла
      let fileType = 'application/octet-stream';
      if (fileName.endsWith('.jpg') || fileName.endsWith('.jpeg')) {
        fileType = 'image/jpeg';
      } else if (fileName.endsWith('.png')) {
        fileType = 'image/png';
      } else if (fileName.endsWith('.pdf')) {
        fileType = 'application/pdf';
      }

      // Добавляем файл
      formData.append('file', {
        uri: fileUri,
        name: fileName,
        type: fileType
      } as any);

      // Добавляем текст сообщения, если он есть
      if (text) {
        formData.append('text', text);
      }

      // Отправляем запрос
      const response = await apiClient.post(`/tickets/${ticketId}/attachment`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      return response.data;
    } catch (error) {
      console.error(`Error uploading attachment to ticket ${ticketId}:`, error);
      throw error;
    }
  },

  /**
   * Получение количества непрочитанных тикетов
   * @returns Количество непрочитанных тикетов
   */
  getUnreadCount: async (): Promise<{ unread_tickets: number }> => {
    try {
      const response = await apiClient.get('/tickets/unread-count');
      return response.data;
    } catch (error) {
      console.error('Error fetching unread tickets count:', error);
      throw error;
    }
  }
};

export default ticketsApi;