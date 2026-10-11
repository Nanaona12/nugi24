"""Dagang Pintar append-only local MySQL backup. Python 3.10+."""
import argparse, base64, hashlib, json, os, secrets, time
from pathlib import Path
from urllib.parse import urlsplit
import requests
import mysql.connector
from cryptography.hazmat.primitives.asymmetric import rsa, padding
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

ROOT = Path(__file__).resolve().parent
STATE = ROOT / '.device.json'

def b64(b): return base64.urlsafe_b64encode(b).decode().rstrip('=')
def unb64(s): return base64.urlsafe_b64decode(s + '=' * (-len(s) % 4))

def setup(url):
    if STATE.exists(): raise RuntimeError('Perangkat sudah disiapkan; jangan menimpa kunci lama.')
    parsed = urlsplit(url)
    if parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path not in ('', '/'):
        raise RuntimeError('Gunakan alamat utama aplikasi HTTPS tanpa path atau kredensial.')
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    token = secrets.token_urlsafe(32)
    pub = key.public_key().public_numbers()
    state = {'url': url.rstrip('/'), 'token': token, 'private_key': key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()).decode()}
    fd = os.open(STATE, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w') as f: json.dump(state, f)
    bundle = {'token_hash': hashlib.sha256(token.encode()).hexdigest(), 'public_key': {'kty': 'RSA', 'n': b64(pub.n.to_bytes(256, 'big')), 'e': b64(pub.e.to_bytes(3, 'big')), 'alg': 'RSA-OAEP-256', 'ext': True, 'key_ops': ['encrypt']}}
    (ROOT / 'pairing.json').write_text(json.dumps(bundle), encoding='utf-8')
    print('Buka pairing.json lalu salin isinya ke Backup MySQL di aplikasi. Jangan bagikan .device.json.')

def open_db():
    return mysql.connector.connect(host=os.getenv('MYSQL_HOST', '127.0.0.1'), port=int(os.getenv('MYSQL_PORT', '3306')), user=os.environ['MYSQL_USER'], password=os.environ['MYSQL_PASSWORD'], database=os.getenv('MYSQL_DATABASE', 'dagangpintar_backup'))

def decrypt(envelope, key):
    aes = key.decrypt(unb64(envelope['key']), padding.OAEP(mgf=padding.MGF1(hashes.SHA256()), algorithm=hashes.SHA256(), label=None))
    return json.loads(AESGCM(aes).decrypt(unb64(envelope['iv']), unb64(envelope['data']), None))

def persist_page(db, page):
    events = page['events']
    cur = db.cursor()
    try:
        for e in events:
            if e['tenant_id'] != page['tenant_id']: raise RuntimeError('Toko tidak cocok')
            try:
                cur.execute('INSERT INTO backup_history (tenant_id,seq,table_name,record_id,operation,payload,previous_payload,recorded_at) VALUES (%s,%s,%s,%s,%s,%s,%s,%s)', (e['tenant_id'],e['seq'],e['table_name'],e['record_id'],e['operation'],json.dumps(e['payload'],ensure_ascii=False),json.dumps(e['previous_payload'],ensure_ascii=False) if e.get('previous_payload') is not None else None,e['recorded_at']))
            except mysql.connector.IntegrityError as error:
                if error.errno != 1062: raise
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally: cur.close()

def once(state, key):
    db = open_db()
    try:
        # Cloud returns ascending committed events. Cursor comes only from successfully committed local rows.
        cur = db.cursor()
        cur.execute('SELECT tenant_id,MAX(seq) FROM backup_history GROUP BY tenant_id')
        rows = cur.fetchall(); cur.close()
        if len(rows)>1: raise RuntimeError('Gunakan satu database backup per toko')
        after = str(rows[0][1]) if rows else '0'
        while True:
            r = requests.post(state['url']+'/api/public/mysql-backup', headers={'Authorization':'Bearer '+state['token']}, json={'after':after}, timeout=90, allow_redirects=False)
            if r.status_code != 200: raise RuntimeError('Koneksi ditolak/gagal (HTTP '+str(r.status_code)+'); cek persetujuan perangkat dan alamat aplikasi')
            page = decrypt(r.json(), key)
            if rows and page['tenant_id'] != rows[0][0]: raise RuntimeError('Backup toko berbeda; gunakan database baru')
            expected = int(after) + 1
            for event in page['events']:
                if int(event['seq']) != expected: raise RuntimeError('Ada celah urutan; sinkron dihentikan tanpa memajukan penanda.')
                expected += 1
            persist_page(db,page)
            events=page['events']
            if events: after=events[-1]['seq']; print('Tersimpan sampai urutan',after)
            if not page['has_more']: break
    finally: db.close()

def main():
    parser=argparse.ArgumentParser(); parser.add_argument('--setup'); parser.add_argument('--once',action='store_true'); parser.add_argument('--interval',type=int,default=60)
    args=parser.parse_args()
    if args.setup: setup(args.setup); return
    state=json.loads(STATE.read_text()); key=serialization.load_pem_private_key(state['private_key'].encode(),password=None)
    while True:
        try: once(state,key)
        except Exception:
            print('Sinkron gagal. Riwayat lokal tidak dihapus; akan dicoba ulang. Periksa MySQL, internet, dan persetujuan perangkat.')
            if args.once: raise SystemExit(1)
        if args.once: break
        time.sleep(max(15,args.interval))
if __name__=='__main__': main()
