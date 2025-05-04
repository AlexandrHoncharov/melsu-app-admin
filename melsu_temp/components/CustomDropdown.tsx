// components/CustomDropdown.tsx
import React, {useState} from 'react';
import {
    View,
    Text,
    Modal,
    TouchableOpacity,
    FlatList,
    StyleSheet,
    TextInput,
    Dimensions,
    TouchableWithoutFeedback
} from 'react-native';
import {Ionicons} from '@expo/vector-icons';

interface DropdownItem {
    id: string | number;
    label: string;
    value: any;
}

interface CustomDropdownProps {
    items: DropdownItem[];
    selectedValue: any;
    onValueChange: (value: any) => void;
    placeholder?: string;
    error?: boolean;
    searchable?: boolean;
}

const {width, height} = Dimensions.get('window');

const CustomDropdown: React.FC<CustomDropdownProps> = ({
                                                           items,
                                                           selectedValue,
                                                           onValueChange,
                                                           placeholder = 'Выберите...',
                                                           error = false,
                                                           searchable = true
                                                       }) => {
    const [modalVisible, setModalVisible] = useState(false);
    const [searchText, setSearchText] = useState('');

    // Find the selected item to display its label
    const selectedItem = items.find(item => item.value === selectedValue);

    // Filter items based on search text
    const filteredItems = searchText
        ? items.filter(item =>
            item.label.toLowerCase().includes(searchText.toLowerCase())
        )
        : items;

    const toggleModal = () => {
        setModalVisible(!modalVisible);
        if (!modalVisible) {
            setSearchText('');
        }
    };

    const handleSelect = (value: any) => {
        onValueChange(value);
        toggleModal();
    };

    return (
        <View style={styles.container}>
            {/* Dropdown Button */}
            <TouchableOpacity
                style={[
                    styles.dropdownButton,
                    error && styles.dropdownButtonError
                ]}
                onPress={toggleModal}
                activeOpacity={0.7}
            >
                <Text
                    style={[
                        styles.dropdownButtonText,
                        !selectedItem && styles.placeholderText
                    ]}
                    numberOfLines={1}
                >
                    {selectedItem ? selectedItem.label : placeholder}
                </Text>
                <Ionicons
                    name={modalVisible ? "chevron-up" : "chevron-down"}
                    size={20}
                    color="#666"
                />
            </TouchableOpacity>

            {/* Dropdown Modal */}
            <Modal
                visible={modalVisible}
                transparent={true}
                animationType="fade"
                onRequestClose={toggleModal}
            >
                <TouchableWithoutFeedback onPress={toggleModal}>
                    <View style={styles.modalOverlay}>
                        <TouchableWithoutFeedback onPress={() => {
                        }}>
                            <View style={styles.modalContent}>
                                <View style={styles.modalHeader}>
                                    <Text style={styles.modalTitle}>Выберите направление</Text>
                                    <TouchableOpacity onPress={toggleModal}>
                                        <Ionicons name="close" size={24} color="#666"/>
                                    </TouchableOpacity>
                                </View>

                                {searchable && (
                                    <View style={styles.searchContainer}>
                                        <Ionicons name="search" size={20} color="#999"/>
                                        <TextInput
                                            style={styles.searchInput}
                                            placeholder="Поиск..."
                                            value={searchText}
                                            onChangeText={setSearchText}
                                            clearButtonMode="while-editing"
                                        />
                                        {searchText ? (
                                            <TouchableOpacity onPress={() => setSearchText('')}>
                                                <Ionicons name="close-circle" size={20} color="#999"/>
                                            </TouchableOpacity>
                                        ) : null}
                                    </View>
                                )}

                                {filteredItems.length === 0 ? (
                                    <View style={styles.emptyContainer}>
                                        <Text style={styles.emptyText}>
                                            Ничего не найдено
                                        </Text>
                                    </View>
                                ) : (
                                    <FlatList
                                        data={filteredItems}
                                        keyExtractor={(item) => item.id.toString()}
                                        renderItem={({item}) => (
                                            <TouchableOpacity
                                                style={[
                                                    styles.dropdownItem,
                                                    item.value === selectedValue && styles.selectedItem
                                                ]}
                                                onPress={() => handleSelect(item.value)}
                                            >
                                                <Text
                                                    style={[
                                                        styles.dropdownItemText,
                                                        item.value === selectedValue && styles.selectedItemText
                                                    ]}
                                                    numberOfLines={2}
                                                >
                                                    {item.label}
                                                </Text>
                                                {item.value === selectedValue && (
                                                    <Ionicons name="checkmark" size={20} color="#770002"/>
                                                )}
                                            </TouchableOpacity>
                                        )}
                                        style={styles.dropdownList}
                                        showsVerticalScrollIndicator={true}
                                    />
                                )}
                            </View>
                        </TouchableWithoutFeedback>
                    </View>
                </TouchableWithoutFeedback>
            </Modal>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        width: '100%',
    },
    dropdownButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: 50,
        backgroundColor: '#f5f5f5',
        borderWidth: 1,
        borderColor: '#f0f0f0',
        borderRadius: 8,
        paddingHorizontal: 12,
    },
    dropdownButtonError: {
        borderColor: '#d32f2f',
    },
    dropdownButtonText: {
        flex: 1,
        fontSize: 16,
        color: '#333',
    },
    placeholderText: {
        color: '#999',
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    modalContent: {
        width: width * 0.9,
        maxHeight: height * 0.7,
        backgroundColor: '#fff',
        borderRadius: 12,
        overflow: 'hidden',
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#f0f0f0',
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#333',
    },
    searchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#f0f0f0',
        backgroundColor: '#f9f9f9',
    },
    searchInput: {
        flex: 1,
        height: 40,
        marginLeft: 8,
        fontSize: 16,
    },
    dropdownList: {
        maxHeight: height * 0.5,
    },
    dropdownItem: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#f0f0f0',
    },
    selectedItem: {
        backgroundColor: '#f8e8e8',
    },
    dropdownItemText: {
        fontSize: 16,
        color: '#333',
        flex: 1,
        marginRight: 8,
    },
    selectedItemText: {
        fontWeight: '600',
        color: '#770002',
    },
    emptyContainer: {
        padding: 40,
        alignItems: 'center',
        justifyContent: 'center',
    },
    emptyText: {
        fontSize: 16,
        color: '#999',
        textAlign: 'center',
    },
});

export default CustomDropdown;