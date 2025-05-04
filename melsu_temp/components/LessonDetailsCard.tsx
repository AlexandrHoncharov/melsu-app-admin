import React, {useState, useEffect} from 'react';
import {View, Text, StyleSheet, TouchableOpacity} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {format, differenceInMinutes, isBefore, isAfter, parseISO} from 'date-fns';
import {ru} from 'date-fns/locale';

// Colors
const COLORS = {
    primary: '#bb0000',
    text: '#333',
    textLight: '#666',
    border: '#e0e0e0',
    cardBg: '#fff',
    success: '#34C759',  // for completed lessons
    warning: '#FF9500',  // for lessons in progress
    info: '#3E7BFA',     // for upcoming lessons
    lectureColor: '#3E7BFA',
    practiceColor: '#34C759',
    labColor: '#FF9500',
    seminarColor: '#AF52DE',
    examColor: '#FF3B30'
};

// Props interface
interface LessonDetailsCardProps {
    lesson: any;
    date: Date;
    userType?: 'student' | 'teacher';
    onPress?: () => void;
}

// Possible statuses for a lesson
type LessonStatus = 'upcoming' | 'in-progress' | 'completed';

const LessonDetailsCard: React.FC<LessonDetailsCardProps> = ({lesson, date, userType = 'student', onPress}) => {
    const [status, setStatus] = useState<LessonStatus>('upcoming');
    const [timeRemaining, setTimeRemaining] = useState<string>('');
    const [timer, setTimer] = useState<NodeJS.Timeout | null>(null);

    // Extract the lesson data, handling both camelCase and snake_case properties
    const subject = lesson.subject || '';
    const lessonType = lesson.lessonType || lesson.lesson_type || '';
    const timeStart = lesson.timeStart || lesson.time_start || '';
    const timeEnd = lesson.timeEnd || lesson.time_end || '';
    const auditory = lesson.auditory || '';
    const teacherName = lesson.teacherName || lesson.teacher_name || lesson.teacher || '';
    const groupName = lesson.groupName || lesson.group_name || lesson.group || '';
    const subgroup = lesson.subgroup > 0 ? lesson.subgroup : undefined;

    // Check current status and update time remaining
    const updateStatus = () => {
        const now = new Date();
        const currentDate = format(date, 'yyyy-MM-dd');

        try {
            const startDateTime = parseISO(`${currentDate}T${timeStart}`);
            const endDateTime = parseISO(`${currentDate}T${timeEnd}`);

            // Determine lesson status
            if (isBefore(now, startDateTime)) {
                // Lesson hasn't started yet
                setStatus('upcoming');
                const minutesUntilStart = differenceInMinutes(startDateTime, now);

                if (minutesUntilStart < 60) {
                    setTimeRemaining(`Начнется через ${minutesUntilStart} мин`);
                } else {
                    const hours = Math.floor(minutesUntilStart / 60);
                    const mins = minutesUntilStart % 60;
                    setTimeRemaining(`Начнется через ${hours} ч ${mins} мин`);
                }
            } else if (isAfter(now, endDateTime)) {
                // Lesson is over
                setStatus('completed');
                setTimeRemaining('Занятие завершено');
            } else {
                // Lesson is in progress
                setStatus('in-progress');
                const minutesUntilEnd = differenceInMinutes(endDateTime, now);

                if (minutesUntilEnd < 60) {
                    setTimeRemaining(`Закончится через ${minutesUntilEnd} мин`);
                } else {
                    const hours = Math.floor(minutesUntilEnd / 60);
                    const mins = minutesUntilEnd % 60;
                    setTimeRemaining(`Закончится через ${hours} ч ${mins} мин`);
                }
            }
        } catch (error) {
            console.error('Error calculating lesson status:', error);
            setStatus('upcoming');
            setTimeRemaining('');
        }
    };

    // Initialize and set up timer to update status
    useEffect(() => {
        // Initial update
        updateStatus();

        // Set up timer to update every minute
        const intervalId = setInterval(updateStatus, 60000);
        setTimer(intervalId);

        // Clean up timer on unmount
        return () => {
            if (timer) clearInterval(timer);
        };
    }, []);

    // Get status color
    const getStatusColor = () => {
        switch (status) {
            case 'upcoming':
                return COLORS.info;
            case 'in-progress':
                return COLORS.warning;
            case 'completed':
                return COLORS.success;
            default:
                return COLORS.textLight;
        }
    };

    // Get status icon
    const getStatusIcon = () => {
        switch (status) {
            case 'upcoming':
                return 'time-outline';
            case 'in-progress':
                return 'play-circle-outline';
            case 'completed':
                return 'checkmark-circle-outline';
            default:
                return 'help-circle-outline';
        }
    };

    // Get color for lesson type
    const getLessonTypeColor = (type: string) => {
        if (!type) return COLORS.info;

        const lowerType = type.toLowerCase();

        if (lowerType.includes('л.') || lowerType.includes('лекция')) {
            return COLORS.lectureColor;
        } else if (lowerType.includes('пр.') || lowerType.includes('практическое')) {
            return COLORS.practiceColor;
        } else if (lowerType.includes('лаб.')) {
            return COLORS.labColor;
        } else if (lowerType.includes('семинар')) {
            return COLORS.seminarColor;
        } else if (lowerType.includes('экзамен') || lowerType.includes('зач.') || lowerType.includes('зачет')) {
            return COLORS.examColor;
        }

        return COLORS.info;
    };

    // Format time to ensure HH:MM format
    const formatTime = (time: string) => {
        if (!time) return '';

        const parts = time.split(':');
        if (parts.length !== 2) return time;

        return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}`;
    };

    return (
        <TouchableOpacity
            style={[
                styles.container,
                {borderLeftColor: getLessonTypeColor(lessonType)},
                status === 'in-progress' && styles.activeContainer
            ]}
            onPress={onPress}
            activeOpacity={0.7}
        >
            {/* Header with subject and type */}
            <View style={styles.header}>
                <Text style={styles.subject} numberOfLines={1}>{subject}</Text>
                <View style={[styles.typeBadge, {backgroundColor: getLessonTypeColor(lessonType)}]}>
                    <Text style={styles.typeText}>{lessonType}</Text>
                </View>
            </View>

            {/* Time and location */}
            <View style={styles.infoRow}>
                <View style={styles.iconContainer}>
                    <Ionicons name="time-outline" size={18} color={COLORS.textLight}/>
                </View>
                <Text style={styles.infoText}>
                    {formatTime(timeStart)} - {formatTime(timeEnd)}
                    {auditory ? ` • Ауд. ${auditory}` : ''}
                    {subgroup ? ` • Подгруппа ${subgroup}` : ''}
                </Text>
            </View>

            {/* Teacher or group info based on user type */}
            <View style={styles.infoRow}>
                <View style={styles.iconContainer}>
                    <Ionicons
                        name={userType === 'student' ? "person-outline" : "people-outline"}
                        size={18}
                        color={COLORS.textLight}
                    />
                </View>
                {userType === 'student' ? (
                    <Text style={styles.infoText}>
                        Преподаватель: {teacherName || 'Не указан'}
                    </Text>
                ) : (
                    <Text style={styles.infoText}>
                        {lesson.groups && lesson.groups.length > 1
                            ? `Группы: ${groupName}`
                            : `Группа: ${groupName}`}
                    </Text>
                )}
            </View>

            {/* Status indicator */}
            <View style={[styles.statusContainer, {backgroundColor: `${getStatusColor()}15`}]}>
                <Ionicons name={getStatusIcon()} size={16} color={getStatusColor()}/>
                <Text style={[styles.statusText, {color: getStatusColor()}]}>
                    {timeRemaining}
                </Text>
            </View>
        </TouchableOpacity>
    );
};

const styles = StyleSheet.create({
    container: {
        backgroundColor: COLORS.cardBg,
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        borderLeftWidth: 4,
        shadowColor: '#000',
        shadowOffset: {width: 0, height: 1},
        shadowOpacity: 0.1,
        shadowRadius: 2,
        elevation: 2,
    },
    activeContainer: {
        backgroundColor: '#FFF8F8',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    subject: {
        fontSize: 16,
        fontWeight: '600',
        color: COLORS.text,
        flex: 1,
        marginRight: 10,
    },
    typeBadge: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
    },
    typeText: {
        fontSize: 11,
        color: '#FFFFFF',
        fontWeight: '600',
    },
    infoRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 10,
    },
    iconContainer: {
        width: 24,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 8,
    },
    infoText: {
        fontSize: 14,
        color: COLORS.textLight,
        flex: 1,
    },
    statusContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 8,
        marginTop: 4,
    },
    statusText: {
        fontSize: 13,
        fontWeight: '500',
        marginLeft: 6,
    }
});

export default LessonDetailsCard;