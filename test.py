# save_as_test_push.py
import requests
import json
import sys

def send_test_notification_expo(token):
    """
    Отправляет тестовое уведомление на токен Expo.
    Этот метод использует Expo Push API напрямую, минуя FCM.
    """
    try:
        # Проверяем, что это Expo токен
        if not token.startswith('ExponentPushToken'):
            print(f"ОШИБКА: Это не Expo токен: {token}")
            return False

        print(f"Отправка тестового уведомления на токен: {token}")

        # URL Expo Push API
        expo_push_url = "https://exp.host/--/api/v2/push/send"

        # Формируем уведомление с максимальными настройками
        push_message = {
            "to": token,
            "title": "ТЕСТОВОЕ УВЕДОМЛЕНИЕ",
            "body": "Это тестовое push-уведомление от приложения Университет",
            "sound": "default",
            "badge": 1,
            "channelId": "default",
            "priority": "high",
            "data": {
                "type": "test",
                "test": "true",
                "urgent": "true",
                "bypass_check": "true"
            },
            "_displayInForeground": True,
            "mutableContent": True,
            "contentAvailable": True
        }

        # Отправляем запрос
        headers = {
            "Accept": "application/json",
            "Content-Type": "application/json",
        }

        print("Отправляемые данные:", json.dumps(push_message, indent=2))

        response = requests.post(
            expo_push_url,
            data=json.dumps(push_message),
            headers=headers
        )

        # Проверяем результат
        print(f"Код ответа: {response.status_code}")
        print(f"Ответ: {response.text}")

        if response.status_code == 200:
            result = response.json()

            if "errors" in result and result["errors"]:
                print("ОШИБКА в ответе Expo:", result["errors"])
                return False

            if "data" in result and result["data"]:
                print("УСПЕХ: Уведомление отправлено!")
                print(f"ID квитанции: {result['data'][0]['id'] if 'id' in result['data'][0] else 'Нет ID'}")

                # Проверяем статус через 2 секунды
                import time
                time.sleep(2)

                if "id" in result["data"][0]:
                    receipt_id = result["data"][0]["id"]
                    check_receipt(receipt_id)

                return True
            else:
                print("ВНИМАНИЕ: Нет данных в ответе")
                return False
        else:
            print(f"ОШИБКА: Код {response.status_code}, текст: {response.text}")
            return False

    except Exception as e:
        print(f"КРИТИЧЕСКАЯ ОШИБКА: {str(e)}")
        return False

def check_receipt(receipt_id):
    """Проверяет статус отправленного уведомления"""
    try:
        url = "https://exp.host/--/api/v2/push/getReceipts"
        headers = {
            "Accept": "application/json",
            "Content-Type": "application/json",
        }

        data = {
            "ids": [receipt_id]
        }

        print(f"Проверка статуса уведомления, ID квитанции: {receipt_id}")

        response = requests.post(
            url,
            headers=headers,
            data=json.dumps(data)
        )

        if response.status_code == 200:
            receipt = response.json()
            print(f"Статус уведомления: {json.dumps(receipt, indent=2)}")

            # Проверяем наличие ошибок
            if "errors" in receipt and receipt["errors"]:
                for error_id, error_info in receipt["errors"].items():
                    print(f"ОШИБКА для ID {error_id}: {error_info}")

            # Проверяем успешно отправленные
            if "receipts" in receipt:
                for r_id, r_info in receipt["receipts"].items():
                    if "status" in r_info:
                        print(f"Статус для ID {r_id}: {r_info['status']}")
                    if "message" in r_info:
                        print(f"Сообщение: {r_info['message']}")
        else:
            print(f"Ошибка при получении статуса: {response.status_code} - {response.text}")

    except Exception as e:
        print(f"Ошибка при проверке статуса: {e}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Использование: python test_push.py <ExponentPushToken>")
        sys.exit(1)

    token = sys.argv[1]
    send_test_notification_expo(token)