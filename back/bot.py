import asyncio
import logging
import os
import json
import time
import cloudinary
import cloudinary.uploader
from aiohttp import web
from aiogram import Bot, Dispatcher
from aiogram.filters import Command
from aiogram.types import Message, WebAppInfo, InlineKeyboardMarkup, InlineKeyboardButton
from aiogram.enums import ParseMode
from dotenv import load_dotenv

from google_sheets import GoogleSheetsManager

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

BOT_TOKEN = os.getenv("BOT_TOKEN")
WEBAPP_URL = os.getenv("WEBAPP_URL")
# Render автоматически устанавливает PORT через переменную окружения
PORT = int(os.getenv("PORT", 8000))

# Логируем URL для отладки
logger.info(f"WEBAPP_URL from environment: {WEBAPP_URL}")
CREDENTIALS_PATH = os.getenv("GOOGLE_CREDENTIALS_PATH", "credentials.json")
SPREADSHEET_ID = os.getenv("SPREADSHEET_ID")

# Cloudinary настройки
CLOUDINARY_CLOUD_NAME = os.getenv("CLOUDINARY_CLOUD_NAME")
CLOUDINARY_API_KEY = os.getenv("CLOUDINARY_API_KEY")
CLOUDINARY_API_SECRET = os.getenv("CLOUDINARY_API_SECRET")

if CLOUDINARY_CLOUD_NAME and CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET:
    cloudinary.config(
        cloud_name=CLOUDINARY_CLOUD_NAME,
        api_key=CLOUDINARY_API_KEY,
        api_secret=CLOUDINARY_API_SECRET
    )
    logger.info("Cloudinary configured successfully")
else:
    logger.warning("Cloudinary credentials not found. Image upload will not work.")

bot = Bot(token=BOT_TOKEN, parse_mode=ParseMode.HTML)
dp = Dispatcher()

try:
    sheets = GoogleSheetsManager(credentials_path=CREDENTIALS_PATH, spreadsheet_id=SPREADSHEET_ID)
except Exception as e:
    logger.critical(f"Failed to init sheets: {e}")
    sheets = None

save_set_lock = asyncio.Lock()

@dp.message(Command("start"))
async def cmd_start(message: Message):
    logger.info(f"Command /start received. Using WEBAPP_URL: {WEBAPP_URL}")
    if not WEBAPP_URL:
        logger.error("WEBAPP_URL is not set!")
        await message.answer("❌ Ошибка: URL фронтенда не настроен. Обратитесь к администратору.")
        return
    
    # Добавляем параметр версии для обхода кеша Telegram
    import time
    cache_buster = int(time.time())
    webapp_url_with_version = f"{WEBAPP_URL.rstrip('/')}?v={cache_buster}"
    logger.info(f"WebApp URL with cache buster: {webapp_url_with_version}")
    
    kb = InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(text="🚀 Открыть GymApp", web_app=WebAppInfo(url=webapp_url_with_version))
    ]])
    await message.answer("Привет! Жми кнопку, чтобы начать тренировку 👇", reply_markup=kb)

def build_cors_headers(request=None):
    """CORS-заголовки: разрешаем Authorization, в preflight отражаем Access-Control-Request-Headers."""
    allow_headers = "Content-Type, Authorization"
    if request is not None:
        requested = request.headers.get("Access-Control-Request-Headers")
        if requested:
            allow_headers = requested
    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": allow_headers,
    }


def json_response(data, status=200, request=None):
    headers = build_cors_headers(request)
    return web.json_response(data, status=status, headers=headers)


async def handle_options(request):
    return json_response({"status": "ok"}, request=request)

async def api_init(request):
    try:
        data = sheets.get_all_exercises()
        return json_response(data)
    except Exception as e:
        return json_response({"error": str(e)}, 500)

async def api_history(request):
    ex_id = request.query.get('exercise_id')
    if not ex_id: return json_response({"error": "Missing exercise_id"}, 400)
    try:
        data = sheets.get_exercise_history(ex_id)
        return json_response(data)
    except Exception as e:
        return json_response({"error": str(e)}, 500)

async def api_global_history(request):
    try:
        data = sheets.get_global_history()
        return json_response(data)
    except Exception as e:
        return json_response({"error": str(e)}, 500)

async def api_analytics(request):
    """
    Аналитика v4.0 — Регулярность > Прогресс.
    
    Query params:
    - period: int (7, 14, 28) - период анализа в днях
    """
    try:
        period = int(request.query.get('period', 14))
        debug = request.query.get('debug') == '1'
        data = sheets.get_analytics_v4(period=period, debug=debug)
        return json_response(data)
    except Exception as e:
        logger.error(f"Analytics error: {e}", exc_info=True)
        return json_response({"error": str(e)}, 500)

