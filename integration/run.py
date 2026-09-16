"""Run isolated local services without printing credentials."""
import os, subprocess, sys
from pathlib import Path
root=Path(__file__).resolve().parents[1]
mode=sys.argv[1];env=os.environ.copy()
path=root/('.local/auth.env' if mode in ('auth','worker') else '.env.local')
for line in path.read_text().splitlines():
    if line and not line.startswith('#'):
        k,v=line.split('=',1);env[k]=v
cert=str(root/'.local/auth-config/.local/tls.crt')
if mode in ('auth','worker'):
    auth=Path(env['AUTH_SOURCE']);env['PYTHONPATH']=str(auth/'src');env['SSL_CERT_FILE']=cert
    if mode=='worker':
        subprocess.run([str(auth/'.venv/bin/saas-auth'),'private-tasks-once'],env=env,check=True);sys.exit(0)
    subprocess.run([str(auth/'.venv/bin/saas-auth'),'migrate'],env=env,check=True)
    os.execve(str(auth/'.venv/bin/uvicorn'),['uvicorn','saas_auth.api:create_app','--factory','--host','127.0.0.1','--port','59000','--no-access-log'],env)
elif mode=='migrate':
    subprocess.run(['node','scripts/migrate.ts'],cwd=root,env=env,check=True)
else:
    env['NODE_EXTRA_CA_CERTS']=cert
    os.chdir(root)
    os.execvpe('node',['node','integration/https.ts'],env)
