"""
Вспомогательные функции для отладки push-уведомлений.
Добавьте этот файл в тот же каталог, где находится api.py
"""
import json
import logging
import os
import time

from firebase_admin import messaging

# Настраиваем логгер
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger('push_notifications')
handler = logging.FileHandler('push_debug.log')
handler.setFormatter(logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s'))
logger.addHandler(handler)


def log_token_info(token, user_id=None, platform=None, device_name=None):
    """Логирование детальной информации о токене устройства"""
    token_type = "Expo" if token.startswith('ExponentPushToken') else "FCM"

    logger.info(f"===== Информация о токене =====")
    logger.info(f"Токен: {token[:15]}... (тип: {token_type})")
    logger.info(f"Пользователь: {user_id}")
    logger.info(f"Платформа: {platform}")
    logger.info(f"Устройство: {device_name}")
    logger.info(f"Время регистрации: {time.strftime('%Y-%m-%d %H:%M:%S')}")

    return {
        "token_type": token_type,
        "token_preview": token[:15] + "...",
        "user_id": user_id,
        "platform": platform,
        "device_name": device_name,
        "timestamp": time.strftime('%Y-%m-%d %H:%M:%S')
    }


def test_fcm_token(token):
    """Тестирование валидности FCM токена"""
    if token.startswith('ExponentPushToken'):
        logger.info(f"Токен {token[:15]}... - это Expo token, пропускаем FCM проверку")
        return {
            "valid": None,
            "message": "Expo token не требует валидации FCM"
        }

    logger.info(f"Проверка FCM токена: {token[:15]}...")

    try:
        # Отправляем "сухое" сообщение для проверки валидности токена
        message = messaging.Message(
            data={"test": "true"},
            token=token,
        )

        # dry_run=True означает, что сообщение не будет отправлено,
        # но будет проверена его валидность
        response = messaging.send(message, dry_run=True)

        logger.info(f"FCM токен валиден. Ответ: {response}")
        return {
            "valid": True,
            "message": f"Токен валиден. Ответ: {response}"
        }
    except Exception as e:
        logger.error(f"Ошибка проверки FCM токена: {str(e)}")
        return {
            "valid": False,
            "message": str(e)
        }


def check_firebase_config():
    """Проверка конфигурации Firebase"""
    results = {
        "creds_file_exists": False,
        "creds_contents_valid": False,
        "details": {}
    }

    # Проверяем файл учетных данных
    firebase_cred_path = os.path.join(os.path.dirname(__file__), 'firebase-service-account.json')
    results["creds_file_exists"] = os.path.exists(firebase_cred_path)

    if results["creds_file_exists"]:
        try:
            with open(firebase_cred_path, 'r') as f:
                creds_data = json.load(f)

            # Проверяем обязательные поля
            required_fields = ['type', 'project_id', 'private_key_id', 'private_key', 'client_email']
            missing_fields = [field for field in required_fields if field not in creds_data]

            results["creds_contents_valid"] = len(missing_fields) == 0

            if missing_fields:
                results["details"]["missing_fields"] = missing_fields
            else:
                results["details"]["project_id"] = creds_data.get('project_id')
                results["details"]["client_email"] = creds_data.get('client_email')

                # Проверяем валидность private_key
                if 'private_key' in creds_data:
                    pk = creds_data['private_key']
                    results["details"]["private_key_valid"] = pk.startswith(
                        '-----BEGIN PRIVATE KEY-----') and pk.endswith('-----END PRIVATE KEY-----\n')
        except Exception as e:
            results["creds_contents_valid"] = False
            results["details"]["error"] = str(e)

    # Логируем результаты проверки
    logger.info(f"===== Проверка Firebase Config =====")
    logger.info(f"Файл найден: {results['creds_file_exists']}")
    logger.info(f"Содержимое валидно: {results['creds_contents_valid']}")
    logger.info(f"Детали: {json.dumps(results['details'])}")

    return results

# Дополнительные функции могут быть добавлены по мере необходимости
