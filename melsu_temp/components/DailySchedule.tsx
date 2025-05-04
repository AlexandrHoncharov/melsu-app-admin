import React from 'react';
import {ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View} from 'react-native';
import {format} from 'date-fns';
import {ru} from 'date-fns/locale';
import LessonDetailsCard from './LessonDetailsCard';
import {Ionicons} from '@expo/vector-icons';

interface DailyScheduleProps {
    date: Date;
    lessons: any[];
    isLoading: boolean;
    refreshing: boolean;
    onRefresh: () => void;
    onSelectLesson: (lesson: any) => void;
    userType?: 'student' | 'teacher';
    isOffline?: boolean;
}

const DailySchedule: React.FC<DailyScheduleProps> = ({
                                                         date,
                                                         lessons,
                                                         isLoading,
                                                         refreshing,
                                                         onRefresh,
                                                         onSelectLesson,
                                                         userType = 'student',
                                                         isOffline = false
                                                     }) => {
    // Function to group lessons by time slot
    const groupLessonsByTime = (lessons: any[]) => {
        const timeSlots: Record<string, any[]> = {};

        lessons.forEach(lesson => {
            const timeStart = lesson.timeStart || lesson.time_start || '';
            const timeEnd = lesson.timeEnd || lesson.time_end || '';
            const timeKey = `${timeStart}-${timeEnd}`;

            if (!timeSlots[timeKey]) {
                timeSlots[timeKey] = [];
            }

            timeSlots[timeKey].push(lesson);
        });

        // Convert to array and sort by time
        return Object.entries(timeSlots)
            .sort(([timeA], [timeB]) => timeA.localeCompare(timeB))
            .map(([time, lessonsForTime]) => ({
                time,
                lessons: lessonsForTime
            }));
    };

    // Group the lessons by time
    const timeSlots = groupLessonsByTime(lessons);

    // Format the date to display
    const dateString = format(date, 'd MMMM, EEEE', {locale: ru});

    // Loading view
    if (isLoading) {
        return (
            <View style={styles.centerContainer}>
                <ActivityIndicator size="large" color="#770002"/>
                <Text style={styles.loadingText}>Загрузка расписания...</Text>
            </View>
        );
    }

    // Empty schedule view
    if (lessons.length === 0) {
        return (
            <ScrollView
                contentContainerStyle={styles.emptyContainer}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        colors={['#770002']}
                        tintColor="#770002"
                    />
                }
            >
                <Ionicons
                    name={isOffline ? "wifi-outline" : "calendar-outline"}
                    size={60}
                    color="#c0c0c0"
                />
                <Text style={styles.emptyTitle}>
                    {isOffline
                        ? "Нет сохраненных данных"
                        : "На сегодня занятий нет"}
                </Text>
                <Text style={styles.emptySubtitle}>
                    {isOffline
                        ? "Подключитесь к интернету, чтобы загрузить расписание"
                        : "Хорошего дня!"}
                </Text>
            </ScrollView>
        );
    }

    // Render schedule with lessons
    return (
        <ScrollView
            style={styles.container}
            contentContainerStyle={styles.content}
            refreshControl={
                <RefreshControl
                    refreshing={refreshing}
                    onRefresh={onRefresh}
                    colors={['#770002']}
                    tintColor="#770002"
                />
            }
        >
            {/* Date header */}
            <View style={styles.dateHeader}>
                <Text style={styles.dateText}>{dateString}</Text>
                {isOffline && (
                    <View style={styles.offlineTag}>
                        <Ionicons name="wifi-outline" size={12} color="#FFF"/>
                        <Text style={styles.offlineText}>Оффлайн</Text>
                    </View>
                )}
            </View>

            {/* Lessons list */}
            {timeSlots.map((slot, index) => (
                <View key={`${slot.time}-${index}`}>
                    {/* Time indicator */}
                    <View style={styles.timeHeader}>
                        <View style={styles.timeDot}/>
                        <Text style={styles.timeText}>
                            {slot.time.replace('-', ' – ')}
                        </Text>
                        <View style={styles.timeLine}/>
                    </View>

                    {/* Lessons for this time slot */}
                    {slot.lessons.map((lesson: any, lessonIndex: number) => (
                        <LessonDetailsCard
                            key={`${lesson.id || lesson._id || `${slot.time}-${lessonIndex}`}`}
                            lesson={lesson}
                            date={date}
                            userType={userType}
                            onPress={() => onSelectLesson(lesson)}
                        />
                    ))}
                </View>
            ))}

            {/* Bottom spacing */}
            <View style={styles.bottomPadding}/>
        </ScrollView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f9f9f9',
    },
    content: {
        padding: 16,
    },
    centerContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#f9f9f9',
    },
    loadingText: {
        marginTop: 16,
        fontSize: 16,
        color: '#666',
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 30,
    },
    emptyTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#333',
        marginTop: 16,
        marginBottom: 8,
        textAlign: 'center',
    },
    emptySubtitle: {
        fontSize: 15,
        color: '#666',
        textAlign: 'center',
    },
    dateHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    dateText: {
        fontSize: 18,
        fontWeight: '600',
        color: '#333',
        textTransform: 'capitalize',
    },
    offlineTag: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FF9500',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
    },
    offlineText: {
        color: '#FFF',
        fontSize: 12,
        fontWeight: '500',
        marginLeft: 4,
    },
    timeHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
        marginTop: 20,
    },
    timeDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#770002',
        marginRight: 8,
    },
    timeText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#770002',
        marginRight: 12,
    },
    timeLine: {
        flex: 1,
        height: 1,
        backgroundColor: '#e0e0e0',
    },
    bottomPadding: {
        height: 60,
    }
});

export default DailySchedule;