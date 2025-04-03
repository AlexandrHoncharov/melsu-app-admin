# app/utils/excel_helpers.py
import re
import pandas as pd
import logging

logger = logging.getLogger(__name__)


def find_column_by_keywords(df, keywords, fallback_index=None):
    """
    Находит столбец в DataFrame по ключевым словам в заголовке.

    Args:
        df: pandas DataFrame
        keywords: список ключевых слов для поиска
        fallback_index: индекс для использования, если не найдено по ключевым словам

    Returns:
        Название столбца или None, если ничего не найдено
    """
    for col in df.columns:
        col_str = str(col).lower()
        if any(keyword.lower() in col_str for keyword in keywords):
            return col

    # Если ничего не найдено, но указан запасной индекс
    if fallback_index is not None and fallback_index < len(df.columns):
        return df.columns[fallback_index]

    return None


def extract_teacher_code(value):
    """
    Извлекает код преподавателя из разных форматов данных.

    Args:
        value: исходное значение (число, строка и т.д.)

    Returns:
        Строковый код или None, если не удалось извлечь
    """
    # Защита от None и NaN
    if pd.isna(value) or value is None:
        return None

    # Если это число
    if isinstance(value, (int, float)):
        return str(int(value))

    # Если это строка
    if isinstance(value, str):
        # Удаляем лишние пробелы
        value = value.strip()

        # Пустая строка
        if not value:
            return None

        # Просто число в строке
        if value.isdigit():
            return value

        # Число с точкой (например, из Excel может прийти как 1.0)
        if re.match(r'^\d+\.\d+$', value):
            return str(int(float(value)))

        # Извлекаем числа из текста (например, "Код: 123")
        matches = re.search(r'(?:код:?\s*)?(\d+)', value, re.IGNORECASE)
        if matches:
            return matches.group(1)

        # Если есть только цифры и разделители
        if re.match(r'^[0-9\s.,-]+$', value):
            digits = re.sub(r'[^0-9]', '', value)
            if digits:
                return digits

    # Если ничего не подошло
    return None


def clean_teacher_name(value):
    """
    Очищает и нормализует имя преподавателя.

    Args:
        value: исходное значение имени

    Returns:
        Очищенное имя или None, если не удалось обработать
    """
    # Защита от None и NaN
    if pd.isna(value) or value is None:
        return None

    # Если это не строка, преобразуем
    if not isinstance(value, str):
        value = str(value)

    # Удаляем лишние пробелы и нормализуем
    value = re.sub(r'\s+', ' ', value.strip())

    # Проверяем, не является ли это заголовком или пустой строкой
    if not value or value.lower() in ['фио', 'преподаватель', 'name', 'ф.и.о.', 'фамилия']:
        return None

    return value


def process_excel_teachers(file_path):
    """
    Обрабатывает Excel-файл с преподавателями и возвращает список словарей.

    Args:
        file_path: путь к файлу Excel

    Returns:
        tuple: (список словарей с данными преподавателей, информационные сообщения)
    """
    messages = []

    try:
        # Читаем файл Excel
        df = pd.read_excel(file_path)
        messages.append(f"Файл содержит {len(df)} строк и {len(df.columns)} столбцов")
        messages.append(f"Столбцы в файле: {', '.join(str(col) for col in df.columns)}")

        # Ищем столбцы с кодом и ФИО
        code_column = find_column_by_keywords(df, ['код', 'code', 'id'], 0)
        name_column = find_column_by_keywords(df, ['фио', 'преподаватель', 'name', 'фамилия', 'ф.и.о.'], 1)

        messages.append(f"Найденные столбцы: код - {code_column}, ФИО - {name_column}")

        if not code_column or not name_column:
            messages.append("Не удалось определить нужные столбцы!")
            return [], messages

        # Показываем примеры для отладки
        debug_rows = []
        for i, row in df.head(5).iterrows():
            code_val = row[code_column] if pd.notna(row[code_column]) else ''
            name_val = row[name_column] if pd.notna(row[name_column]) else ''
            debug_rows.append(f"Строка {i + 1}: Код={code_val}, ФИО={name_val}")

        messages.append(f"Примеры данных: {'; '.join(debug_rows)}")

        # Обрабатываем данные
        results = []
        skipped = 0

        for i, row in df.iterrows():
            raw_code = row[code_column]
            raw_name = row[name_column]

            code = extract_teacher_code(raw_code)
            name = clean_teacher_name(raw_name)

            if not code or not name:
                skipped += 1
                continue

            results.append({
                'code': code,
                'full_name': name,
                'row': i + 1  # Номер строки в Excel (с 1)
            })

        messages.append(f"Всего обработано строк: {len(results)}, пропущено: {skipped}")

        return results, messages

    except Exception as e:
        import traceback
        messages.append(f"Ошибка при обработке файла: {str(e)}")
        messages.append(f"Детали: {traceback.format_exc()}")
        return [], messages