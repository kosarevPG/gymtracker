import zipfile
with zipfile.ZipFile('../back.zip', 'w', zipfile.ZIP_DEFLATED) as z:
    z.write('index.py', 'index.py')
    z.write('ydb_store.py', 'ydb_store.py')
    z.write('requirements.txt', 'requirements.txt')
print('OK')
