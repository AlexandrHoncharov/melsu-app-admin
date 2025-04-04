# app/utils/excel_helpers.py
import re
import pandas as pd


def process_excel_teachers(file_path):
    """
    Обрабатывает Excel-файл с преподавателями и возвращает список словарей.
    """
    messages = []

    try:
        # Читаем файл Excel
        df = pd.read_excel(file_path)
        messages.append(f"Файл содержит {len(df)} строк и {len(df.columns)} столбцов")

        # Определяем столбцы по именам или индексам
        code_column = None
        name_column = None

        # Ищем столбцы по ключевым словам в заголовках
        for col in df.columns:
            col_str = str(col).lower()
            if any(keyword in col_str for keyword in ['код', 'code', 'id']):
                code_column = col
            elif any(keyword in col_str for keyword in ['фио', 'преподаватель', 'name']):
                name_column = col

        # Если не нашли по ключевым словам, берем первые два столбца
        if not code_column and len(df.columns) > 0:
            code_column = df.columns[0]
        if not name_column and len(df.columns) > 1:
            name_column = df.columns[1]

        messages.append(f"Используем столбцы: код - {code_column}, ФИО - {name_column}")

        if not code_column or not name_column:
            messages.append("Не удалось определить столбцы с кодом и ФИО преподавателя")
            return [], messages

        # Обрабатываем данные
        results = []
        skipped = 0

        for i, row in df.iterrows():
            # Получаем и обрабатываем код и имя
            code = str(row[code_column]).strip() if not pd.isna(row[code_column]) else None
            name = str(row[name_column]).strip() if not pd.isna(row[name_column]) else None

            # Очищаем код от нечисловых символов, если это нужно
            if code and not code.isdigit():
                code = re.sub(r'\D', '', code)

            # Проверяем валидность данных
            if not code or not name or name.lower() in ['фио', 'преподаватель']:
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
        messages.append(f"Ошибка при обработке файла: {str(e)}")
        return [], messages