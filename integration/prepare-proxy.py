"""Prepare isolated example backend and request-signing keys for proxy integration."""
import os,secrets,json,uuid
from pathlib import Path
import psycopg
from psycopg import sql
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives import serialization
root=Path(__file__).resolve().parents[1];local=root/'.local'
if (local/'example.env').exists():raise SystemExit('Proxy config exists; reuse it.')
env=dict(l.split('=',1) for l in (local/'auth.env').read_text().splitlines())
password=secrets.token_urlsafe(32)
with psycopg.connect(env['SAAS_DATABASE_URL'],autocommit=True) as c:
 c.execute(sql.SQL('CREATE ROLE proxy_example LOGIN PASSWORD {}').format(sql.Literal(password)))
 c.execute('CREATE DATABASE proxy_example OWNER proxy_example')
key=rsa.generate_private_key(public_exponent=65537,key_size=2048)
(local/'app-private.pem').write_bytes(key.private_bytes(serialization.Encoding.PEM,serialization.PrivateFormat.PKCS8,serialization.NoEncryption()));(local/'app-private.pem').chmod(0o600)
(local/'app-public.pem').write_bytes(key.public_key().public_bytes(serialization.Encoding.PEM,serialization.PublicFormat.SubjectPublicKeyInfo))
app_id=str(uuid.uuid4())
(local/'example.env').write_text(f'EXAMPLE_DATABASE_URL=postgresql://proxy_example:{password}@127.0.0.1:55434/proxy_example\nEXAMPLE_APP_ID={app_id}\nEXAMPLE_PUBLIC_KEY_FILE={local}/app-public.pem\nEXAMPLE_ISSUER=https://127.0.0.1:58999\n')
(local/'example.env').chmod(0o600)
p=root/'.env.local';p.write_text(p.read_text()+f'\nPORTAL_APP_SIGNING_KEY_FILE={local}/app-private.pem\nPORTAL_APP_KEY_ID=portal-1\nPORTAL_ALLOWED_APP_ORIGINS=http://127.0.0.1:59200\n')
print('Configured isolated example database and proxy signing key.')
