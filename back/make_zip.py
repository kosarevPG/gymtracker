import zipfile
FILES = ['index.py', 'db_utils.py', 'db_pool.py', 'exercises.py', 'sets.py', 'sessions.py', 'analytics.py', 'schemas.py', 'routes.py', 'requirements.txt']
with zipfile.ZipFile('../back.zip', 'w', zipfile.ZIP_DEFLATED) as z:
    for f in FILES:
        z.write(f, f)
print('OK')
