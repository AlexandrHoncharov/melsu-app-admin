import React from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// Define the props interface
interface LessonDetailsModalProps {
  visible: boolean;
  lesson: any; // Lesson object from schedule
  onClose: () => void;
  userType?: string; // 'student' or 'teacher'
}

// Colors
const COLORS = {
  primary: '#bb0000',
  text: '#333',
  textLight: '#666',
  border: '#e0e0e0',
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
  userType
}) => {
  if (!lesson) return null;

  // Get color for lesson type
  const getLessonTypeColor = (type: string) => {
    if (!type) return COLORS.primary;

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

    return COLORS.primary;
  };

  // Format time
  const formatTime = (time: string) => {
    if (!time) return '';
    const parts = time.split(':');
    if (parts.length !== 2) return time;
    return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}`;
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
            <Text style={styles.modalTitle}>Class Details</Text>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Ionicons name="close" size={24} color="#777" />
            </TouchableOpacity>
          </View>

          {/* Content */}
          <ScrollView style={styles.modalContent}>
            {/* Subject name */}
            <Text style={styles.subjectName}>{lesson.subject}</Text>

            {/* Type badge */}
            <View
              style={[
                styles.typeBadge,
                { backgroundColor: getLessonTypeColor(lesson.lesson_type) }
              ]}
            >
              <Text style={styles.typeBadgeText}>{lesson.lesson_type}</Text>
            </View>

            {/* Details section */}
            <View style={styles.detailsSection}>
              {/* Time */}
              <View style={styles.detailRow}>
                <View style={styles.detailIcon}>
                  <Ionicons name="time-outline" size={20} color="#555" />
                </View>
                <View style={styles.detailContent}>
                  <Text style={styles.detailLabel}>Time</Text>
                  <Text style={styles.detailValue}>
                    {formatTime(lesson.time_start)} - {formatTime(lesson.time_end)}
                  </Text>
                </View>
              </View>

              {/* Classroom */}
              <View style={styles.detailRow}>
                <View style={styles.detailIcon}>
                  <Ionicons name="location-outline" size={20} color="#555" />
                </View>
                <View style={styles.detailContent}>
                  <Text style={styles.detailLabel}>Classroom</Text>
                  <Text style={styles.detailValue}>{lesson.auditory || 'Not specified'}</Text>
                </View>
              </View>

              {/* Teacher (for students) */}
              {userType === 'student' && (
                <View style={styles.detailRow}>
                  <View style={styles.detailIcon}>
                    <Ionicons name="person-outline" size={20} color="#555" />
                  </View>
                  <View style={styles.detailContent}>
                    <Text style={styles.detailLabel}>Teacher</Text>
                    <Text style={styles.detailValue}>{lesson.teacher_name || 'Not specified'}</Text>
                  </View>
                </View>
              )}

              {/* Groups (for teachers) */}
              {userType === 'teacher' && (
                <View style={styles.detailRow}>
                  <View style={styles.detailIcon}>
                    <Ionicons name="people-outline" size={20} color="#555" />
                  </View>
                  <View style={styles.detailContent}>
                    <Text style={styles.detailLabel}>
                      {lesson.groups && lesson.groups.length > 1 ? 'Groups' : 'Group'}
                    </Text>
                    <Text style={styles.detailValue}>{lesson.group_name || 'Not specified'}</Text>
                  </View>
                </View>
              )}

              {/* Subgroup */}
              {lesson.subgroup > 0 && (
                <View style={styles.detailRow}>
                  <View style={styles.detailIcon}>
                    <Ionicons name="git-branch-outline" size={20} color="#555" />
                  </View>
                  <View style={styles.detailContent}>
                    <Text style={styles.detailLabel}>Subgroup</Text>
                    <Text style={styles.detailValue}>{lesson.subgroup}</Text>
                  </View>
                </View>
              )}
            </View>
          </ScrollView>

          {/* Bottom button */}
          <TouchableOpacity
            style={styles.closeButtonBottom}
            onPress={onClose}
          >
            <Text style={styles.closeButtonText}>Close</Text>
          </TouchableOpacity>
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
    paddingBottom: Platform.OS === 'ios' ? 30 : 20, // Extra padding for iOS
    maxHeight: '80%',
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
  subjectName: {
    fontSize: 22,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 12,
  },
  typeBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    marginBottom: 20,
  },
  typeBadgeText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 12,
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
  closeButtonBottom: {
    backgroundColor: COLORS.primary,
    marginHorizontal: 16,
    marginTop: 8,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  closeButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16,
  },
});

export default LessonDetailsModal;