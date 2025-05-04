import React, {useState, useEffect} from 'react';
import {
    View,
    Text,
    Modal,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    Platform
} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {format, parseISO, differenceInMinutes, isBefore, isAfter} from 'date-fns';
import {ru} from 'date-fns/locale';

// Define the props interface
interface LessonDetailsModalProps {
    visible: boolean;
    lesson: any | null;
    onClose: () => void;
    userType?: 'student' | 'teacher';
}

// Colors
const COLORS = {
    primary: '#bb0000',
    text: '#333',
    textLight: '#666',
    border: '#e0e0e0',
    success: '#34C759',    // completed
    warning: '#FF9500',    // in progress
    info: '#3E7BFA',       // upcoming
    lectureColor: '#3E7BFA',
    practiceColor: '#34C759',
    labColor: '#FF9500',
    seminarColor: '#AF52DE',
    examColor: '#FF3B30'
};

const LessonDetailsModal: React.FC<LessonDetailsModalProps> = ({
                                                                   visible,
                                                                   lesson,
                                                                   onClose,
                                                                   userType = 'student'
                                                               }) => {
    const [status, setStatus] = useState<'upcoming' | 'in-progress' | 'completed'>('upcoming');
    const [timeRemaining, setTimeRemaining] = useState('');
    const [timer, setTimer] = useState<NodeJS.Timeout | null>(null);

    // Function to get current status of the lesson
    const updateStatus = () => {
        if (!lesson) return;

        const now = new Date();

        // Use either camelCase or snake_case properties
        const timeStart = lesson.timeStart || lesson.time_start || '';
        const timeEnd = lesson.timeEnd || lesson.time_end || '';
        const date = lesson.date || format(new Date(), 'yyyy-MM-dd');

        try {
            // Form date strings for comparison
            const lessonDateStr = typeof date === 'string' ? date : format(date, 'yyyy-MM-dd');
            const startDateTime = new Date(`${lessonDateStr}T${timeStart}`);
            const endDateTime = new Date(`${lessonDateStr}T${timeEnd}`);

            // Adjust to today if comparing with future/past dates
            const today = new Date();
            const todayStr = format(today, 'yyyy-MM-dd');

            // For non-today dates, only show status without countdown
            if (lessonDateStr !== todayStr) {
                if (isBefore(new Date(lessonDateStr), today)) {
                    // Past date
                    setStatus('completed');
                    setTimeRemaining('Занятие завершено');
                } else {
                    // Future date
                    setStatus('upcoming');
                    setTimeRemaining('Занятие еще не началось');
                }
                return;
            }

            // Determine status for today
            if (isBefore(now, startDateTime)) {
                // Upcoming: hasn't started yet
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
                // Completed: already ended
                setStatus('completed');
                setTimeRemaining('Занятие завершено');
            } else {
                // In progress: happening now
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
        }
    };

    // Set up a timer to update status every minute
    useEffect(() => {
        if (visible && lesson) {
            // Initial update
            updateStatus();

            // Set interval to update every minute
            const intervalId = setInterval(updateStatus, 60000);
            setTimer(intervalId);

            return () => {
                if (timer) clearInterval(timer);
            };
        } else {
            // Clear timer when modal is hidden
            if (timer) {
                clearInterval(timer);
                setTimer(null);
            }
        }
    }, [visible, lesson]);

    // Return null if no lesson data
    if (!lesson) return null;

    // Extract lesson data, handling different property name formats
    const subject = lesson.subject || '';
    const lessonType = lesson.lessonType || lesson.lesson_type || '';
    const timeStart = lesson.timeStart || lesson.time_start || '';
    const timeEnd = lesson.timeEnd || lesson.time_end || '';
    const auditory = lesson.auditory || '';
    const teacherName = lesson.teacherName || lesson.teacher_name || lesson.teacher || '';
    const groupName = lesson.groupName || lesson.group_name || lesson.group || '';
    const subgroup = lesson.subgroup > 0 ? lesson.subgroup : null;
    const date = lesson.date || '';

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

    // Format time to ensure HH:MM format
    const formatTime = (time: string) => {
        if (!time) return '';

        const parts = time.split(':');
        if (parts.length !== 2) return time;

        return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}`;
    };

    // Get formatted date (if available)
    const getFormattedDate = () => {
        if (!date) return '';

        try {
            const dateObj = typeof date === 'string' ? new Date(date) : date;
            return format(dateObj, 'd MMMM, EEEE', {locale: ru});
        } catch (e) {
            return '';
        }
    };

    return (
        <Modal
            visible={visible}
            transparent={true}
            animationType="slide"
            onRequestClose={onClose}
        >
            <View style={styles.modalOverlay}>
                <View style={styles.modalContainer}>
                    {/* Header */}
                    <View style={styles.modalHeader}>
                        <Text style={styles.modalTitle}>Информация о занятии</Text>
                        <TouchableOpacity style={styles.closeButton} onPress={onClose}>
                            <Ionicons name="close" size={24} color="#777"/>
                        </TouchableOpacity>
                    </View>

                    {/* Content */}
                    <ScrollView style={styles.modalContent}>
                        {/* Lesson title and type */}
                        <View style={styles.subjectContainer}>
                            <Text style={styles.subjectName}>{subject}</Text>
                            <View
                                style={[
                                    styles.typeBadge,
                                    {backgroundColor: getLessonTypeColor(lessonType)}
                                ]}
                            >
                                <Text style={styles.typeBadgeText}>{lessonType}</Text>
                            </View>
                        </View>

                        {/* Status indicator */}
                        <View style={[styles.statusContainer, {backgroundColor: `${getStatusColor()}15`}]}>
                            <Ionicons
                                name={
                                    status === 'upcoming' ? 'time-outline' :
                                        status === 'in-progress' ? 'play-circle-outline' :
                                            'checkmark-circle-outline'
                                }
                                size={20}
                                color={getStatusColor()}
                            />
                            <Text style={[styles.statusText, {color: getStatusColor()}]}>
                                {timeRemaining}
                            </Text>
                        </View>

                        {/* Details section */}
                        <View style={styles.detailsSection}>
                            {/* Date (if available) */}
                            {getFormattedDate() && (
                                <View style={styles.detailRow}>
                                    <View style={styles.detailIcon}>
                                        <Ionicons name="calendar-outline" size={20} color="#555"/>
                                    </View>
                                    <View style={styles.detailContent}>
                                        <Text style={styles.detailLabel}>Дата</Text>
                                        <Text style={styles.detailValue}>{getFormattedDate()}</Text>
                                    </View>
                                </View>
                            )}

                            {/* Time */}
                            <View style={styles.detailRow}>
                                <View style={styles.detailIcon}>
                                    <Ionicons name="time-outline" size={20} color="#555"/>
                                </View>
                                <View style={styles.detailContent}>
                                    <Text style={styles.detailLabel}>Время</Text>
                                    <Text style={styles.detailValue}>
                                        {formatTime(timeStart)} - {formatTime(timeEnd)}
                                    </Text>
                                </View>
                            </View>

                            {/* Classroom */}
                            <View style={styles.detailRow}>
                                <View style={styles.detailIcon}>
                                    <Ionicons name="location-outline" size={20} color="#555"/>
                                </View>
                                <View style={styles.detailContent}>
                                    <Text style={styles.detailLabel}>Аудитория</Text>
                                    <Text style={styles.detailValue}>{auditory || 'Не указана'}</Text>
                                </View>
                            </View>

                            {/* Subgroup (if applicable) */}
                            {subgroup && (
                                <View style={styles.detailRow}>
                                    <View style={styles.detailIcon}>
                                        <Ionicons name="git-branch-outline" size={20} color="#555"/>
                                    </View>
                                    <View style={styles.detailContent}>
                                        <Text style={styles.detailLabel}>Подгруппа</Text>
                                        <Text style={styles.detailValue}>{subgroup}</Text>
                                    </View>
                                </View>
                            )}

                            {/* Teacher (for students) */}
                            {userType === 'student' && (
                                <View style={styles.detailRow}>
                                    <View style={styles.detailIcon}>
                                        <Ionicons name="person-outline" size={20} color="#555"/>
                                    </View>
                                    <View style={styles.detailContent}>
                                        <Text style={styles.detailLabel}>Преподаватель</Text>
                                        <Text style={styles.detailValue}>{teacherName || 'Не указан'}</Text>
                                    </View>
                                </View>
                            )}

                            {/* Groups (for teachers) */}
                            {userType === 'teacher' && (
                                <View style={styles.detailRow}>
                                    <View style={styles.detailIcon}>
                                        <Ionicons name="people-outline" size={20} color="#555"/>
                                    </View>
                                    <View style={styles.detailContent}>
                                        <Text style={styles.detailLabel}>
                                            {lesson.groups && lesson.groups.length > 1 ? 'Группы' : 'Группа'}
                                        </Text>
                                        <Text style={styles.detailValue}>{groupName || 'Не указана'}</Text>
                                    </View>
                                </View>
                            )}
                        </View>
                    </ScrollView>

                    {/* Action buttons */}
                    <View style={styles.buttonsContainer}>
                        {/* Add to Calendar button */}
                        <TouchableOpacity style={styles.secondaryButton}>
                            <Ionicons name="calendar-outline" size={20} color="#770002"/>
                            <Text style={styles.secondaryButtonText}>В календарь</Text>
                        </TouchableOpacity>

                        {/* Close button */}
                        <TouchableOpacity
                            style={styles.closeButtonBottom}
                            onPress={onClose}
                        >
                            <Text style={styles.closeButtonText}>Закрыть</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'flex-end',
    },
    modalContainer: {
        backgroundColor: 'white',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        paddingBottom: Platform.OS === 'ios' ? 30 : 20,
        maxHeight: '85%',
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: COLORS.text,
    },
    closeButton: {
        width: 40,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
    },
    modalContent: {
        padding: 16,
    },
    subjectContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 12,
    },
    subjectName: {
        fontSize: 22,
        fontWeight: 'bold',
        color: COLORS.text,
        flex: 1,
        marginRight: 12,
    },
    typeBadge: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 8,
    },
    typeBadgeText: {
        color: 'white',
        fontWeight: '600',
        fontSize: 12,
    },
    statusContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderRadius: 8,
        marginBottom: 20,
    },
    statusText: {
        fontSize: 14,
        fontWeight: '500',
        marginLeft: 8,
    },
    detailsSection: {
        marginBottom: 20,
    },
    detailRow: {
        flexDirection: 'row',
        marginBottom: 16,
        alignItems: 'flex-start',
    },
    detailIcon: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#f5f5f5',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    detailContent: {
        flex: 1,
    },
    detailLabel: {
        fontSize: 12,
        color: COLORS.textLight,
        marginBottom: 4,
    },
    detailValue: {
        fontSize: 16,
        color: COLORS.text,
    },
    buttonsContainer: {
        flexDirection: 'row',
        padding: 16,
        paddingTop: 8,
        borderTopWidth: 1,
        borderTopColor: '#eee',
    },
    secondaryButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12,
        marginRight: 8,
        borderWidth: 1,
        borderColor: '#770002',
        borderRadius: 8,
    },
    secondaryButtonText: {
        color: '#770002',
        fontWeight: '600',
        marginLeft: 8,
    },
    closeButtonBottom: {
        flex: 1,
        backgroundColor: COLORS.primary,
        paddingVertical: 14,
        borderRadius: 8,
        alignItems: 'center',
        marginLeft: 8,
    },
    closeButtonText: {
        color: 'white',
        fontWeight: 'bold',
        fontSize: 16,
    }
});

export default LessonDetailsModal;