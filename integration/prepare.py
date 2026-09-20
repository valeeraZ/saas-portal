"""Prepare disposable Portal/Auth test config, using Auth-owned realm generators."""
import os, json, secrets, shutil, subprocess, sys
from pathlib import Path
root=Path(__file__).resolve().parents[1]
auth=Path(os.environ['AUTH_SOURCE']).resolve()
local=root/'.local'
if (root/'.env.local').exists() or local.exists():
    raise SystemExit('Local config exists; reuse it. Do not overwrite credentials.')
work=local/'auth-config';(work/'scripts').mkdir(parents=True)
for name in ['prepare_local.py','realm_users.py','local_tls.py']:
    shutil.copyfile(auth/'scripts'/name,work/'scripts'/name)
subprocess.run([sys.executable,str(work/'scripts'/'prepare_local.py')],check=True)
env=dict(line.split('=',1) for line in (work/'.env').read_text().splitlines())
realm=work/'.local'/'saas-local-realm.json';data=json.loads(realm.read_text())
for c in data['clients']:
    if c['clientId']=='saas-portal':
        c['redirectUris']=['https://127.0.0.1:58999/api/auth/callback']
        c['attributes']['post.logout.redirect.uris']='https://127.0.0.1:58999/'
data['smtpServer']['port']='59025'
data['users'].append({'username':'local-member','enabled':True,'email':'local-member@example.com','emailVerified':True,'firstName':'Local','lastName':'Member','credentials':[{'type':'password','value':env['SAAS_LOCAL_USER_PASSWORD'],'temporary':False}]})
realm.write_text(json.dumps(data,indent=2)+'\n')
portal_password=secrets.token_urlsafe(32)
(local/'init.sql').write_text(f"CREATE USER portal PASSWORD '{portal_password}';\nCREATE DATABASE portal OWNER portal;\n")
def save(path, values):
    path.write_text(''.join(f'{k}={v}\n' for k,v in values.items()));path.chmod(0o600)
save(root/'.env.local',dict(PORTAL_REGISTRY_MODE='environment',PORTAL_ORIGIN='https://127.0.0.1:58999',PORTAL_OIDC_ISSUER='https://127.0.0.1:59443/realms/saas-local',PORTAL_OIDC_CLIENT_ID='saas-portal',PORTAL_OIDC_CLIENT_SECRET=env['SAAS_LOCAL_PORTAL_SECRET'],PORTAL_AUTH_URL='http://127.0.0.1:59000',PORTAL_ALLOW_LOCAL_HTTP='true',PORTAL_DATABASE_URL=f'postgresql://portal:{portal_password}@127.0.0.1:55434/portal',PORTAL_SESSION_KEY=__import__('base64').b64encode(secrets.token_bytes(32)).decode()))
save(local/'auth.env',dict(SAAS_DATABASE_URL=f"postgresql://saas_auth:{env['SAAS_POSTGRES_PASSWORD']}@127.0.0.1:55434/saas_auth_integration",SAAS_OIDC_ISSUER='https://127.0.0.1:59443/realms/saas-local',SAAS_CURSOR_SECRET=env['SAAS_CURSOR_SECRET'],SAAS_USER_CLIENTS='saas-portal',SAAS_INTROSPECTION_CLIENT='saas-auth',SAAS_INTROSPECTION_SECRET=env['SAAS_INTROSPECTION_SECRET'],SAAS_TASK_KEY=env['SAAS_TASK_KEY'],SAAS_SESSION_WORKER_CLIENT='saas-session-worker',SAAS_SESSION_WORKER_SECRET=env['SAAS_SESSION_WORKER_SECRET'],SAAS_INVITATION_URL='https://127.0.0.1:58999/invitations/accept',SAAS_SMTP_HOST='127.0.0.1',SAAS_SMTP_PORT='59025',SAAS_SMTP_FROM='noreply@example.com',SAAS_ALLOW_INSECURE_LOCAL='true',SAAS_SMTP_STARTTLS='false'))
print('Prepared isolated config; secrets remain in ignored files.')