async def api_confirm_baseline(request):
    """Подтвердить/отклонить/отложить proposal по Baseline"""
    try:
        data = await request.json()
        proposal_id = data.get('proposalId')
        action = data.get('action')  # CONFIRM | SNOOZE | DECLINE
        if not proposal_id or action not in ('CONFIRM', 'SNOOZE', 'DECLINE'):
            return json_response({"error": "Missing proposalId or invalid action"}, 400)
        result = sheets.confirm_baseline_proposal(proposal_id, action)
        return json_response(result)
    except Exception as e:
        logger.error(f"Confirm baseline error: {e}", exc_info=True)
        return json_response({"error": str(e)}, 500)

async def api_save_set(request):
    try:
        data = await request.json()
        async with save_set_lock:
            result = sheets.save_workout_set(data)
        if result.get('success'):
            return json_response({
                "status": "success",
                "row_number": result.get('row_number')  # Возвращаем номер строки для update
            })
        return json_response({"error": result.get('error', 'Failed to save')}, 500)
    except Exception as e:
        return json_response({"error": str(e)}, 500)

async def api_update_set(request):
    """Обновить запись подхода в Google Sheets (кг, повт, мин)"""
    try:
        data = await request.json()
        logger.info(f"api_update_set received: row_number={data.get('row_number')}, exercise_id={data.get('exercise_id')}")
        
        # row_number - приоритетный способ, fallback на search по exercise_id + set_group_id + order
        if not data.get('row_number') and (not data.get('set_group_id') or not data.get('exercise_id') or data.get('order') is None):
            return json_response({"error": "Missing row_number or (set_group_id, exercise_id, order)"}, 400)
        
        if sheets.update_workout_set(data):
            return json_response({"status": "success"})
        return json_response({"error": "Failed to update"}, 500)
    except Exception as e:
        logger.error(f"Update set error: {e}", exc_info=True)
        return json_response({"error": str(e)}, 500)

async def api_create_exercise(request):
    try:
        data = await request.json()
        if not data.get('name') or not data.get('group'):
            return json_response({"error": "Missing fields"}, 400)
        new_ex = sheets.create_exercise(data['name'], data['group'])
        return json_response(new_ex)
    except Exception as e:
        return json_response({"error": str(e)}, 500)

async def api_update_exercise(request):
    try:
        data = await request.json()
        logger.info(f"Received update request: {json.dumps(data, ensure_ascii=False)}") # ЛОГИРУЕМ ВЕСЬ ЗАПРОС
        
        updates = data.get('updates', {})
        logger.info(f"Updates keys: {list(updates.keys())}")
        
        if 'description' in updates:
            logger.info(f"Description present in updates. Value length: {len(updates['description'])}")
        else:
            logger.warning("Description MISSING in updates!")

        if sheets.update_exercise(data.get('id'), updates):
            return json_response({"status": "success"})
        return json_response({"error": "Failed"}, 500)
    except Exception as e:
        logger.error(f"Update exercise error: {e}", exc_info=True)
        return json_response({"error": str(e)}, 500)

async def api_ping(request):
    """Эндпоинт для пинга сервера, чтобы предотвратить засыпание на бесплатном тарифе Render"""
    return json_response({"status": "ok", "timestamp": int(time.time())})

async def api_upload_image(request):
    """Эндпоинт для загрузки изображения в Cloudinary"""
    if not CLOUDINARY_CLOUD_NAME or not CLOUDINARY_API_KEY or not CLOUDINARY_API_SECRET:
        return json_response({"error": "Cloudinary not configured"}, 500)
    
    try:
        # Получаем данные из multipart/form-data
        reader = await request.multipart()
        field = await reader.next()
        
        if field.name != 'image':
            return json_response({"error": "Missing 'image' field"}, 400)
        
        # Читаем файл
        image_data = await field.read()
        
        # Загружаем в Cloudinary
        result = cloudinary.uploader.upload(
            image_data,
            folder="gymapp/exercises",  # Папка в Cloudinary
            resource_type="image"
        )
        
        # Возвращаем URL изображения
        return json_response({
            "url": result.get('secure_url') or result.get('url'),
            "public_id": result.get('public_id')
        })
    except Exception as e:
        logger.error(f"Image upload error: {e}", exc_info=True)
        return json_response({"error": str(e)}, 500)

async def on_startup(app):
    asyncio.create_task(dp.start_polling(bot))

async def main():
    app = web.Application()
    app.router.add_routes([
        web.get('/api/init', api_init),
        web.get('/api/history', api_history),
        web.get('/api/global_history', api_global_history),
        web.get('/api/analytics', api_analytics),
        web.post('/api/confirm_baseline', api_confirm_baseline),
        web.get('/api/ping', api_ping),
        web.post('/api/save_set', api_save_set),
        web.post('/api/update_set', api_update_set),
        web.post('/api/create_exercise', api_create_exercise),
        web.post('/api/update_exercise', api_update_exercise),
        web.post('/api/upload_image', api_upload_image),
        web.options('/{tail:.*}', handle_options),
    ])
    
    app.on_startup.append(on_startup)
    
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "0.0.0.0", PORT)
    print(f"Server running at http://0.0.0.0:{PORT}")
    await site.start()
    await asyncio.Event().wait()

if __name__ == "__main__":
    asyncio.run(main())
