"""Loopback-only SMTP capture for real Auth invitation delivery tests."""
import asyncio, json
from pathlib import Path
from email import policy
from email.parser import BytesParser
from aiosmtpd.controller import Controller
root=Path(__file__).resolve().parents[1]
class Handler:
    async def handle_DATA(self, server, session, envelope):
        msg=BytesParser(policy=policy.default).parsebytes(envelope.content)
        path=root/'.local/latest-mail.json'
        path.write_text(json.dumps({'to':str(msg['To']),'text':msg.get_body(preferencelist=('plain',)).get_content() if msg.is_multipart() else msg.get_content()}))
        path.chmod(0o600)
        return '250 OK'
controller=Controller(Handler(),hostname='127.0.0.1',port=59025)
controller.start()
print('Local SMTP capture ready on 127.0.0.1:59025',flush=True)
asyncio.run(asyncio.Event().wait())
