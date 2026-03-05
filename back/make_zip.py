import zipfile
FILES = ['index.py', 'ydb_store.py', 'schemas.py', 'routes.py', 'requirements.txt']
with zipfile.ZipFile('../back.zip', 'w', zipfile.ZIP_DEFLATED) as z:
    for f in FILES:
        z.write(f, f)
print('OK')
