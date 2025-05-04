import apiClient from './apiClient';

// Типы для расписания
export interface ScheduleItem {
    id: string | number;
    date: string;
    timeStart: string;
    timeEnd: string;
    weekday: number;
    subject: string;
    type: string;
    teacher: string;
    location: string;
    subgroup?: number;
    group?: string; // для преподавателей
}

// Параметры для запроса расписания
interface ScheduleParams {
    date?: string;
    group?: string;
    teacher_id?: number;
    search?: string;
    week?: number;
    weekday?: number;
}

// API для работы с расписанием
const scheduleApi = {
    /**
     * Получение расписания
     * @param params Параметры запроса
     * @returns Список занятий
     */
    getSchedule: async (params: ScheduleParams = {}): Promise<ScheduleItem[]> => {
        const response = await apiClient.get('/schedule', {params});
        return response.data;
    },

    /**
     * Получение расписания на неделю
     * @param weekOffset Смещение недели (0 - текущая)
     * @returns Расписание на неделю по дням
     */
    getWeekSchedule: async (weekOffset: number = 0) => {
        const response = await apiClient.get('/schedule/week', {
            params: {week_offset: weekOffset}
        });
        return response.data;
    },

    /**
     * Получение списка групп
     * @returns Список групп
     */
    getGroups: async () => {
        const response = await apiClient.get('/schedule/groups');
        return response.data;
    },

    /**
     * Получение списка преподавателей
     * @returns Список преподавателей
     */
    getTeachers: async () => {
        const response = await apiClient.get('/schedule/teachers');
        return response.data;
    }
};

export default scheduleApi;